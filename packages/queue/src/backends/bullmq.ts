/**
 * BullMQ backend — Redis-backed queue for Bun / Node.
 *
 * Wraps `bullmq.Queue` (producer) and `bullmq.Worker` (consumer) with
 * the common `QueueBackend` interface. We use the `Job` wrapper class
 * (vs the lower-level `QueueBase`) so we can read job IDs back as
 * strings without leaking BullMQ types to user code.
 *
 * Usage:
 *   const backend = new BullMQBackend({
 *     connection: 'redis://localhost:6379',
 *     prefix: 'nexusjs',
 *   });
 *   await backend.process('send-email', async (data) => {
 *     // ...
 *   });
 *   await backend.add('send-email', { to: 'a@b.c' });
 */

import {
	type ConnectionOptions,
	type JobsOptions,
	Queue,
	Worker,
} from "bullmq";
import IORedis from "ioredis";
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

export interface BullMQBackendOptions {
	connection: string | ConnectionOptions;
	prefix?: string;
	defaultJobOptions?: AddOptions;
}

class BullMQWorkerHandle implements WorkerHandle {
	#worker: Worker;
	#name: string;
	constructor(name: string, worker: Worker) {
		this.#name = name;
		this.#worker = worker;
	}
	get name() {
		return this.#name;
	}
	async close() {
		await this.#worker.close();
	}
	async pause() {
		await this.#worker.pause();
	}
	async resume() {
		await this.#worker.resume();
	}
	isRunning() {
		return !this.#worker.closing;
	}
}

export class BullMQBackend implements QueueBackend {
	readonly name = "bullmq" as const;
	#queue: Queue;
	#connection: ConnectionOptions;
	#prefix: string;
	#defaultJobOptions: AddOptions;
	#workers = new Map<string, Worker>();
	#listeners = new Set<QueueEventListener>();
	#closed = false;

