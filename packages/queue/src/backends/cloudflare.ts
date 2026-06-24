/**
 * Cloudflare Queues backend — Workers-native, edge-friendly.
 *
 * Cloudflare Queues has a different shape from BullMQ:
 *   - The producer calls `queue.send(body)` / `queue.sendBatch(...)`.
 *   - The consumer is a Worker's `queue()` handler that receives a
 *     `MessageBatch`.
 *
 * We adapt the two halves to our common `QueueBackend` interface:
 *   - `add(name, data)` calls `queue.send({ name, data })` so the
 *     consumer knows which handler to route to.
 *   - `process(name, handler)` registers the handler in a local
 *     `Map`. When the consumer's `queue()` callback fires, we
 *     dispatch each message to the matching handler.
 *
 * Because Workers can't start a long-running process, `process()` is
 * a no-op on the producer side. The actual `queue()` handler must be
 * registered separately by the user (or by `QueueModule`'s
 * `workerHandler(env, ctx, batch)` export).
 */

import type {
	AddedJob,
	AddOptions,
	JobContext,
	JobHandler,
	QueueBackend,
	QueueEvent,
	QueueEventListener,
	WorkerHandle,
	WorkerOptions,
} from "../types.js";

// ---------------------------------------------------------------------------
// Cloudflare type stubs (mirrored from @cloudflare/workers-types).
// We don't import the package to keep the queue module light.
// ---------------------------------------------------------------------------

interface CFQueue<Body = unknown> {
	send(
		body: Body,
		options?: { contentType?: string; delaySeconds?: number },
	): Promise<unknown>;
	sendBatch(
		messages: Array<{
			body: unknown;
			contentType?: string;
			delaySeconds?: number;
		}>,
		options?: { delaySeconds?: number },
	): Promise<unknown>;
}

interface CFMessage<Body = unknown> {
	readonly id: string;
	readonly timestamp: Date;
	readonly body: Body;
	readonly attempts: number;
	ack(): void;
	retry(options?: { delaySeconds?: number }): void;
}

interface CFMessageBatch<Body = unknown> {
	readonly queue: string;
	readonly messages: readonly CFMessage<Body>[];
	ackAll(): void;
	retryAll(options?: { delaySeconds?: number }): void;
}

// ---------------------------------------------------------------------------
// Worker handle
// ---------------------------------------------------------------------------

class CloudflareWorkerHandle implements WorkerHandle {
	#name: string;
	#running = true;
	constructor(name: string) {
		this.#name = name;
	}
	get name() {
		return this.#name;
	}
	async close() {
		this.#running = false;
	}
	async pause() {
		this.#running = false;
	}
	async resume() {
		this.#running = true;
	}
	isRunning() {
		return this.#running;
	}
}

export interface CloudflareBackendOptions {
	/** Resolver that pulls the Queue binding from the Worker's env. */
	resolveBinding: (env: Record<string, unknown>) => CFQueue;
	/** Queue name (for diagnostics + MessageBatch.queue matching). */
	name?: string;
}

// ---------------------------------------------------------------------------
// Backend
// ---------------------------------------------------------------------------

export class CloudflareQueueBackend implements QueueBackend {
	readonly name = "cloudflare" as const;
	#queue: CFQueue | null = null;
	#resolveBinding: (env: Record<string, unknown>) => CFQueue;
	#handlers = new Map<string, JobHandler>();
	#workerOptions = new Map<string, WorkerOptions>();
	#listeners = new Set<QueueEventListener>();
	#queueName: string;

	constructor(options: CloudflareBackendOptions) {
		this.#resolveBinding = options.resolveBinding;
		this.#queueName = options.name ?? "queue";
	}

	/** Bind to the Worker's `env` once it's available. */
	bind(env: Record<string, unknown>): void {
		this.#queue = this.#resolveBinding(env);
	}

	// ===========================================================================
	// Producer
	// ===========================================================================

