/**
 * `nexusjs/redis` — runtime-aware Redis-compatible key/value client.
 *
 * Public API:
 * - `createRedisClient(config)` — factory; auto-detects the runtime
 *   when `config.adapter` is omitted.
 * - `RedisClient` — the minimal interface every adapter implements.
 * - `detectRedisRuntime()` — returns "bun" | "node" | "cloudflare" | "memory".
 * - Adapters: `BunRedisAdapter` (Bun built-in, no dep),
 *   `NodeRedisAdapter` (`ioredis` peer), `CloudflareKVAdapter`
 *   (Workers KV, no dep), `MemoryRedisAdapter` (always available).
 * - `RedisModule.forRoot(config)` — DI wiring.
 *
 * Runtime auto-detection:
 *
 * | Runtime              | Adapter         | External dep |
 * | -------------------- | --------------- | ------------ |
 * | Bun                  | `bun`           | none (Bun.redis built-in) |
 * | Node.js              | `node`          | `ioredis` (optional peer) |
 * | Cloudflare Workers   | `cloudflare`    | none (Workers KV) |
 * | (other / no signal)  | `memory`        | none |
 *
 * Same API across runtimes — `nexusjs/session`, `nexusjs/cache`, and
 * `nexusjs/queue` (where applicable) all use the `RedisClient`
 * interface so a single config switch chooses the backend.
 *
 *   bun add ioredis          # only for Node runtime
 *   bun add @cloudflare/workers-types  # only for Cloudflare TS types
 */

export {
	BunRedisAdapter,
	CloudflareKVAdapter,
	createRedisClient,
	detectRedisRuntime,
	MemoryRedisAdapter,
	NodeRedisAdapter,
} from "./adapters/index.js";
export { REDIS_CLIENT_TOKEN, RedisModule } from "./module.js";
export type {
	KVNamespaceLike,
	RedisAdapterKind,
	RedisClient,
	RedisConfig,
	RedisCursor,
	RedisKey,
	RedisScanOptions,
	RedisScanResult,
	RedisSetOptions,
	RedisValue,
} from "./types.js";
