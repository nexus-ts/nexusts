/**
 * `ConfigModule` — drop-in module for typed, validated configuration.
 *
 * Usage:
 *   // src/config/schema.ts
 *   import { z } from 'zod';
 *   export const configSchema = z.object({
 *     DATABASE_URL: z.string().url(),
 *     PORT: z.coerce.number().default(3000),
 *     LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
 *   });
 *
 *   // src/app/app.module.ts
 *   @Module({
 *     imports: [
 *       ConfigModule.forRoot({
 *         schema: configSchema,
 *         envFilePaths: ['.env.local', '.env'],
 *       }),
 *     ],
 *   })
 *   export class AppModule {}
 *
 *   // any service
 *   class MyService {
 *     constructor(@Inject(ConfigService.TOKEN) private config: ConfigService<typeof configSchema>) {}
 *     connect() {
 *       return this.config.require('DATABASE_URL');
 *     }
 *   }
 */

import { Module } from "@nexusts/core";
import { ConfigService } from "./config.service.js";
import type { ConfigOptions } from "./types.js";
import { safeGetMeta, safeDefineMeta, safeHasMeta } from "@nexusts/core/di/safe-reflect";

@Module({
	providers: [
		ConfigService,
		{ provide: ConfigService.TOKEN, useExisting: ConfigService },
	],
	exports: [ConfigService, ConfigService.TOKEN],
})
export class ConfigModule {
	static forRoot(options: ConfigOptions = {}) {
		@Module({
			providers: [
				ConfigService,
				{ provide: ConfigService.TOKEN, useExisting: ConfigService },
				{ provide: "CONFIG_OPTIONS", useValue: options },
			],
			exports: [ConfigService, ConfigService.TOKEN],
		})
		class ConfiguredConfigModule {}

		Object.defineProperty(ConfiguredConfigModule, "name", {
			value: "ConfiguredConfigModule",
		});

		return ConfiguredConfigModule;
	}
}
