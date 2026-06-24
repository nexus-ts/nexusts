/**
 * In-memory session storage.
 *
 * LRU-evicting map for tests and single-instance dev. The same map is
 * also useful for mocking in unit tests — `create()` / `read()` /
 * `update()` / `destroy()` round-trip without any I/O.
 */

import type {
	CreateSessionOptions,
	SessionData,
	SessionQuery,
	SessionRecord,
	SessionStorage,
	UpdateSessionOptions,
} from "../types.js";

export interface MemoryStorageOptions {
	/** GC interval in ms. Default: 60_000. */
	gcIntervalMs?: number;
	/** Max sessions in memory before evicting LRU. Default: 100_000. */
	maxSessions?: number;
}

function randomId(bytes = 24): string {
	const arr = new Uint8Array(bytes);
	crypto.getRandomValues(arr);
	return Buffer.from(arr).toString("base64url");
}

export class MemorySessionStorage implements SessionStorage {
	readonly name = "memory" as const;
	#sessions = new Map<string, SessionRecord>();
	#gcHandle: ReturnType<typeof setInterval> | null = null;
	#maxSessions: number;
	#gcIntervalMs: number;

	constructor(options: MemoryStorageOptions = {}) {
		this.#maxSessions = options.maxSessions ?? 100_000;
		this.#gcIntervalMs = options.gcIntervalMs ?? 60_000;
	}

	/** Start the GC interval. Idempotent. */
	start(): void {
		if (this.#gcHandle) return;
		this.#gcHandle = setInterval(() => void this.gc(), this.#gcIntervalMs);
		const h = this.#gcHandle as { unref?: () => void };
		if (typeof h.unref === "function") h.unref();
	}

	async stop(): Promise<void> {
		if (this.#gcHandle) clearInterval(this.#gcHandle);
		this.#gcHandle = null;
	}

	// ===========================================================================
	// SessionStorage API
	// ===========================================================================

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
		if (opts.metadata) record.metadata = opts.metadata;
		this.#sessions.set(record.id, record as unknown as SessionRecord);
		this.#evictIfFull();
		return record;
	}

	async read(id: string): Promise<SessionRecord | null> {
		const r = this.#sessions.get(id);
		if (!r) return null;
		if (this.#isExpired(r)) {
			this.#sessions.delete(id);
			return null;
		}
		// Touch — sliding expiry.
		const now = new Date();
		r.lastSeenAt = now;
		r.expiresAt = new Date(
			now.getTime() +
				Math.max(60_000, r.expiresAt.getTime() - r.lastSeenAt.getTime()),
		);
		this.#sessions.set(id, r); // refresh LRU position
		return r;
	}

	async readMany(query: SessionQuery = {}): Promise<SessionRecord[]> {
		const now = Date.now();
		const list: SessionRecord[] = [];
		for (const r of this.#sessions.values()) {
			if (this.#isExpired(r)) continue;
			if (query.userId !== undefined && r.userId !== query.userId) continue;
			if (query.metadata) {
				if (
					query.metadata.ipAddress &&
					r.metadata?.ipAddress !== query.metadata.ipAddress
				)
					continue;
				if (
					query.metadata.userAgent &&
					r.metadata?.userAgent !== query.metadata.userAgent
				)
					continue;
			}
			list.push(r);
			if (query.limit && list.length >= (query.offset ?? 0) + query.limit)
				break;
		}
		const offset = query.offset ?? 0;
		const limit = query.limit ?? list.length;
		return list.slice(offset, offset + limit);
	}

	async update<T = SessionData>(
		id: string,
		opts: UpdateSessionOptions<T>,
	): Promise<SessionRecord<T> | null> {
		const r = this.#sessions.get(id);
		if (!r) return null;
		if (this.#isExpired(r)) {
			this.#sessions.delete(id);
			return null;
		}
		if (opts.dataPatch) {
			r.data = { ...r.data, ...opts.dataPatch } as SessionData;
		}
		if (opts.extendSeconds !== undefined) {
			const newExpiry = Date.now() + opts.extendSeconds * 1000;
			if (!r.absoluteExpiresAt || newExpiry < r.absoluteExpiresAt.getTime()) {
				r.expiresAt = new Date(newExpiry);
			}
		}
		r.lastSeenAt = new Date();
		this.#sessions.set(id, r);
		return r as unknown as SessionRecord<T>;
	}

	async destroy(id: string): Promise<boolean> {
		return this.#sessions.delete(id);
	}

	async destroyMany(query: SessionQuery): Promise<number> {
		const ids: string[] = [];
		for (const [id, r] of this.#sessions) {
			if (query.userId !== undefined && r.userId !== query.userId) continue;
			ids.push(id);
		}
		for (const id of ids) this.#sessions.delete(id);
		return ids.length;
	}

	async touch(id: string): Promise<SessionRecord | null> {
		return this.read(id);
	}

	async gc(): Promise<number> {
		const now = Date.now();
		let removed = 0;
		for (const [id, r] of this.#sessions) {
			if (this.#isExpired(r, now)) {
				this.#sessions.delete(id);
				removed++;
			}
		}
		return removed;
	}

	async clear(): Promise<void> {
		this.#sessions.clear();
	}

	// ===========================================================================
	// Internal
	// ===========================================================================

	#isExpired(r: SessionRecord, now = Date.now()): boolean {
		if (r.expiresAt.getTime() <= now) return true;
		if (r.absoluteExpiresAt && r.absoluteExpiresAt.getTime() <= now)
			return true;
		return false;
	}

	#evictIfFull(): void {
		if (this.#sessions.size <= this.#maxSessions) return;
		// LRU: delete the oldest-touched entry (Map preserves insertion order;
		// since we re-`set()` on touch, the first key is the least recently touched).
		const oldest = this.#sessions.keys().next().value;
		if (oldest) this.#sessions.delete(oldest);
	}
}
