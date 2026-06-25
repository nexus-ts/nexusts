/**
 * `EventsModule` — drop-in module for adding pub/sub to a NexusTS app.
 *
 * Usage:
 *   // src/app/app.module.ts
 *   @Module({
 *     imports: [EventsModule.forRoot()],
 *   })
 *   export class AppModule {}
 *
 *   // any service
 *   @Injectable()
 *   class EmailListeners {
 *     constructor(@Inject(EventService.TOKEN) private events: EventService) {}
 *
 *     @OnEvent('user.created')
 *     async onUserCreated(p: { email: string }) {
 *       await sendEmail(p.email, 'welcome');
 *     }
 *   }
 *
 *   // bootstrap
 *   const app = new Application(AppModule);
 *   const events = app.container.resolve(EventService);
 *   scanForListeners(emailListenersInstance, events);
 *   await events.emit('user.created', { email: 'a@b.c' });
 */

import { Module } from "@nexusts/core";
import { EventService } from "./event.service.js";
import type { EventsConfig } from "./types.js";
import { safeGetMeta, safeDefineMeta, safeHasMeta } from "@nexusts/core/di/safe-reflect";

@Module({
	providers: [
		EventService,
		{ provide: EventService.TOKEN, useExisting: EventService },
	],
	exports: [EventService, EventService.TOKEN],
})
export class EventsModule {
	static forRoot(config: EventsConfig = {}) {
		@Module({
			providers: [
				EventService,
				{ provide: EventService.TOKEN, useExisting: EventService },
				{ provide: "EVENTS_CONFIG", useValue: config },
			],
			exports: [EventService, EventService.TOKEN],
		})
		class ConfiguredEventsModule {}

		Object.defineProperty(ConfiguredEventsModule, "name", {
			value: "ConfiguredEventsModule",
		});

		return ConfiguredEventsModule;
	}
}
