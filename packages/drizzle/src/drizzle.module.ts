/**
 * `DrizzleModule` — drop-in database module.
 *
 *   @Module({
 *     imports: [
 *       DrizzleModule.forRoot({
 *         dialect: 'bun-sqlite',
 *         connection: { filename: './data.db' },
 *         logging: true,
 *       }),
 *     ],
 *   })
 *   export class AppModule {}
 *
 * For Postgres:
 *   DrizzleModule.forRoot({
 *     dialect: 'postgres',
 *     connection: { url: process.env.DATABASE_URL! },
 *     pool: { max: 10 },
 *   });
 */
import { Module } from "@nexusts/core";
import { DrizzleService } from "./drizzle.service.js";
import type { DrizzleConfig } from "./types.js";
import { safeGetMeta, safeDefineMeta, safeHasMeta } from "@nexusts/core/di/safe-reflect";

@Module({
	providers: [
		DrizzleService,
		{ provide: DrizzleService.TOKEN, useExisting: DrizzleService },
	],
	exports: [DrizzleService, DrizzleService.TOKEN],
})
export class DrizzleModule {
	static forRoot(config: DrizzleConfig) {
		@Module({
			providers: [
				DrizzleService,
				{ provide: DrizzleService.TOKEN, useExisting: DrizzleService },
				{ provide: "DRIZZLE_CONFIG", useValue: config },
			],
			exports: [DrizzleService, DrizzleService.TOKEN],
		})
		class ConfiguredDrizzleModule {}
		Object.defineProperty(ConfiguredDrizzleModule, "name", {
			value: "ConfiguredDrizzleModule",
		});
		return ConfiguredDrizzleModule;
	}
}
