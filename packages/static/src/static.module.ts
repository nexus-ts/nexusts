/**
 * `StaticModule` — drop-in module for static file serving.
 *
 * Usage:
 *   @Module({
 *     imports: [
 *       StaticModule.forRoot({
 *         root: './public',
 *         prefix: '/public',
 *         cacheControl: 'public, max-age=86400',
 *       }),
 *     ],
 *   })
 *   export class AppModule {}
 *
 * Then `GET /public/*` serves files from `./public/*` with proper
 * Content-Type, ETag, and Range support.
 */

import { Module } from "@nexusts/core";
import { StaticService } from "./static.service.js";
import type { ServeStaticOptions } from "./static.service.js";
import { safeGetMeta, safeDefineMeta, safeHasMeta } from "@nexusts/core/di/safe-reflect";

@Module({
	providers: [
		StaticService,
		{ provide: StaticService.TOKEN, useExisting: StaticService },
	],
	exports: [StaticService, StaticService.TOKEN],
})
export class StaticModule {
	static forRoot(options: ServeStaticOptions = {}) {
		@Module({
			providers: [
				StaticService,
				{ provide: StaticService.TOKEN, useExisting: StaticService },
				{ provide: "STATIC_OPTIONS", useValue: options },
			],
			exports: [StaticService, StaticService.TOKEN],
		})
		class ConfiguredStaticModule {}

		Object.defineProperty(ConfiguredStaticModule, "name", {
			value: "ConfiguredStaticModule",
		});

		return ConfiguredStaticModule;
	}

	/**
	 * Convenience: create a middleware handler and mount it directly
	 * on the Hono app. Useful in `main.ts` to serve static files
	 * without going through DI.
	 *
	 * ```ts
	 * import { StaticModule } from 'nexusjs/static';
	 * const app = new Application(AppModule);
	 * app.server.app.use('/static/*', StaticModule.mount({
	 *   root: './public',
	 *   prefix: '/static',
	 * }));
	 * ```
	 */
	static mount(options: ServeStaticOptions = {}) {
		const svc = new StaticService(options);
		return svc.middleware();
	}
}
