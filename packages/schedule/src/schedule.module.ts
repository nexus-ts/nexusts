/**
 * `ScheduleModule` — drop-in module for adding scheduled tasks.
 *
 * Usage:
 *   @Module({
 *     imports: [ScheduleModule.forRoot({ backend: 'memory' })],
 *   })
 *   export class AppModule {}
 *
 *   @Injectable()
 *   class Worker {
 *     @Cron('0 * * * *')
 *     async hourly() { ... }
 *   }
 *
 * No manual scanForSchedulers or start() call needed — the module
 * auto-scans every resolved provider during bootstrap.
 */

import { Module, setScheduleScanner } from "@nexusts/core";
import { ScheduleService } from "./schedule.service.js";
import { scanProviderForSchedules } from "./scanner.js";
import type { ScheduleConfig } from "./types.js";
import { safeGetMeta, safeDefineMeta, safeHasMeta } from "@nexusts/core/di/safe-reflect";

// Register the scanner hook once at module load time.
setScheduleScanner(scanProviderForSchedules);

@Module({
	providers: [
		ScheduleService,
		{ provide: ScheduleService.TOKEN, useExisting: ScheduleService },
	],
	exports: [ScheduleService, ScheduleService.TOKEN],
})
export class ScheduleModule {
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
