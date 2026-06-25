/**
 * `DriveModule` — drop-in file storage.
 *
 *   @Module({
 *     imports: [
 *       DriveModule.forRoot({
 *         driver: new LocalDriver({ root: '/var/data' }),
 *       }),
 *     ],
 *   })
 *   export class AppModule {}
 */
import { Module } from "@nexusts/core";
import { DriveService } from "./drive.service.js";
import { MemoryDriver } from "./drivers/memory.js";
import type { DriveConfig } from "./types.js";
import { safeGetMeta, safeDefineMeta, safeHasMeta } from "@nexusts/core/di/safe-reflect";

@Module({
	providers: [
		DriveService,
		{ provide: DriveService.TOKEN, useExisting: DriveService },
	],
	exports: [DriveService, DriveService.TOKEN],
})
export class DriveModule {
	static forRoot(config: DriveConfig = {}) {
		const cfg: DriveConfig = {
			driver: new MemoryDriver(),
			...config,
		};
		@Module({
			providers: [
				DriveService,
				{ provide: DriveService.TOKEN, useExisting: DriveService },
				{ provide: "DRIVE_CONFIG", useValue: cfg },
			],
			exports: [DriveService, DriveService.TOKEN],
		})
		class ConfiguredDriveModule {}
		Object.defineProperty(ConfiguredDriveModule, "name", {
			value: "ConfiguredDriveModule",
		});
		return ConfiguredDriveModule;
	}
}
