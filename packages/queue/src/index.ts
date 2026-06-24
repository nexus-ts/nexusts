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
 *   import { Module } from 'nexusjs';
 *   import { QueueModule } from 'nexusjs/queue';
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
 *   import { QueueService } from 'nexusjs/queue';
 *
 *   class SignupController {
 *     constructor(@Inject(QueueService.TOKEN) private queue: QueueService) {}
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
 *     constructor(@Inject(QueueService.TOKEN) private queue: QueueService) {}
 *     @OnQueueReady()
 *     async register() {
 *       await this.queue.process('send-welcome-email', this.handle);
 *     }
 *     handle = async (data: { email: string }) => {
 *       // ... send the email
 *     };
 *   }
 */

export type { BullMQBackendOptions } from "./backends/bullmq.js";
export type { CloudflareBackendOptions } from "./backends/cloudflare.js";
export {
	BullMQBackend,
	CloudflareQueueBackend,
	MemoryQueueBackend,
} from "./backends/index.js";
export {
	getQueueReadyHooks,
	invokeQueueReadyHooks,
	OnQueueReady,
} from "./decorators/on-queue-ready.js";
export { QueueModule } from "./queue.module.js";
export { QueueService } from "./queue.service.js";
export * from "./types.js";
