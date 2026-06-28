/**
 * `RedisModule` — wires `RedisClient` into the DI container.
 *
 *   @Module({
 *     imports: [
 *       RedisModule.forRoot({
 *         adapter: "bun",            // or "node" | "cloudflare" | "memory"
 *         url: "redis://localhost:6379",
 *         keyPrefix: "myapp:",
 *       }),
 *     ],
 *   })
 *   class AppModule {}
 *
 *   @Injectable()
 *   class UserService {
 *     @Inject(REDIS_CLIENT_TOKEN) declare private redis: RedisClient;
 *     async countVisits(userId: string) {
 *       return this.redis.incr(`visits:${userId}`, 1, { ex: 60 * 60 });
 *     }
 *   }
 *
 * Most users won't import `RedisModule` directly — the
 * `SessionModule` and `CacheModule` use it under the hood when
 * the user configures a `redis` / `cloudflare-kv` backend.
 */

import { Module } from "@nexusts/core";
import { createRedisClient } from "./adapters/index.js";
import type { RedisConfig } from "./types.js";

export const REDIS_CLIENT_TOKEN = Symbol.for("nexus:RedisClient");

@Module({
	providers: [
		{
			provide: REDIS_CLIENT_TOKEN,
			useFactory: () => createRedisClient(),
		},
	],
	exports: [REDIS_CLIENT_TOKEN],
})
export class RedisModule {
	static forRoot(config: RedisConfig = {}) {
		@Module({
			providers: [
				{
					provide: REDIS_CLIENT_TOKEN,
					useFactory: () => createRedisClient(config),
				},
				{ provide: "REDIS_CONFIG", useValue: config },
			],
			exports: [REDIS_CLIENT_TOKEN, "REDIS_CONFIG"],
		})
		class ConfiguredRedisModule {}
		Object.defineProperty(ConfiguredRedisModule, "name", {
			value: "ConfiguredRedisModule",
		});
		return ConfiguredRedisModule as unknown as typeof RedisModule;
	}
}
