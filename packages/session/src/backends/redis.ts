/**
 * `RedisSessionStorage` — session storage backed by `nexusjs/redis`.
 *
 * Works on **Bun** (`Bun.redis`), **Node** (`ioredis`), and any
 * other runtime via the runtime-aware `nexusjs/redis` package. For
 * Cloudflare Workers / Pages KV storage, use
 * `CloudflareKVSessionStorage` instead — same API, different
 * adapter.
 *
 * Each session is stored as a JSON-serialized `SessionRecord`
 * under `<prefix><id>`. Expiry is enforced via the KV store's
 * own TTL (Redis `EX`, KV `expirationTtl`).
 *
 *   import { SessionService } from 'nexusjs/session';
 *   import { RedisSessionStorage, createRedisClient } from 'nexusjs/redis';
 *
 *   const redis = createRedisClient({ url: 'redis://localhost:6379' });
 *   const storage = new RedisSessionStorage(redis, { keyPrefix: 'sess:' });
 *
 * Per-user lookups: a per-user index key
 * `<prefix>user:<crc32(userId)>` stores the list of session ids
 * for that user. The index is updated on `create` / `update`
 * and pruned by `gc()`.
 */

import type { RedisClient } from "@nexusts/redis";
import type {
	CreateSessionOptions,
	SessionData,
	SessionQuery,
	SessionRecord,
	SessionStorage,
	UpdateSessionOptions,
} from "../types.js";

const DEFAULT_KEY_PREFIX = "session:";

export class RedisSessionStorage implements SessionStorage {
	readonly name: "redis" | "cloudflare-kv" = "redis" as const;
	#client: RedisClient;
	#keyPrefix: string;

	constructor(client: RedisClient, options: { keyPrefix?: string } = {}) {
		this.#client = client;
		this.#keyPrefix = options.keyPrefix ?? DEFAULT_KEY_PREFIX;
	}

