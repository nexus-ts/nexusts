/**
 * `QueueService` — DI-friendly facade over a `QueueBackend`.
 *
 * Controllers and other services inject this via `@Inject(QueueService.TOKEN)`
 * (or just `@Inject(QueueService)`) and call high-level methods without
 * caring whether the underlying backend is BullMQ, Cloudflare Queues,
 * or the in-memory test backend.
 *
 * Two layers:
 *   - `QueueService.add(name, data, options?)`  → schedule a job
 *   - `QueueService.process(name, handler)`     → register a worker
 *
 * The lifecycle is owned by `QueueService.start()` (called by
 * `QueueModule.forRoot` when the application boots) and
 * `QueueService.stop()` (called on shutdown).
 */

import { Inject, Injectable } from '@nexusts/core';
import type {
	QueueBackend,
	QueueConfig,
	JobHandler,
	WorkerHandle,
	AddedJob,
	AddOptions,
	QueueEvent,
	QueueEventListener,
} from './types.js';
import {
	MemoryQueueBackend,
	BullMQBackend,
	CloudflareQueueBackend,
} from './backends/index.js';

@Injectable()
export class QueueService {
	/** DI token — use with `@Inject(QueueService.TOKEN)`. */
	static readonly TOKEN = Symbol.for('nexus:QueueService');

	/** Queue config — injected by DI container. */
	@Inject('QUEUE_CONFIG') declare private readonly config: QueueConfig;

	#_backend: QueueBackend | null = null;
	get backend(): QueueBackend {
		if (!this.#_backend) {
			this.#_backend = this.#createBackend(this.config ?? { backend: 'memory' });
		}
		return this.#_backend;
	}
	#workers = new Map<string, WorkerHandle>();
	#listeners = new Set<QueueEventListener>();
	#started = false;

	// ===========================================================================
	// Producer API
	// ===========================================================================

	/**
	 * Enqueue a job. Returns immediately (the backend may still be
	 * persisting). On Cloudflare, returns once the message is on disk.
	 */
	async add<T = unknown>(
		name: string,
		data: T,
		options: AddOptions = {},
	): Promise<AddedJob> {
		const cfg = this.config ?? { backend: 'memory' as const };
		const merged = { ...cfg.defaults, ...options };
		return this.backend.add(name, data, merged);
	}

	/** Enqueue many jobs at once (atomic on Cloudflare; batched on BullMQ). */
	async addBatch<T = unknown>(
		jobs: Array<{ name: string; data: T; options?: AddOptions }>,
	): Promise<AddedJob[]> {
		return this.backend.addBatch(jobs);
	}

	// ===========================================================================
	// Worker API
	// ===========================================================================

	/**
	 * Register a worker for the given job name. Call this from
	 * `Application.bootstrap` (or a feature module's `onInit`) — the
	 * module wires it via DI so user code doesn't have to call this
	 * manually.
	 */
	async process<T = unknown>(
		name: string,
		handler: JobHandler<T>,
	): Promise<WorkerHandle> {
		const handle = await this.backend.process(name, handler);
		this.#workers.set(name, handle);
		return handle;
	}

	// ===========================================================================
	// Events
	// ===========================================================================

	on(listener: QueueEventListener): () => void {
		this.#listeners.add(listener);
		return () => this.#listeners.delete(listener);
	}

	// ===========================================================================
	// Lifecycle
	// ===========================================================================

	/** Called by `QueueModule.forRoot` when the app boots. */
	async start(): Promise<void> {
		if (this.#started) return;
		this.#started = true;
		// Bridge backend events through our listener set.
		this.backend.on((event) => this.#broadcast(event));
	}

	/** Drain in-flight jobs and close all workers. */
	async stop(): Promise<void> {
		if (!this.#started) return;
		this.#started = false;
		await this.backend.drain();
		for (const handle of this.#workers.values()) {
			await handle.close();
		}
		await this.backend.stop();
		this.#workers.clear();
	}

	// ===========================================================================
	// Cloudflare binding helper
	// ===========================================================================

	/**
	 * For Cloudflare backends, call this once with the Worker's env so
	 * the producer can find the Queue binding.
	 *
	 *   const service = app.container.resolve(QueueService.TOKEN);
	 *   if (service.backend.name === 'cloudflare') {
	 *     (service.backend as CloudflareQueueBackend).bind(env);
	 *   }
	 */
	getCloudflareBackend(): CloudflareQueueBackend | null {
		return this.backend instanceof CloudflareQueueBackend ? this.backend : null;
	}

	// ===========================================================================
	// Internal
	// ===========================================================================

	#createBackend(config: QueueConfig): QueueBackend {
		switch (config.backend) {
			case 'memory':
				return new MemoryQueueBackend();
			case 'bullmq': {
				if (!config.bullmq) {
					throw new Error('[queue] backend=bullmq requires `bullmq.connection` in config.');
				}
				return new BullMQBackend({
					connection: config.bullmq.connection,
					prefix: config.bullmq.prefix,
					defaultJobOptions: config.bullmq.defaultJobOptions,
				});
			}
			case 'cloudflare': {
				if (!config.cloudflare) {
					throw new Error('[queue] backend=cloudflare requires `cloudflare.resolveBinding` in config.');
				}
				return new CloudflareQueueBackend({
					resolveBinding: config.cloudflare.resolveBinding as never,
					name: config.cloudflare.name,
				});
			}
		}
	}

	#broadcast(event: QueueEvent) {
		for (const l of this.#listeners) {
			void Promise.resolve(l(event));
		}
	}
}