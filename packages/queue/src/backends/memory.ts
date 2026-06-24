/**
 * In-memory queue backend — for tests, single-instance dev, and the
 * `bunx nx dev` workflow when Redis isn't running yet.
 *
 * NOT for production. It does not persist across restarts, does not
 * distribute across workers, and silently drops jobs on crash.
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

interface PendingJob {
	jobId: string;
	name: string;
	data: unknown;
	options: AddOptions;
	resolveAt: number; // ms epoch
}

/** Per-job worker handle. */
class MemoryWorkerHandle implements WorkerHandle {
	#running = true;
	#handler: JobHandler;
	#context: { jobId: string; name: string };
	constructor(name: string, handler: JobHandler) {
		this.#handler = handler;
		this.#context = { jobId: "", name };
	}
	get name() {
		return this.#context.name;
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

export class MemoryQueueBackend implements QueueBackend {
	readonly name = "memory" as const;
	#queue: PendingJob[] = [];
	#handlers = new Map<string, JobHandler>();
	#workerOptions = new Map<string, WorkerOptions>();
	#listeners = new Set<QueueEventListener>();
	#tickHandle: ReturnType<typeof setInterval> | null = null;
	#inFlight = 0;

	constructor() {
		// Tick every 100 ms to dispatch due jobs.
		this.#tickHandle = setInterval(() => this.#tick(), 100);
		// Allow Node to exit if only this timer is running.
		if (
			typeof (this.#tickHandle as { unref?: () => void }).unref === "function"
		) {
			(this.#tickHandle as { unref: () => void }).unref();
		}
	}

	// ===========================================================================
	// Producer
	// ===========================================================================

	async add(
		name: string,
		data: unknown,
		options: AddOptions = {},
	): Promise<AddedJob> {
		const jobId = `mem-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
		const delayMs = (options.delaySeconds ?? 0) * 1000;
		this.#queue.push({
			jobId,
			name,
			data,
			options,
			resolveAt: Date.now() + delayMs,
		});
		this.#emit({ kind: "job:added", jobId, name });
		return { jobId, name };
	}

	async addBatch(
		jobs: Array<{ name: string; data: unknown; options?: AddOptions }>,
	): Promise<AddedJob[]> {
		return Promise.all(jobs.map((j) => this.add(j.name, j.data, j.options)));
	}

	// ===========================================================================
	// Worker
	// ===========================================================================

	async process<T>(
		name: string,
		handler: JobHandler<T>,
		options: WorkerOptions = {},
	): Promise<WorkerHandle> {
		this.#handlers.set(name, handler as JobHandler);
		this.#workerOptions.set(name, options);
		const handle = new MemoryWorkerHandle(name, handler as JobHandler);
		this.#emit({
			kind: "worker:started",
			name,
			concurrency: options.concurrency ?? 1,
		});
		return handle;
	}

	// ===========================================================================
	// Lifecycle
	// ===========================================================================

	async drain(): Promise<void> {
		while (this.#inFlight > 0 || this.#queue.length > 0) {
			await new Promise((r) => setTimeout(r, 50));
		}
	}

	async stop(): Promise<void> {
		for (const name of this.#handlers.keys()) {
			this.#emit({ kind: "worker:stopped", name });
		}
		if (this.#tickHandle) clearInterval(this.#tickHandle);
		this.#tickHandle = null;
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

	async #tick() {
		if (this.#queue.length === 0) return;
		const now = Date.now();
		const due = this.#queue.filter((j) => j.resolveAt <= now);
		for (const job of due) {
			this.#queue = this.#queue.filter((j) => j !== job);
			const handler = this.#handlers.get(job.name);
			if (!handler) continue;
			const options = this.#workerOptions.get(job.name) ?? {};
			const concurrency = options.concurrency ?? 1;
			if (this.#inFlight >= concurrency) {
				// Re-queue at the front.
				this.#queue.unshift(job);
				continue;
			}
			void this.#runJob(job, handler, options);
		}
	}

	async #runJob(job: PendingJob, handler: JobHandler, options: WorkerOptions) {
		this.#inFlight++;
		const ctx: JobContext = {
			jobId: job.jobId,
			attempts: 1,
			job: { name: job.name, data: job.data },
			prefix: `[queue:${job.name}]`,
		};
		this.#emit({
			kind: "job:active",
			jobId: job.jobId,
			name: job.name,
			attempts: 1,
		});
		try {
			const result = await handler(job.data, ctx);
			if (result && typeof result === "object" && "status" in result) {
				const r = result as {
					status: string;
					returnvalue?: unknown;
					error?: Error;
				};
				if (r.status === "failed") {
					this.#emit({
						kind: "job:failed",
						jobId: job.jobId,
						name: job.name,
						error: r.error ?? new Error("unknown"),
						willRetry: false,
					});
				} else {
					this.#emit({
						kind: "job:completed",
						jobId: job.jobId,
						name: job.name,
						returnvalue: r.returnvalue,
					});
				}
			} else {
				this.#emit({
					kind: "job:completed",
					jobId: job.jobId,
					name: job.name,
					returnvalue: result,
				});
			}
		} catch (err) {
			const error = err instanceof Error ? err : new Error(String(err));
			const willRetry = (job.options.attempts ?? 1) > 1;
			this.#emit({
				kind: "job:failed",
				jobId: job.jobId,
				name: job.name,
				error,
				willRetry,
			});
			if (willRetry) {
				const delayMs =
					(job.options.backoff?.delayMs ?? 1000) *
					(job.options.backoff?.type === "exponential" ? 2 ** ctx.attempts : 1);
				this.#queue.push({
					...job,
					resolveAt: Date.now() + delayMs,
				});
			}
		} finally {
			this.#inFlight--;
		}
		// Touch options to silence "unused" warnings in strict configs.
		void options;
	}

	#emit(event: QueueEvent) {
		for (const l of this.#listeners) {
			void Promise.resolve(l(event));
		}
	}
}
