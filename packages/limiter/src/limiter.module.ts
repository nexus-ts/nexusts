/**
 * `LimiterModule` — drop-in rate limiter.
 *
 *   @Module({
 *     imports: [
 *       LimiterModule.forRoot({
 *         rules: [
 *           { path: '/api/*', points: 100, duration: '1m' },
 *           { path: '/login', points: 5,   duration: '1m' },
 *         ],
 *       }),
 *     ],
 *   })
 *   export class AppModule {}
 */
import { Module } from "@nexusts/core";
import { LimiterService } from "./limiter.service.js";
import { LimiterMiddleware } from "./limiter.middleware.js";
import { MemoryRateLimitStorage } from "./backends/memory.js";
import type { LimiterConfig } from "./types.js";
import { safeGetMeta, safeDefineMeta, safeHasMeta } from "@nexusts/core/di/safe-reflect";

@Module({
	providers: [
		LimiterService,
		{ provide: LimiterService.TOKEN, useExisting: LimiterService },
		LimiterMiddleware,
		{ provide: LimiterMiddleware.TOKEN, useExisting: LimiterMiddleware },
	],
	exports: [
		LimiterService,
		LimiterService.TOKEN,
		LimiterMiddleware,
		LimiterMiddleware.TOKEN,
	],
})
export class LimiterModule {
	static forRoot(config: LimiterConfig = {}) {
		// Default to an in-memory storage if the user didn't supply one.
		const cfg: LimiterConfig = {
			storage: new MemoryRateLimitStorage(),
			...config,
		};
		@Module({
			providers: [
				LimiterService,
				{ provide: LimiterService.TOKEN, useExisting: LimiterService },
				LimiterMiddleware,
				{ provide: LimiterMiddleware.TOKEN, useExisting: LimiterMiddleware },
				{ provide: "LIMITER_CONFIG", useValue: cfg },
			],
			exports: [
				LimiterService,
				LimiterService.TOKEN,
				LimiterMiddleware,
				LimiterMiddleware.TOKEN,
			],
		})
		class ConfiguredLimiterModule {}
		Object.defineProperty(ConfiguredLimiterModule, "name", {
			value: "ConfiguredLimiterModule",
		});
		return ConfiguredLimiterModule;
	}
}