	async add(
		name: string,
		data: unknown,
		options: AddOptions = {},
	): Promise<AddedJob> {
		if (!this.#queue)
			throw new Error("[queue/cloudflare] bind() must be called before add()");
		const id = `cf-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
		await this.#queue.send(
			{ name, data, jobId: id, options },
			{ delaySeconds: options.delaySeconds },
		);
		this.#emit({ kind: "job:added", jobId: id, name });
		return { jobId: id, name };
	}

	async addBatch(
		jobs: Array<{ name: string; data: unknown; options?: AddOptions }>,
	): Promise<AddedJob[]> {
		if (!this.#queue)
			throw new Error(
				"[queue/cloudflare] bind() must be called before addBatch()",
			);
		const ids = jobs.map(
			() => `cf-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
		);
		await this.#queue.sendBatch(
			jobs.map((j, i) => ({
				body: { name: j.name, data: j.data, jobId: ids[i], options: j.options },
				delaySeconds: j.options?.delaySeconds,
			})),
		);
		for (let i = 0; i < jobs.length; i++) {
			const j = jobs[i]!;
			this.#emit({ kind: "job:added", jobId: ids[i]!, name: j.name });
		}
		return jobs.map((j, i) => ({ jobId: ids[i]!, name: j.name }));
	}

	// ===========================================================================
	// Worker registration
	// ===========================================================================

	async process<T = unknown>(
		name: string,
		handler: JobHandler<T>,
		options: WorkerOptions = {},
	): Promise<WorkerHandle> {
		this.#handlers.set(name, handler as JobHandler);
		this.#workerOptions.set(name, options);
		this.#emit({
			kind: "worker:started",
			name,
			concurrency: options.concurrency ?? 1,
		});
		return new CloudflareWorkerHandle(name);
	}

	// ===========================================================================
	// Cloudflare consumer entry point
	// ===========================================================================

	/**
	 * Build the Worker's `queue()` handler. Mount it as
	 * `export default { queue: backend.consumerHandler() }` in the
	 * Worker entry file.
	 */
	consumerHandler(): (batch: CFMessageBatch<unknown>) => Promise<void> {
		return async (batch: CFMessageBatch<unknown>) => {
			for (const message of batch.messages) {
				const body = (message.body ?? {}) as {
					name?: string;
					data?: unknown;
					jobId?: string;
					options?: AddOptions;
				};
				const jobName = body.name ?? "";
				const handler = this.#handlers.get(jobName);
				if (!handler) {
					// No handler registered — fail so the message is retried.
					message.retry();
					continue;
				}
				const ctx: JobContext = {
					jobId: body.jobId ?? message.id,
					attempts: message.attempts,
					job: { name: jobName, data: body.data },
					prefix: `[queue:${jobName}]`,
				};
				this.#emit({
					kind: "job:active",
					jobId: ctx.jobId,
					name: jobName,
					attempts: ctx.attempts,
				});
				try {
					const result = await handler(body.data, ctx);
					if (result && typeof result === "object" && "status" in result) {
						const r = result as {
							status: string;
							returnvalue?: unknown;
							error?: Error;
						};
						if (r.status === "failed") {
							this.#emit({
								kind: "job:failed",
								jobId: ctx.jobId,
								name: jobName,
								error: r.error ?? new Error("failed"),
								willRetry: true,
							});
							message.retry();
							continue;
						}
						if (r.status === "retry") {
							const r2 = result as { delaySeconds?: number };
							message.retry({ delaySeconds: r2.delaySeconds });
							continue;
						}
						this.#emit({
							kind: "job:completed",
							jobId: ctx.jobId,
							name: jobName,
							returnvalue: r.returnvalue,
						});
					} else {
						this.#emit({
							kind: "job:completed",
							jobId: ctx.jobId,
							name: jobName,
							returnvalue: result,
						});
					}
				} catch (err) {
					const error = err instanceof Error ? err : new Error(String(err));
					const willRetry = (body.options?.attempts ?? 1) > message.attempts;
					this.#emit({
						kind: "job:failed",
						jobId: ctx.jobId,
						name: jobName,
						error,
						willRetry,
					});
					if (willRetry) message.retry();
					else message.ack();
				}
			}
		};
	}

	// ===========================================================================
	// Lifecycle
	// ===========================================================================

	async drain(): Promise<void> {
		// Cloudflare handles draining at the platform level (between
		// requests, the isolate is torn down). Nothing to do here.
	}

	async stop(): Promise<void> {
		for (const name of this.#handlers.keys()) {
			this.#emit({ kind: "worker:stopped", name });
		}
		this.#handlers.clear();
		this.#workerOptions.clear();
	}

	// ===========================================================================
	// Events
	// ===========================================================================

	on(listener: QueueEventListener): () => void {
		this.#listeners.add(listener);
		return () => this.#listeners.delete(listener);
	}

	// ===========================================================================
	// Internal
	// ===========================================================================

	#emit(event: QueueEvent) {
		for (const l of this.#listeners) {
			void Promise.resolve(l(event));
		}
	}

	get queueName() {
		return this.#queueName;
	}
}
