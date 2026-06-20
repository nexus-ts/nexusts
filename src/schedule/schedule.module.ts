/**
 * `ScheduleModule` — drop-in module for adding scheduled tasks to a
 * NexusJS app.
 *
 * Usage:
 *   // src/app/app.module.ts
 *   @Module({
 *     imports: [
 *       ScheduleModule.forRoot({
 *         backend: 'memory',          // or 'cloudflare'
 *         defaultTimezone: 'UTC',
 *       }),
 *     ],
 *   })
 *   export class AppModule {}
 *
 *   // any service
 *   @Injectable()
 *   class CleanupWorker {
 *     constructor(@Inject(ScheduleService.TOKEN) private schedule: ScheduleService) {}
 *
 *     @Cron('0 * * * *')                     // every hour
 *     async hourly() {
 *       // ...
 *     }
 *   }
 *
 *   // bootstrap
 *   const app = new Application(AppModule);
 *   const schedule = app.container.resolve(ScheduleService);
 *   await scanForSchedulers(worker, schedule);
 *   schedule.start();
 */

import "reflect-metadata";
import { Module } from "../core/decorators/module.js";
import { ScheduleService } from "./schedule.service.js";
import type { ScheduleConfig } from "./types.js";

@Module({
	providers: [
		ScheduleService,
		{ provide: ScheduleService.TOKEN, useExisting: ScheduleService },
	],
	exports: [ScheduleService, ScheduleService.TOKEN],
})
export class ScheduleModule {
	/**
	 * Build a configured `ScheduleModule` class.
	 */
	static forRoot(config: ScheduleConfig = {}) {
		@Module({
			providers: [
				ScheduleService,
				{ provide: ScheduleService.TOKEN, useExisting: ScheduleService },
				{ provide: "SCHEDULE_CONFIG", useValue: config },
			],
			exports: [ScheduleService, ScheduleService.TOKEN],
		})
		class ConfiguredScheduleModule {}

		Object.defineProperty(ConfiguredScheduleModule, "name", {
			value: "ConfiguredScheduleModule",
		});

		return ConfiguredScheduleModule;
	}
}