	#key(id: string): string {
		return `${this.#keyPrefix}${id}`;
	}

	#indexKey(userId: string): string {
		return `${this.#keyPrefix}user:${crc32(userId)}`;
	}

	#recordToJSON(record: SessionRecord): string {
		return JSON.stringify({
			id: record.id,
			userId: record.userId,
			data: record.data,
			createdAt: record.createdAt.toISOString(),
			lastSeenAt: record.lastSeenAt.toISOString(),
			expiresAt: record.expiresAt.toISOString(),
			...(record.absoluteExpiresAt
				? { absoluteExpiresAt: record.absoluteExpiresAt.toISOString() }
				: {}),
			...(record.metadata ? { metadata: record.metadata } : {}),
		});
	}

	#recordFromJSON(s: string): SessionRecord | null {
		try {
			const obj = JSON.parse(s) as Record<string, unknown>;
			const record: SessionRecord = {
				id: String(obj["id"]),
				userId: (obj["userId"] as string | null) ?? null,
				data: (obj["data"] as SessionData) ?? ({} as SessionData),
				createdAt: new Date(String(obj["createdAt"])),
				lastSeenAt: new Date(String(obj["lastSeenAt"])),
				expiresAt: new Date(String(obj["expiresAt"])),
			};
			const abs = obj["absoluteExpiresAt"];
			if (typeof abs === "string") record.absoluteExpiresAt = new Date(abs);
			const meta = obj["metadata"];
			if (meta && typeof meta === "object") {
				record.metadata = meta as SessionRecord["metadata"];
			}
			return record;
		} catch {
			return null;
		}
	}

	#ttlSeconds(record: SessionRecord): number {
		const now = Date.now();
		const exp = record.expiresAt.getTime();
		return Math.max(1, Math.floor((exp - now) / 1000));
	}

	async create<T = SessionData>(
		opts: CreateSessionOptions<T>,
	): Promise<SessionRecord<T>> {
		const now = new Date();
		const ttl = (opts.ttlSeconds ?? 60 * 60 * 24 * 7) * 1000;
		const record: SessionRecord<T> = {
			id: opts.id ?? randomId(),
			userId: null,
			data: (opts.data ?? {}) as T,
			createdAt: now,
			lastSeenAt: now,
			expiresAt: new Date(now.getTime() + ttl),
		};
		if (opts.absoluteTtlSeconds) {
			record.absoluteExpiresAt = new Date(
				now.getTime() + opts.absoluteTtlSeconds * 1000,
			);
		}
		if (opts.userId !== undefined) record.userId = opts.userId;
		if (opts.metadata) record.metadata = opts.metadata;
		// Persist immediately. The session service treats create() as
		// side-effecting; without this, the rest of the lifecycle
		// (read/update/destroy) operates on a record that was never
		// written.
		await this.#client.set(this.#key(record.id), this.#recordToJSON(record as SessionRecord), {
			ex: Math.max(1, Math.floor((record.expiresAt.getTime() - Date.now()) / 1000)),
		});
		if (record.userId) await this.#addToIndex(record.userId, record.id);
		return record;
	}

	async read(id: string): Promise<SessionRecord | null> {
		const raw = await this.#client.get(this.#key(id));
		if (raw === null) return null;
		const record = this.#recordFromJSON(raw);
		if (!record) return null;
		// Defensive absolute-expiry check.
		if (
			record.absoluteExpiresAt &&
			record.absoluteExpiresAt.getTime() <= Date.now()
		) {
			await this.#client.del(this.#key(id));
			return null;
		}
		return record;
	}

	async readMany(query?: SessionQuery): Promise<SessionRecord[]> {
		if (query?.userId) {
			const idxKey = this.#indexKey(query.userId);
			const idx = await this.#client.get(idxKey);
			const ids: string[] = idx ? safeParseStringArray(idx) : [];
			const out: SessionRecord[] = [];
			for (const id of ids) {
				const r = await this.read(id);
				if (r) out.push(r);
				else if (query.metadata === undefined) {
					// Session expired; remove from index lazily.
					await this.#removeFromIndex(query.userId, id);
				}
			}
			return applyPagination(out, query);
		}
		// Full scan via the KV store's SCAN-equivalent.
		const out: SessionRecord[] = [];
		let cursor: string | number = "0";
		do {
			const res = await this.#client.scan({
				match: `${this.#keyPrefix}*`,
				cursor,
				count: 100,
			});
			for (const k of res.keys) {
				if (k.startsWith(`${this.#keyPrefix}user:`)) continue; // skip index
				const id = k.startsWith(this.#keyPrefix)
					? k.slice(this.#keyPrefix.length)
					: k;
				const r = await this.read(id);
				if (r) out.push(r);
			}
			cursor = res.cursor;
		} while (cursor !== "0" && cursor !== 0);
		return applyPagination(out, query);
	}

	async update<T = SessionData>(
		id: string,
		opts: UpdateSessionOptions<T>,
	): Promise<SessionRecord<T> | null> {
		const existing = (await this.read(id)) as SessionRecord<T> | null;
		if (!existing) return null;
		const next: SessionRecord<T> = {
			...existing,
			lastSeenAt: new Date(),
		};
		if (opts.dataPatch) {
			next.data = { ...(existing.data as object), ...(opts.dataPatch as object) } as T;
		}
		if (opts.extendSeconds !== undefined) {
			const newExpiry = Date.now() + opts.extendSeconds * 1000;
			if (
				!next.absoluteExpiresAt ||
				newExpiry < next.absoluteExpiresAt.getTime()
			) {
				next.expiresAt = new Date(newExpiry);
			}
		}
		const userIdChanged = opts.userId !== undefined && opts.userId !== existing.userId;
		if (opts.userId !== undefined) next.userId = opts.userId;
		await this.#client.set(this.#key(id), this.#recordToJSON(next as SessionRecord), {
			ex: this.#ttlSeconds(next as SessionRecord),
		});
		if (userIdChanged) {
			await this.#removeFromIndex(existing.userId, id);
		}
		if (next.userId) await this.#addToIndex(next.userId, id);
		return next;
	}

	async destroy(id: string): Promise<boolean> {
		const existing = await this.read(id);
		if (!existing) return false;
		if (existing.userId) await this.#removeFromIndex(existing.userId, id);
		await this.#client.del(this.#key(id));
		return true;
	}

	async destroyMany(query: SessionQuery): Promise<number> {
		const sessions = await this.readMany(query);
		for (const s of sessions) await this.destroy(s.id);
		return sessions.length;
	}

	async touch(id: string): Promise<SessionRecord | null> {
		const existing = await this.read(id);
		if (!existing) return null;
		const next: SessionRecord = {
			...existing,
			lastSeenAt: new Date(),
			expiresAt: new Date(
				Date.now() + 60 * 60 * 24 * 7 * 1000, // 7d
			),
		};
		await this.#client.set(this.#key(id), this.#recordToJSON(next as SessionRecord), {
			ex: this.#ttlSeconds(next),
		});
		return next;
	}

	async gc(): Promise<number> {
		// KV stores evict on TTL; this sweeps orphaned index entries.
		let cursor: string | number = "0";
		let removed = 0;
		do {
			const res = await this.#client.scan({
				match: `${this.#keyPrefix}user:*`,
				cursor,
				count: 100,
			});
			for (const k of res.keys) {
				const raw = await this.#client.get(this.#keyPrefix + k);
				const ids = raw ? safeParseStringArray(raw) : [];
				const live: string[] = [];
				for (const id of ids) {
					if (await this.read(id)) live.push(id);
				}
				if (live.length === 0) {
					await this.#client.del(this.#keyPrefix + k);
					removed++;
				} else if (live.length !== ids.length) {
					await this.#client.set(
						this.#keyPrefix + k,
						JSON.stringify(live),
					);
				}
			}
			cursor = res.cursor;
		} while (cursor !== "0" && cursor !== 0);
		return removed;
	}

	async clear(): Promise<void> {
		let cursor: string | number = "0";
		do {
			const res = await this.#client.scan({
				match: `${this.#keyPrefix}*`,
				cursor,
				count: 100,
			});
			for (const k of res.keys) {
				await this.#client.del(this.#keyPrefix + k);
			}
			cursor = res.cursor;
		} while (cursor !== "0" && cursor !== 0);
	}

	async stop(): Promise<void> {
		// Some adapters (NodeRedis) have sockets to close. Memory /
		// Bun / Cloudflare adapters are no-ops here, so we just
		// call close() which is safe to call multiple times.
		await this.#client.close();
	}

	/* ------------- internals ------------- */

	async #addToIndex(userId: string, sessionId: string): Promise<void> {
		const k = this.#indexKey(userId);
		const raw = await this.#client.get(k);
		const ids = raw ? safeParseStringArray(raw) : [];
		if (!ids.includes(sessionId)) ids.push(sessionId);
		await this.#client.set(k, JSON.stringify(ids));
	}

	async #removeFromIndex(
		userId: string | null,
		sessionId: string,
	): Promise<void> {
		if (!userId) return;
		const k = this.#indexKey(userId);
		const raw = await this.#client.get(k);
		if (!raw) return;
		const ids = safeParseStringArray(raw).filter((id) => id !== sessionId);
		if (ids.length === 0) {
			await this.#client.del(k);
		} else {
			await this.#client.set(k, JSON.stringify(ids));
		}
	}
}

