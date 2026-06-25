/**
 * `FeatureFlagModule` — drop-in feature flags.
 *
 *   @Module({
 *     imports: [
 *       FeatureFlagModule.forRoot({
 *         flags: {
 *           'new-dashboard': { enabled: true, rollout: 0.5 },
 *           'beta-api':      false,
 *         },
 *       }),
 *     ],
 *   })
 *   export class AppModule {}
 */
import { Module } from "@nexusts/core";
import { FeatureFlagService } from "./feature-flag.service.js";
import type { FeatureFlagConfig } from "./types.js";
import { safeGetMeta, safeDefineMeta, safeHasMeta } from "@nexusts/core/di/safe-reflect";

@Module({
	providers: [
		FeatureFlagService,
		{ provide: FeatureFlagService.TOKEN, useExisting: FeatureFlagService },
	],
	exports: [FeatureFlagService, FeatureFlagService.TOKEN],
})
export class FeatureFlagModule {
	static forRoot(config: FeatureFlagConfig = {}) {
		@Module({
			providers: [
				FeatureFlagService,
				{ provide: FeatureFlagService.TOKEN, useExisting: FeatureFlagService },
				{ provide: "FEATURE_FLAG_CONFIG", useValue: config },
			],
			exports: [FeatureFlagService, FeatureFlagService.TOKEN],
		})
		class ConfiguredFeatureFlagModule {}
		Object.defineProperty(ConfiguredFeatureFlagModule, "name", {
			value: "ConfiguredFeatureFlagModule",
		});
		return ConfiguredFeatureFlagModule;
	}
}
