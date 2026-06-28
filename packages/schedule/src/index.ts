/**
 * Public API for the NexusTS schedule module.
 *
 * Two backends out of the box:
 *   - In-process — runs on Bun / Node via setInterval + cron tick.
 *   - Cloudflare Cron Triggers — Workers-native, fires from wrangler.toml.
 *
 * Mirrors `@nestjs/schedule`'s decorator API: `@Cron`, `@Interval`,
 * `@Timeout`. Plus a programmatic `ScheduleService` for dynamic
 * registration.
 *
 * Quick start:
 *
 *   // src/app/app.module.ts
 *   import { Module } from '@nexusts/core';
 *   import { ScheduleModule } from '@nexusts/schedule';
 *
 *   @Module({
 *     imports: [ScheduleModule.forRoot({ backend: 'memory' })],
 *   })
 *   export class AppModule {}
 *
 *   // any service
 *   import { ScheduleService, Cron, Interval, scanForSchedulers } from '@nexusts/schedule';
 *
 *   @Injectable()
 *   class CleanupWorker {
 *     @Inject(ScheduleService.TOKEN) declare private schedule: ScheduleService;
 *
 *     @Cron('0 * * * *')                     // every hour
 *     async hourly() { /* ... *\/ }
 *
 *     @Interval(60_000)                      // every minute
 *     async tick() { /* ... *\/ }
 *   }
 *
 *   // bootstrap
 *   const app = new Application(AppModule);
 *   const schedule = app.container.resolve(ScheduleService);
 *   await scanForSchedulers(worker, schedule);
 *   schedule.start();
 */

export * from "./types.js";
export {
	MemorySchedulesBackend,
	CloudflareSchedulesBackend,
	CronExpr,
} from "./backends/index.js";
export type { MemoryBackendOptions } from "./backends/memory.js";
export type {
	CloudflareScheduledEvent,
	CloudflareSchedulesOptions,
} from "./backends/cloudflare.js";
export { ScheduleService } from "./schedule.service.js";
export { ScheduleModule } from "./schedule.module.js";
export {
	Cron,
	Interval,
	Timeout,
	scanForSchedulers,
	getCronHooks,
	getIntervalHooks,
	getTimeoutHooks,
} from "./decorators/cron.js";
export {
	parseCron,
	nextCron,
	CronExpression as CronExpressionClass,
	CronField,
} from "./cron-parser.js";
