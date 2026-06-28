/**
 * In-memory adapter for `@nexusts/redis`.
 *
 * Used for tests and single-process dev. Not cluster-safe; values
 * don't survive process restart.
 */

import type {
	RedisClient,
	RedisConfig,
	RedisScanOptions,
	RedisScanResult,
	RedisSetOptions,
	RedisValue,
} from "../types.js";

interface Entry {
	value: string;
	expiresAt: number | null; // ms epoch; null = no expiry
}

export class MemoryRedisAdapter implements RedisClient {
	readonly adapter = "memory" as const;
	private data = new Map<string, Entry>();
	private readonly keyPrefix: string;
	private readonly defaultTtlSeconds: number;

	constructor(config: RedisConfig = {}) {
		this.keyPrefix = config.keyPrefix ?? "";
		this.defaultTtlSeconds = config.defaultTtlSeconds ?? 0;
	}

	private k(key: string): string {
		return this.keyPrefix + key;
	}

	private stripPrefix(key: string): string {
		return this.keyPrefix && key.startsWith(this.keyPrefix)
			? key.slice(this.keyPrefix.length)
			: key;
	}

	private isExpired(e: Entry | undefined): e is undefined {
		return !e || (e.expiresAt !== null && e.expiresAt < Date.now());
	}

	private purge(key: string): void {
		const e = this.data.get(key);
		if (this.isExpired(e)) this.data.delete(key);
	}

	async get(key: string): Promise<RedisValue> {
		const k = this.k(key);
		this.purge(k);
		const e = this.data.get(k);
		return e ? e.value : null;
	}

	async set(key: string, value: string, options?: RedisSetOptions): Promise<void> {
		const k = this.k(key);
		const ttl =
			options?.ex !== undefined
				? options.ex
				: options?.px !== undefined
					? options.px / 1000
					: this.defaultTtlSeconds;
		const expiresAt = ttl && ttl > 0 ? Date.now() + ttl * 1000 : null;
		if (options?.nx && !this.isExpired(this.data.get(k))) return; // NX semantics
		if (options?.xx && this.isExpired(this.data.get(k))) return; // XX semantics
		this.data.set(k, { value, expiresAt });
	}

	async del(key: string): Promise<number> {
		const k = this.k(key);
		const existed = this.data.delete(k);
		return existed ? 1 : 0;
	}

	async exists(key: string): Promise<boolean> {
		const k = this.k(key);
		this.purge(k);
		return this.data.has(k);
	}

	async incr(key: string, by = 1, options?: { ex?: number }): Promise<number> {
		const k = this.k(key);
		this.purge(k);
		const e = this.data.get(k);
		const current = e ? Number.parseInt(e.value, 10) || 0 : 0;
		const next = current + by;
		const ttl = options?.ex ?? this.defaultTtlSeconds ?? undefined;
		const expiresAt = ttl && ttl > 0 ? Date.now() + ttl * 1000 : null;
		this.data.set(k, { value: String(next), expiresAt });
		return next;
	}

	async scan(options: RedisScanOptions = {}): Promise<RedisScanResult> {
		const match = options.match ?? "*";
		// The match pattern is matched against the full key (with
		// prefix included). Callers should write patterns that
		// include the prefix.
		const re = globToRegex(match);
		const keys: string[] = [];
		for (const k of this.data.keys()) {
			if (this.keyPrefix && !k.startsWith(this.keyPrefix)) continue;
			if (re.test(k)) keys.push(this.stripPrefix(k));
		}
		return { cursor: "0", keys };
	}

	async close(): Promise<void> {
		this.data.clear();
	}
}

function globToRegex(glob: string): RegExp {
	const escaped = glob
		.replace(/[.+^${}()|[\]\\]/g, "\\$&")
		.replace(/\*/g, ".*")
		.replace(/\?/g, ".");
	return new RegExp(`^${escaped}$`);
}
