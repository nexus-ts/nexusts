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
import "reflect-metadata";
import { Module } from "../core/decorators/module.js";
import { CacheService } from "./cache.service.js";
import { MemoryStore } from "./stores/memory.js";
import type { CacheConfig } from "./types.js";

@Module({
	providers: [
		CacheService,
		{ provide: CacheService.TOKEN, useExisting: CacheService },
	],
	exports: [CacheService, CacheService.TOKEN],
})
export class CacheModule {
	static forRoot(config: CacheConfig = {}) {
		const cfg: CacheConfig = {
			store: new MemoryStore(),
			...config,
		};
		@Module({
			providers: [
				CacheService,
				{ provide: CacheService.TOKEN, useExisting: CacheService },
				{ provide: "CACHE_CONFIG", useValue: cfg },
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