/**
 * `CloudflareKVSessionStorage` — Cloudflare Workers KV backed
 * session storage. Same interface as `RedisSessionStorage`; the
 * underlying `RedisClient` is a `CloudflareKVAdapter` from
 * `nexusjs/redis`.
 */
export class CloudflareKVSessionStorage extends RedisSessionStorage {
	override readonly name: "cloudflare-kv" = "cloudflare-kv" as const;
}

function randomId(bytes = 24): string {
	const arr = new Uint8Array(bytes);
	crypto.getRandomValues(arr);
	let s = "";
	for (const b of arr) s += String.fromCharCode(b);
	return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function safeParseStringArray(raw: string): string[] {
	try {
		const v = JSON.parse(raw);
		return Array.isArray(v) ? v.filter((x) => typeof x === "string") : [];
	} catch {
		return [];
	}
}

function applyPagination(
	list: SessionRecord[],
	query: SessionQuery | undefined,
): SessionRecord[] {
	if (!query) return list;
	const offset = query.offset ?? 0;
	const limit = query.limit ?? list.length;
	return list.slice(offset, offset + limit);
}

/** Tiny CRC32 for deterministic index keying. */
function crc32(s: string): string {
	let c = 0xffffffff;
	for (let i = 0; i < s.length; i++) {
		c ^= s.charCodeAt(i);
		for (let k = 0; k < 8; k++) {
			c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
		}
	}
	return (c ^ 0xffffffff).toString(16);
}
