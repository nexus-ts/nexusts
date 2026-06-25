/**
 * `LoggerModule` — drop-in module for structured logging.
 *
 * Usage:
 *   @Module({
 *     imports: [
 *       LoggerModule.forRoot({
 *         level: 'info',                     // 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal'
 *         pretty: process.env.NODE_ENV !== 'production',
 *         base: { service: 'my-app' },
 *       }),
 *     ],
 *   })
 *   export class AppModule {}
 *
 *   // any service
 *   @Injectable()
 *   class MyService {
 *     constructor(@Inject(Logger.TOKEN) private logger: Logger) {}
 *
 *     async handle() {
 *       await this.logger.with({ requestId: 'r-1' }, async () => {
 *         this.logger.info({ userId: 'u-1' }, 'processing');
 *       });
 *     }
 *   }
 */

import { Module } from "@nexusts/core";
import { Logger } from "./logger.service.js";
import type { LoggerOptions } from "./types.js";
import { safeGetMeta, safeDefineMeta, safeHasMeta } from "@nexusts/core/di/safe-reflect";

@Module({
	providers: [Logger, { provide: Logger.TOKEN, useExisting: Logger }],
	exports: [Logger, Logger.TOKEN],
})
export class LoggerModule {
	static forRoot(options: LoggerOptions = {}) {
		@Module({
			providers: [
				Logger,
				{ provide: Logger.TOKEN, useExisting: Logger },
				{ provide: "LOGGER_OPTIONS", useValue: options },
			],
			exports: [Logger, Logger.TOKEN],
		})
		class ConfiguredLoggerModule {}

		Object.defineProperty(ConfiguredLoggerModule, "name", {
			value: "ConfiguredLoggerModule",
		});

		return ConfiguredLoggerModule;
	}
}
