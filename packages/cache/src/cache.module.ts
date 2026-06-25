/**
 * `CacheModule` — drop-in caching.
 *
 *   @Module({
 *     imports: [
 *       CacheModule.forRoot({
 *         store: new MemoryStore({ max: 50_000 }),
 *         defaultTtl: 300,        // 5 min
 *         prefix: 'myapp',
 *       }),
 *     ],
 *   })
 *   export class AppModule {}
 */
import { Module } from "@nexusts/core";
import { CacheService } from "./cache.service.js";
import { MemoryStore } from "./stores/memory.js";
import { RedisCacheStore } from "./stores/redis.js";
import type { CacheConfig } from "./types.js";
import { safeGetMeta, safeDefineMeta, safeHasMeta } from "@nexusts/core/di/safe-reflect";

@Module({
	providers: [
		CacheService,
		{ provide: CacheService.TOKEN, useExisting: CacheService },
	],
	exports: [CacheService, CacheService.TOKEN],
})
export class CacheModule {
	static forRoot(config: CacheConfig = {}) {
		@Module({
			providers: [
				CacheService,
				{ provide: CacheService.TOKEN, useExisting: CacheService },
				{
					provide: "CACHE_CONFIG",
					useFactory: async () => {
						// Explicit store wins; otherwise fall back to backend shorthand.
						if (config.store) {
							return { ...config };
						}
						if (config.backend === "redis") {
							const { createRedisClient } = await import("@nexusts/redis");
							const { keyPrefix, ...redisOpts } = config.redis ?? {};
							const client = createRedisClient(redisOpts);
							return {
								...config,
								store: new RedisCacheStore(client, { keyPrefix }),
							};
						}
						return { ...config, store: new MemoryStore() };
					},
				},
			],
			exports: [CacheService, CacheService.TOKEN],
		})
		class ConfiguredCacheModule {}
		Object.defineProperty(ConfiguredCacheModule, "name", {
			value: "ConfiguredCacheModule",
		});
		return ConfiguredCacheModule;
	}
}