	constructor(options: BullMQBackendOptions) {
		this.#connection =
			typeof options.connection === "string"
				? (new IORedis(options.connection, {
						maxRetriesPerRequest: null,
					}) as unknown as ConnectionOptions)
				: options.connection;
		this.#prefix = options.prefix ?? "nexusjs";
		this.#defaultJobOptions = options.defaultJobOptions ?? {};

		this.#queue = new Queue("nexus-queue", {
			connection: this.#connection,
			prefix: this.#prefix,
			defaultJobOptions: this.#toBullJobOptions(this.#defaultJobOptions),
		});
	}

	// ===========================================================================
	// Producer
	// ===========================================================================

	async add(
		name: string,
		data: unknown,
		options: AddOptions = {},
	): Promise<AddedJob> {
		const merged = { ...this.#defaultJobOptions, ...options };
		const job = await this.#queue.add(
			name,
			data,
			this.#toBullJobOptions(merged),
		);
		this.#emit({ kind: "job:added", jobId: String(job.id ?? ""), name });
		return { jobId: String(job.id ?? ""), name, handle: job };
	}

	async addBatch(
		jobs: Array<{ name: string; data: unknown; options?: AddOptions }>,
	): Promise<AddedJob[]> {
		const bullJobs = jobs.map((j) => ({
			name: j.name,
			data: j.data,
			opts: this.#toBullJobOptions({
				...this.#defaultJobOptions,
				...j.options,
			}),
		}));
		const added = await this.#queue.addBulk(bullJobs);
		for (const job of added) {
			this.#emit({
				kind: "job:added",
				jobId: String(job.id ?? ""),
				name: job.name,
			});
		}
		return added.map((job) => ({
			jobId: String(job.id ?? ""),
			name: job.name,
			handle: job,
		}));
	}

	// ===========================================================================
	// Worker
	// ===========================================================================

	async process<T = unknown>(
		name: string,
		handler: JobHandler<T>,
		options: WorkerOptions = {},
	): Promise<WorkerHandle> {
		const worker = new Worker(
			"nexus-queue",
			async (job) => {
				const ctx: JobContext = {
					jobId: String(job.id ?? ""),
					attempts: job.attemptsMade + 1,
					job: { name: job.name, data: job.data },
					prefix: `[queue:${job.name}]`,
				};
				this.#emit({
					kind: "job:active",
					jobId: ctx.jobId,
					name: job.name,
					attempts: ctx.attempts,
				});
				try {
					const result = await handler(job.data as T, ctx);
					if (result && typeof result === "object" && "status" in result) {
						const r = result as { status: string; returnvalue?: unknown };
						if (r.status === "completed") {
							this.#emit({
								kind: "job:completed",
								jobId: ctx.jobId,
								name: job.name,
								returnvalue: r.returnvalue,
							});
							return r.returnvalue;
						}
						if (r.status === "retry") {
							const r2 = result as { delaySeconds?: number; reason?: string };
							throw new RetryError(
								r2.reason ?? "retry requested",
								r2.delaySeconds,
							);
						}
					}
					this.#emit({
						kind: "job:completed",
						jobId: ctx.jobId,
						name: job.name,
						returnvalue: result,
					});
					return result;
				} catch (err) {
					if (err instanceof RetryError) {
						// Force a retry with optional delay.
						await job.moveToDelayed(
							Date.now() + (err.delaySeconds ?? 0) * 1000,
							job.token!,
						);
						return;
					}
					const error = err instanceof Error ? err : new Error(String(err));
					const willRetry = (job.opts.attempts ?? 1) > job.attemptsMade;
					this.#emit({
						kind: "job:failed",
						jobId: ctx.jobId,
						name: job.name,
						error,
						willRetry,
					});
					throw err; // let BullMQ handle the retry
				}
			},
			{
				connection: this.#connection,
				prefix: this.#prefix,
				concurrency: options.concurrency ?? 1,
				lockDuration: options.lockDurationMs ?? 30000,
				limiter: options.limiter
					? { max: options.limiter.max, duration: options.limiter.durationMs }
					: undefined,
			},
		);

		this.#workers.set(name, worker);
		this.#emit({
			kind: "worker:started",
			name,
			concurrency: options.concurrency ?? 1,
		});
		return new BullMQWorkerHandle(name, worker);
	}

	// ===========================================================================
	// Lifecycle
	// ===========================================================================

	async drain(): Promise<void> {
		// Wait for active jobs on every worker to reach zero.
		const workers = [...this.#workers.values()];
		await Promise.all(workers.map((w) => w.waitUntilReady()));
		while (
			workers.some(
				(w) => (w as unknown as { _job?: unknown })._job !== undefined,
			)
		) {
			await new Promise((r) => setTimeout(r, 50));
		}
	}

	async stop(): Promise<void> {
		if (this.#closed) return;
		this.#closed = true;
		for (const [name, worker] of this.#workers) {
			await worker.close();
			this.#emit({ kind: "worker:stopped", name });
		}
		await this.#queue.close();
		// If we own the connection, close it.
		try {
			const conn = this.#connection as { quit?: () => Promise<unknown> };
			if (typeof conn?.quit === "function") await conn.quit();
		} catch {
			// ignore
		}
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

	#toBullJobOptions(opts: AddOptions): JobsOptions {
		const out: JobsOptions = {};
		if (opts.delaySeconds !== undefined) out.delay = opts.delaySeconds * 1000;
		if (opts.attempts !== undefined) out.attempts = opts.attempts;
		if (opts.backoff)
			out.backoff = { type: opts.backoff.type, delay: opts.backoff.delayMs };
		if (opts.priority !== undefined) out.priority = opts.priority;
		if (opts.jobId !== undefined) out.jobId = opts.jobId;
		if (opts.removeOnComplete !== undefined)
			out.removeOnComplete = opts.removeOnComplete;
		if (opts.removeOnFail !== undefined) out.removeOnFail = opts.removeOnFail;
		return out;
	}

	#emit(event: QueueEvent) {
		for (const l of this.#listeners) {
			void Promise.resolve(l(event));
		}
	}
}

/** Internal marker error to ask BullMQ to retry with optional delay. */
class RetryError extends Error {
	readonly __retry = true;
	constructor(
		message: string,
		public readonly delaySeconds?: number,
	) {
		super(message);
		this.name = "RetryError";
	}
}
