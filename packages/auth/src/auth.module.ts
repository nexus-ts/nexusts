/**
 * `AuthModule` — drop-in module for adding auth to any NexusTS app.
 *
 * Usage:
 *   // src/app/app.module.ts
 *   @Module({
 *     imports: [AuthModule.forRoot({ ... })],
 *   })
 *   export class AppModule {}
 *
 * The `forRoot` static factory builds a one-off `AuthModule` subclass
 * pre-configured with the user's `auth` config. The provider token
 * `'AUTH_CONFIG'` carries the config to the `AuthService` constructor.
 *
 * AuthService is registered under **both** its class token and
 * `AuthService.TOKEN` (a Symbol). The class token is what the
 * container scans; the Symbol is what `@Inject(AuthService.TOKEN)`
 * looks up. Both resolve to the same instance via `useExisting`.
 */

import { Module } from "@nexusts/core";
import { AuthController } from "./auth.controller.js";
import { AuthService } from "./auth.service.js";
import type { AuthConfig } from "./types.js";
import { safeGetMeta, safeDefineMeta, safeHasMeta } from "@nexusts/core/di/safe-reflect";

@Module({
	controllers: [AuthController],
	providers: [
		AuthService,
		{ provide: AuthService.TOKEN, useExisting: AuthService },
	],
	exports: [AuthService, AuthService.TOKEN],
})
export class AuthModule {
	/**
	 * Build a configured `AuthModule` class with the given config.
	 *
	 * The returned class can be `imports`-ed by any other module and
	 * will provide the `AuthService` (and a `AUTH_CONFIG` value
	 * provider) to its container.
	 */
	static forRoot(config: AuthConfig) {
		@Module({
			controllers: [AuthController],
			providers: [
				AuthService,
				{ provide: AuthService.TOKEN, useExisting: AuthService },
				{ provide: "AUTH_CONFIG", useValue: config },
			],
			exports: [AuthService, AuthService.TOKEN],
		})
		class ConfiguredAuthModule {}

		// Tag the dynamic class so the user can see where it came from.
		Object.defineProperty(ConfiguredAuthModule, "name", {
			value: "ConfiguredAuthModule",
		});

		return ConfiguredAuthModule;
	}
}
