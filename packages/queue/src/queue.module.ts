/**
 * `QueueModule` — drop-in module for adding background jobs to a
 * NexusTS app.
 *
 * Usage:
 *   // src/app/app.module.ts
 *   @Module({
 *     imports: [
 *       QueueModule.forRoot({
 *         backend: 'bullmq',
 *         bullmq: { connection: 'redis://localhost:6379' },
 *       }),
 *     ],
 *   })
 *   export class AppModule {}
 *
 *   // any controller or service
 *   @Inject(QueueService.TOKEN) declare private queue: QueueService;
 *   await this.queue.add('send-email', { to: 'a@b.c' });
 *
 *   // any service — register a worker
 *   class EmailWorker {
 *     @Inject(QueueService.TOKEN) declare private queue: QueueService;
 *     async onInit() {
 *       await this.queue.process('send-email', async (data) => {
 *         // ... send the email
 *         return { status: 'completed' };
 *       });
 *     }
 *   }
 */

import { Module } from "@nexusts/core";
import { QueueService } from "./queue.service.js";
import type { QueueConfig } from "./types.js";

@Module({
	providers: [
		QueueService,
		{ provide: QueueService.TOKEN, useExisting: QueueService },
	],
	exports: [QueueService, QueueService.TOKEN],
})
export class QueueModule {
	/**
	 * Build a configured `QueueModule` class with the given queue config.
	 *
	 * The returned class can be `imports`-ed by any other module and
	 * will provide the `QueueService` (and a `QUEUE_CONFIG` value
	 * provider) to its container.
	 */
	static forRoot(config: QueueConfig) {
		@Module({
			providers: [
				QueueService,
				{ provide: QueueService.TOKEN, useExisting: QueueService },
				{ provide: "QUEUE_CONFIG", useValue: config },
			],
			exports: [QueueService, QueueService.TOKEN],
		})
		class ConfiguredQueueModule {}

		Object.defineProperty(ConfiguredQueueModule, "name", {
			value: "ConfiguredQueueModule",
		});

		return ConfiguredQueueModule;
	}
}
