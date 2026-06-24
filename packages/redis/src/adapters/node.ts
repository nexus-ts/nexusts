/**
 * Node.js runtime adapter for `nexusjs/redis`.
 *
 * Uses the `ioredis` package. The package is an **optional**
 * peer dependency of `nexusjs` — install it only when targeting
 * Node:
 *
 *     bun add ioredis
 *
 * The adapter opens a single shared client per `RedisConfig` and
 * reuses it across `get` / `set` / `del` / `scan` calls. Use
 * `await client.close()` to release the connection.
 */

import type {
	RedisClient,
	RedisConfig,
	RedisScanOptions,
	RedisScanResult,
	RedisSetOptions,
	RedisValue,
} from "../types.js";

/** The shape we need from `ioredis`. We don't depend on the
 * package at the type level so users who don't install it
 * still type-check. */
interface IORedisLike {
	get(key: string): Promise<string | null>;
	set(
		key: string,
		value: string,
		modeOrEx?: string | number,
		duration?: number,
		flag?: "NX" | "XX",
	): Promise<"OK" | null>;
	del(key: string | string[]): Promise<number>;
	exists(key: string): Promise<number>;
	incr(key: string): Promise<number>;
	expire(key: string, seconds: number): Promise<number>;
	scan(
		cursor: number | string,
		match: string,
		count: number,
	): Promise<[string | number, string[]]>;
	quit(): Promise<"OK">;
	disconnect(): void;
}

export class NodeRedisAdapter implements RedisClient {
	readonly adapter = "node" as const;
	private client: IORedisLike | null = null;
	private readonly url: string;
	private readonly keyPrefix: string;
	private readonly defaultTtlSeconds: number;
	private readonly nodeOptions: Record<string, unknown>;

	constructor(config: RedisConfig = {}) {
		this.url = config.url ?? process.env["REDIS_URL"] ?? "redis://localhost:6379";
		this.keyPrefix = config.keyPrefix ?? "";
		this.defaultTtlSeconds = config.defaultTtlSeconds ?? 0;
		this.nodeOptions = config.nodeOptions ?? {};
	}

	private async getClient(): Promise<IORedisLike> {
		if (this.client) return this.client;
		try {
			const mod = await import("ioredis");
			const Ctor = (mod as any).default ?? (mod as any);
			if (typeof Ctor !== "function") {
				throw new Error("ioredis module did not export a constructor");
			}
			this.client = new Ctor(this.url, this.nodeOptions) as IORedisLike;
		} catch (err) {
			throw new Error(
				"NodeRedisAdapter requires the `ioredis` package. " +
					"Install with: bun add ioredis",
			);
		}
		return this.client!;
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
		return (await this.getClient()).get(this.k(key));
	}

	async set(key: string, value: string, options?: RedisSetOptions): Promise<void> {
		const ex = options?.ex ?? this.defaultTtlSeconds ?? undefined;
		const c = await this.getClient();
		const fullKey = this.k(key);
		// ioredis set signature: set(key, value, EX, seconds, NX|XX) or
		// set(key, value, NX|XX). We dispatch on the combination of
		// flags.
		if (options?.nx) {
			await c.set(fullKey, value, "EX", ex ?? 0, "NX");
		} else if (options?.xx) {
			await c.set(fullKey, value, "EX", ex ?? 0, "XX");
		} else if (ex) {
			await c.set(fullKey, value, "EX", ex);
		} else {
			await c.set(fullKey, value);
		}
	}

	async del(key: string): Promise<number> {
		return (await this.getClient()).del(this.k(key));
	}

	async exists(key: string): Promise<boolean> {
		const n = await (await this.getClient()).exists(this.k(key));
		return n > 0;
	}

	async incr(key: string, by = 1, options?: { ex?: number }): Promise<number> {
		const fullKey = this.k(key);
		const c = await this.getClient();
		let value: number;
		if (by === 1) {
			value = await c.incr(fullKey);
		} else {
			// ioredis doesn't have incrby with delta? It does — use
			// the multi-step: `incrby` is the ioredis method. Patch
			// the IORedisLike to include it.
			value = await (c as unknown as { incrby: (k: string, n: number) => Promise<number> }).incrby(fullKey, by);
		}
		if (options?.ex && value === by) {
			await c.expire(fullKey, options.ex);
		}
		return value;
	}

	async scan(options: RedisScanOptions = {}): Promise<RedisScanResult> {
		const cursor = typeof options.cursor === "number" || typeof options.cursor === "string"
			? options.cursor
			: 0;
		const [next, keys] = await (await this.getClient()).scan(
			cursor,
			options.match ?? "*",
			options.count ?? 100,
		);
		return {
			cursor: next,
			keys: (keys ?? []).map((k) => this.stripPrefix(k)),
		};
	}

	async close(): Promise<void> {
		if (this.client) {
			try {
				await this.client.quit();
			} catch {
				this.client.disconnect();
			}
			this.client = null;
		}
	}
}
