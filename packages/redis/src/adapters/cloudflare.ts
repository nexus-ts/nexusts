/**
 * Cloudflare Workers KV adapter for `nexusjs/redis`.
 *
 * Workers KV is **not** Redis, but the surface is close enough
 * that the same `RedisClient` API can sit on top of it. The
 * adapter:
 *
 * - Maps `set(key, value, { ex })` to `KVNamespace.put()` with
 *   `expirationTtl` (seconds).
 * - Maps `scan({ match })` to `KVNamespace.list({ prefix })`,
 *   which is the closest thing KV offers to Redis `SCAN MATCH`.
 *   The `cursor` field is a Cloudflare opaque string.
 * - `del` uses `KVNamespace.delete()`.
 * - `incr` falls back to a small read-modify-write: get the
 *   value, parse as int, add, put back. (KV doesn't have
 *   atomic INCR.) Use with care — concurrent writes can lose
 *   updates. For high-contention counters use a real Redis.
 *
 * Cloudflare imposes a 25 MB value limit per key and a global
 * 100k reads / 1000 writes per second per KV namespace. Don't
 * store large objects in KV.
 *
 * To use:
 *
 *   // In a Worker request handler:
 *   const client = createRedisClient({
 *     adapter: "cloudflare",
 *     kv: c.env.SESSIONS,   // KVNamespace binding from wrangler.toml
 *   });
 */

import type {
	KVNamespaceLike,
	RedisClient,
	RedisConfig,
	RedisScanOptions,
	RedisScanResult,
	RedisSetOptions,
	RedisValue,
} from "../types.js";

export class CloudflareKVAdapter implements RedisClient {
	readonly adapter = "cloudflare" as const;
	private kv: KVNamespaceLike | null = null;
	private readonly keyPrefix: string;
	private readonly defaultTtlSeconds: number;

	constructor(config: RedisConfig = {}) {
		this.keyPrefix = config.keyPrefix ?? "";
		this.defaultTtlSeconds = config.defaultTtlSeconds ?? 0;
		if (config.kv) this.kv = config.kv;
	}

	private getKV(): KVNamespaceLike {
		if (this.kv) return this.kv;
		// Auto-detect from `globalThis.env` (Workers context).
		const env = (globalThis as unknown as { env?: { KV?: KVNamespaceLike } }).env;
		if (env?.KV) {
			this.kv = env.KV;
			return this.kv;
		}
		throw new Error(
			"CloudflareKVAdapter could not find a KV binding. " +
				"Pass it explicitly via RedisConfig({ kv }) or run inside a " +
				"Workers request handler where `c.env.KV` is available.",
		);
	}

	private k(key: string): string {
		return this.keyPrefix + key;
	}

	private stripPrefix(key: string): string {
		return this.keyPrefix && key.startsWith(this.keyPrefix)
			? key.slice(this.keyPrefix.length)
			: key;
	}

	async get(key: string): Promise<RedisValue> {
		return this.getKV().get(this.k(key));
	}

	async set(key: string, value: string, options?: RedisSetOptions): Promise<void> {
		const ex = options?.ex ?? this.defaultTtlSeconds ?? undefined;
		if (ex && ex > 0) {
			await this.getKV().put(this.k(key), value, { expirationTtl: ex });
		} else {
			await this.getKV().put(this.k(key), value);
		}
	}

	async del(key: string): Promise<number> {
		// KV.delete returns void; we conservatively return 1 if a value
		// existed before, 0 otherwise.
		const existed = (await this.getKV().get(this.k(key))) !== null;
		await this.getKV().delete(this.k(key));
		return existed ? 1 : 0;
	}

	async exists(key: string): Promise<boolean> {
		return (await this.getKV().get(this.k(key))) !== null;
	}

	async incr(key: string, by = 1, options?: { ex?: number }): Promise<number> {
		// Naive read-modify-write. KV doesn't have atomic INCR. Don't
		// use this for high-contention counters.
		const fullKey = this.k(key);
		const raw = await this.getKV().get(fullKey);
		const current = raw ? Number.parseInt(raw, 10) || 0 : 0;
		const next = current + by;
		const ex = options?.ex ?? this.defaultTtlSeconds ?? undefined;
		if (ex && ex > 0) {
			await this.getKV().put(fullKey, String(next), { expirationTtl: ex });
		} else {
			await this.getKV().put(fullKey, String(next));
		}
		return next;
	}

	async scan(options: RedisScanOptions = {}): Promise<RedisScanResult> {
		// KV.list() supports `prefix` only — convert a `match` glob
		// to a prefix. Full glob support would require client-side
		// filtering. The cursor is a Cloudflare opaque string.
		const match = options.match ?? "*";
		const prefix = globToPrefix(match, this.keyPrefix);
		const res = await this.getKV().list({
			prefix,
			limit: options.count ?? 100,
			cursor: typeof options.cursor === "string" ? options.cursor : undefined,
		});
		return {
			cursor: res.cursor,
			keys: (res.keys ?? []).map((k) => this.stripPrefix(k.name)),
		};
	}

	async close(): Promise<void> {
		// KV has no client to close.
	}
}

/** Convert a Redis-style glob (`*`, `?`, `[abc]`) to a KV prefix. */
function globToPrefix(glob: string, keyPrefix: string): string {
	// Everything up to the first glob meta-character.
	const meta = /[*?[]/.exec(glob);
	const base = meta ? glob.slice(0, meta.index) : glob;
	return (keyPrefix ?? "") + base;
}
