/**
 * `SessionModule` — drop-in module for adding sessions to a NexusTS
 * app.
 *
 * Usage:
 *   // src/app/app.module.ts
 *   @Module({
 *     imports: [
 *       SessionModule.forRoot({
 *         backend: 'cookie',
 *         cookie: { secret: process.env.SESSION_SECRET! },
 *       }),
 *     ],
 *   })
 *   export class AppModule {}
 *
 *   // any controller
 *   @Controller('/cart')
 *   class CartController {
 *     @Post('/')
 *     add(@Session() session: SessionRecord) {
 *       const cart = (session.data.cart ?? []) as Item[];
 *       // ...
 *       return this.sessionService.update(session.id, { dataPatch: { cart } });
 *     }
 *   }
 */

import { Module } from "@nexusts/core";
import { SessionService } from "./session.service.js";
import type { SessionConfig } from "./types.js";
import { safeGetMeta, safeDefineMeta, safeHasMeta } from "@nexusts/core/di/safe-reflect";

@Module({
	providers: [
		SessionService,
		{ provide: SessionService.TOKEN, useExisting: SessionService },
	],
	exports: [SessionService, SessionService.TOKEN],
})
export class SessionModule {
	static forRoot(config: SessionConfig = {}) {
		@Module({
			providers: [
				SessionService,
				{ provide: SessionService.TOKEN, useExisting: SessionService },
				{ provide: "SESSION_CONFIG", useValue: config },
			],
			exports: [SessionService, SessionService.TOKEN],
		})
		class ConfiguredSessionModule {}

		Object.defineProperty(ConfiguredSessionModule, "name", {
			value: "ConfiguredSessionModule",
		});

		return ConfiguredSessionModule;
	}
}
