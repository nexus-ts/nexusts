/**
 * `ShieldModule` — drop-in security middleware suite.
 *
 *   @Module({
 *     imports: [
 *       ShieldModule.forRoot({
 *         csrf: { enabled: true },
 *         hsts: { maxAge: 31_536_000, includeSubDomains: true },
 *         csp: { directives: { defaultSrc: ["'self'"] } },
 *         xFrameOptions: 'SAMEORIGIN',
 *         xContentTypeOptions: true,
 *         referrerPolicy: 'strict-origin-when-cross-origin',
 *       }),
 *     ],
 *   })
 *   export class AppModule {}
 */
import { Module } from "@nexusts/core";
import { ShieldService } from "./shield.service.js";
import type { ShieldConfig } from "./types.js";
import { safeGetMeta, safeDefineMeta, safeHasMeta } from "@nexusts/core/di/safe-reflect";

@Module({
	providers: [
		ShieldService,
		{ provide: ShieldService.TOKEN, useExisting: ShieldService },
	],
	exports: [ShieldService, ShieldService.TOKEN],
})
export class ShieldModule {
	static forRoot(config: ShieldConfig = {}) {
		@Module({
			providers: [
				ShieldService,
				{ provide: ShieldService.TOKEN, useExisting: ShieldService },
				{ provide: "SHIELD_CONFIG", useValue: config },
			],
			exports: [ShieldService, ShieldService.TOKEN],
		})
		class ConfiguredShieldModule {}
		Object.defineProperty(ConfiguredShieldModule, "name", {
			value: "ConfiguredShieldModule",
		});
		return ConfiguredShieldModule;
	}
}
