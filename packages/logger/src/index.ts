/**
 * Public API for `@nexusts/logger`.
 *
 * Quick start:
 *
 *   // src/app/app.module.ts
 *   import { Module } from '@nexusts/core';
 *   import { LoggerModule } from '@nexusts/logger';
 *
 *   @Module({
 *     imports: [
 *       LoggerModule.forRoot({
 *         level: 'info',
 *         pretty: process.env.NODE_ENV !== 'production',
 *       }),
 *     ],
 *   })
 *   export class AppModule {}
 *
 *   // any service
 *   import { Logger } from '@nexusts/logger';
 *
 *   @Injectable()
 *   class MyService {
 *     @Inject(Logger.TOKEN) declare private logger: Logger;
 *
 *     async handle() {
 *       this.logger.info({ userId: 'u-1' }, 'user signed in');
 *     }
 *   }
 */

export * from "./types.js";
export { Logger } from "./logger.service.js";
export { LoggerModule } from "./logger.module.js";
export {
	PinoTransport,
	PrettyTransport,
	NullTransport,
} from "./transports/index.js";
