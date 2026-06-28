/**
 * Public API for the NexusTS queue module.
 *
 * Two backends out of the box:
 *   - BullMQ  → Redis-backed, for Bun / Node long-running servers
 *   - Cloudflare Queues → Workers-native, edge-friendly
 *   - In-memory → for tests and single-instance dev (no Redis required)
 *
 * Quick start:
 *
 *   // src/app/app.module.ts
 *   import { Module } from '@nexusts/core';
 *   import { QueueModule } from '@nexusts/queue';
 *
 *   @Module({
 *     imports: [
 *       QueueModule.forRoot({
 *         backend: 'bullmq',
 *         bullmq: { connection: process.env.REDIS_URL! },
 *       }),
 *     ],
 *   })
 *   export class AppModule {}
 *
 *   // any controller or service
 *   import { QueueService } from '@nexusts/queue';
 *
 *   class SignupController {
 *     @Inject(QueueService.TOKEN) declare private queue: QueueService;
 *
 *     @Post('/')
 *     async signup(@Body() body: { email: string }) {
 *       await this.queue.add('send-welcome-email', { email: body.email });
 *       return { status: 'ok' };
 *     }
 *   }
 *
 *   // any service — register a worker
 *   class EmailWorker {
 *     @Inject(QueueService.TOKEN) declare private queue: QueueService;
 *     @OnQueueReady()
 *     async register() {
 *       await this.queue.process('send-welcome-email', this.handle);
 *     }
 *     handle = async (data: { email: string }) => {
 *       // ... send the email
 *     };
 *   }
 */

export * from "./types.js";
export {
	MemoryQueueBackend,
	BullMQBackend,
	CloudflareQueueBackend,
} from "./backends/index.js";
export type { BullMQBackendOptions } from "./backends/bullmq.js";
export type { CloudflareBackendOptions } from "./backends/cloudflare.js";
export { QueueService } from "./queue.service.js";
export { QueueModule } from "./queue.module.js";
export {
	OnQueueReady,
	getQueueReadyHooks,
	invokeQueueReadyHooks,
} from "./decorators/on-queue-ready.js";
