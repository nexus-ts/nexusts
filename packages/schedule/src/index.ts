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
 *   import { Module } from 'nexusjs';
 *   import { ScheduleModule } from 'nexusjs/schedule';
 *
 *   @Module({
 *     imports: [ScheduleModule.forRoot({ backend: 'memory' })],
 *   })
 *   export class AppModule {}
 *
 *   // any service
 *   import { ScheduleService, Cron, Interval, scanForSchedulers } from 'nexusjs/schedule';
 *
 *   @Injectable()
 *   class CleanupWorker {
 *     constructor(@Inject(ScheduleService.TOKEN) private schedule: ScheduleService) {}
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

export type {
	CloudflareScheduledEvent,
	CloudflareSchedulesOptions,
} from "./backends/cloudflare.js";
export {
	CloudflareSchedulesBackend,
	CronExpr,
	MemorySchedulesBackend,
} from "./backends/index.js";
export type { MemoryBackendOptions } from "./backends/memory.js";
export {
	CronExpression as CronExpressionClass,
	CronField,
	nextCron,
	parseCron,
} from "./cron-parser.js";
export {
	Cron,
	getCronHooks,
	getIntervalHooks,
	getTimeoutHooks,
	Interval,
	scanForSchedulers,
	Timeout,
} from "./decorators/cron.js";
export { ScheduleModule } from "./schedule.module.js";
export { ScheduleService } from "./schedule.service.js";
export * from "./types.js";
