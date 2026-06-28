/**
 * Bun runtime adapter for `@nexusts/redis`.
 *
 * Uses the built-in `Bun.redis` client. No extra package needed.
 * The client is lazily opened on first use.
 */

import type {
	RedisClient,
	RedisConfig,
	RedisScanOptions,
	RedisScanResult,
	RedisSetOptions,
	RedisValue,
} from "../types.js";

/** The shape we need from `Bun.redis()`. */
interface BunRedisClient {
	get(key: string): Promise<string | null>;
	set(
		key: string,
		value: string,
		options?: { EX?: number; PX?: number; NX?: boolean; XX?: boolean },
	): Promise<"OK" | null>;
	del(key: string): Promise<number>;
	exists(key: string): Promise<number>;
	incr(key: string): Promise<number>;
	scan(cursor: number, options?: { MATCH?: string; COUNT?: number }): Promise<{
		cursor: number;
		keys: string[];
	}>;
	close(): void | Promise<void>;
}

export class BunRedisAdapter implements RedisClient {
	readonly adapter = "bun" as const;
	private client: BunRedisClient | null = null;
	private readonly url: string;
	private readonly keyPrefix: string;
	private readonly defaultTtlSeconds: number;

	constructor(config: RedisConfig = {}) {
		this.url = config.url ?? process.env.REDIS_URL ?? "redis://localhost:6379";
		this.keyPrefix = config.keyPrefix ?? "";
		this.defaultTtlSeconds = config.defaultTtlSeconds ?? 0;
	}

	private getClient(): BunRedisClient {
		if (this.client) return this.client;
		// Bun.redis is a global; cast through unknown so we can compile
		// in environments that don't have Bun's lib.d.ts loaded.
		const bun = (globalThis as unknown as { Bun?: { redis: (url: string) => BunRedisClient } }).Bun;
		if (!bun || typeof bun.redis !== "function") {
			throw new Error(
				"BunRedisAdapter can only be used in a Bun runtime. " +
					"On Node, use NodeRedisAdapter (install ioredis).",
			);
		}
		this.client = bun.redis(this.url);
		return this.client!;
	}

	private k(key: string): string {
		return this.keyPrefix + key;
	}

	async get(key: string): Promise<RedisValue> {
		return this.getClient().get(this.k(key));
	}

	async set(key: string, value: string, options?: RedisSetOptions): Promise<void> {
		const ex = options?.ex ?? this.defaultTtlSeconds ?? undefined;
		const px = options?.px ?? undefined;
		const bunOpts: { EX?: number; PX?: number; NX?: boolean; XX?: boolean } = {};
		if (ex) bunOpts.EX = ex;
		if (px) bunOpts.PX = px;
		if (options?.nx) bunOpts.NX = true;
		if (options?.xx) bunOpts.XX = true;
		await this.getClient().set(this.k(key), value, bunOpts);
	}

	async del(key: string): Promise<number> {
		return this.getClient().del(this.k(key));
	}

	async exists(key: string): Promise<boolean> {
		return (await this.getClient().exists(this.k(key))) > 0;
	}

	async incr(key: string, by = 1, options?: { ex?: number }): Promise<number> {
		const fullKey = this.k(key);
		const client = this.getClient();
		const value = await client.incr(fullKey);
		// On the first increment (value === 1), apply the TTL if requested.
		if (options?.ex && value === by) {
			await client.set(fullKey, String(value), { EX: options.ex });
		}
		return value;
	}

	async scan(options: RedisScanOptions = {}): Promise<RedisScanResult> {
		const cursor = typeof options.cursor === "number" ? options.cursor : 0;
		const res = await this.getClient().scan(cursor, {
			MATCH: options.match ?? "*",
			COUNT: options.count ?? 100,
		});
		return {
			cursor: res.cursor,
			keys: (res.keys ?? []).map((k) =>
				this.keyPrefix && k.startsWith(this.keyPrefix)
					? k.slice(this.keyPrefix.length)
					: k,
			),
		};
	}

	async close(): Promise<void> {
		if (this.client) {
			await this.client.close();
			this.client = null;
		}
	}
}
