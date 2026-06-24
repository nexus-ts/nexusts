import type { CircuitSnapshot, ResilienceStore } from "../types.js";

export interface RedisResilienceStoreOptions {
	/** Key prefix. Default: `"nexus:circuit:"`. */
	keyPrefix?: string;
	/** TTL in seconds for each snapshot entry. Default: 3600 (1h). */
	ttlSeconds?: number;
}

/**
 * Cross-pod circuit state backed by Redis.
 * Accepts any `RedisClient`-compatible object (from `@nexusts/redis`).
 *
 *   const client = await createRedisClient({ url: process.env.REDIS_URL });
 *   const store  = new RedisResilienceStore(client);
 *
 *   ResilienceModule.forRoot({ store });
 */
export class RedisResilienceStore implements ResilienceStore {
	#client: any;
	#prefix: string;
	#ttl: number;

	constructor(client: any, opts: RedisResilienceStoreOptions = {}) {
		this.#client = client;
		this.#prefix = opts.keyPrefix ?? "nexus:circuit:";
		this.#ttl = opts.ttlSeconds ?? 3600;
	}

	#key(name: string): string {
		return `${this.#prefix}${name}`;
	}

	async getSnapshot(name: string): Promise<CircuitSnapshot | null> {
		const raw = await this.#client.get(this.#key(name));
		if (!raw) return null;
		try {
			return JSON.parse(raw) as CircuitSnapshot;
		} catch {
			return null;
		}
	}

	async saveSnapshot(name: string, snapshot: CircuitSnapshot): Promise<void> {
		await this.#client.set(this.#key(name), JSON.stringify(snapshot), {
			ex: this.#ttl,
		});
	}

	async close(): Promise<void> {
		await this.#client.close();
	}
}
