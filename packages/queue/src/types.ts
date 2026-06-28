/**
 * Queue types — the public contract for `@nexusts/queue`.
 *
 * The queue module provides an abstraction over two backends:
 *   - BullMQ     (Redis-backed, for Bun / Node / long-running servers)
 *   - Cloudflare Queues (Workers-native, edge-friendly)
 *
 * Both share a common `QueueBackend` interface so user code never
 * knows which one is configured — just like `ViewAdapter` for views.
 */

// ---------------------------------------------------------------------------
// Job model
// ---------------------------------------------------------------------------

/**
 * The payload sent to a worker. `name` selects the handler; `data` is
 * the typed payload.
 */
export interface Job<T = unknown> {
	name: string;
	data: T;
}

/**
 * A job's outcome. `completed` is the normal path; `failed` triggers
 * the configured retry policy; `retry` explicitly asks for one more
 * attempt (BullMQ only — Cloudflare retries via `message.retry()`).
 */
export type JobResult<T = unknown> =
	| { status: "completed"; returnvalue?: T }
	| { status: "failed"; error: Error; willRetry: boolean }
	| { status: "retry"; reason?: string; delaySeconds?: number };

/** A registered worker handler. */
export type JobHandler<T = unknown> = (
	data: T,
	ctx: JobContext,
) => Promise<JobResult<T> | undefined> | JobResult<T> | undefined;

/** Per-job execution context. */
export interface JobContext {
	/** The unique BullMQ / Cloudflare job ID. */
	jobId: string;
	/** Number of attempts so far (1-indexed). */
	attempts: number;
	/** Original `Job` envelope (name + data). */
	job: Job;
	/** Logger-friendly prefix: `[queue:name]`. */
	prefix: string;
}

// ---------------------------------------------------------------------------
// Producer API
// ---------------------------------------------------------------------------

/**
 * Options for `add()`. Mirrors BullMQ's JobOpts plus our
 * edge-friendly extensions.
 */
export interface AddOptions {
	/** Delay before the job is available. Seconds. */
	delaySeconds?: number;
	/** Max attempts before the job is dead-lettered. */
	attempts?: number;
	/** Backoff strategy between retries. */
	backoff?: BackoffConfig;
	/** Priority — lower runs first. Cloudflare ignores this. */
	priority?: number;
	/** Job ID for idempotency (BullMQ). */
	jobId?: string;
	/** Remove from the queue on completion. */
	removeOnComplete?: boolean | number;
	/** Remove from the queue on failure. */
	removeOnFail?: boolean | number;
}

export interface BackoffConfig {
	/** 'fixed' | 'exponential'. */
	type: "fixed" | "exponential";
	/** Base delay in milliseconds. */
	delayMs: number;
}

/** Returned by `add()` — enough info to track or cancel. */
export interface AddedJob {
	jobId: string;
	name: string;
	/** Backend-specific handle (BullMQ Job, Cloudflare Message, ...). */
	handle?: unknown;
}

// ---------------------------------------------------------------------------
// Worker registration
// ---------------------------------------------------------------------------

/** Options for `process()`. */
export interface WorkerOptions {
	/** How many jobs this worker handles in parallel. Default: 1. */
	concurrency?: number;
	/** Rate limit — jobs per second. */
	limiter?: { max: number; durationMs: number };
	/** Lock duration in ms — how long a worker holds the job. Default: 30000. */
	lockDurationMs?: number;
}

// ---------------------------------------------------------------------------
// Backend abstraction
// ---------------------------------------------------------------------------

/**
 * Backend contract. Each backend (BullMQ, Cloudflare) implements this.
 *
 * User code talks to `QueueService`, not to the backend directly —
 * but advanced users can `@Inject(QueueService.BACKEND_TOKEN)` if they
 * need a specific backend's native API.
 */
export interface QueueBackend {
	/** Backend name for diagnostics. */
	readonly name: "bullmq" | "cloudflare" | "memory";

	/** Add a job to the queue. */
	add(name: string, data: unknown, options?: AddOptions): Promise<AddedJob>;

	/** Add many jobs at once. */
	addBatch(
		jobs: Array<{ name: string; data: unknown; options?: AddOptions }>,
	): Promise<AddedJob[]>;

	/** Register a worker. Returns a handle that can be closed. */
	process<T = unknown>(
		name: string,
		handler: JobHandler<T>,
		options?: WorkerOptions,
	): Promise<WorkerHandle>;

	/** Drain — wait for in-flight jobs to finish. */
	drain(): Promise<void>;

	/** Stop all workers gracefully. */
	stop(): Promise<void>;

	/** Subscribe to queue events. Returns an unsubscribe function. */
	on(listener: QueueEventListener): () => void;
}

/** Handle for a running worker. */
export interface WorkerHandle {
	/** The job name this worker handles. */
	name: string;
	/** Stop the worker (wait for in-flight jobs). */
	close(): Promise<void>;
	/** Pause accepting new jobs. */
	pause(): Promise<void>;
	/** Resume accepting jobs. */
	resume(): Promise<void>;
	/** True if the worker is running. */
	isRunning(): boolean;
}

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

export type QueueBackendKind = "bullmq" | "cloudflare" | "memory";

export interface QueueConfig {
	/**
	 * Backend to use.
	 *   - 'bullmq'      → Redis-backed, works on Bun / Node
	 *   - 'cloudflare'  → Cloudflare Queues binding
	 *   - 'memory'      → in-process queue (tests, single-instance dev)
	 */
	backend: QueueBackendKind;

	/**
	 * BullMQ-specific configuration. Ignored by other backends.
	 */
	bullmq?: BullMQConfig;

	/**
	 * Cloudflare-specific configuration. Ignored by other backends.
	 */
	cloudflare?: CloudflareQueueConfig;

	/** Global default options for `add()`. */
	defaults?: AddOptions;
}

export interface BullMQConfig {
	/** Redis connection URL (e.g. redis://localhost:6379). */
	connection: string | { host: string; port: number; password?: string };
	/** Prefix for all queue keys. Default: 'nexusts'. */
	prefix?: string;
	/** Default job options. */
	defaultJobOptions?: AddOptions;
}

export interface CloudflareQueueConfig {
	/**
	 * Resolver for the Queue binding from the Worker's `env`.
	 * Called once at boot with the env object.
	 */
	resolveBinding: (env: Record<string, unknown>) => unknown;
	/** Queue name (used for diagnostics). */
	name: string;
}

// ---------------------------------------------------------------------------
// Lifecycle events
// ---------------------------------------------------------------------------

export type QueueEvent =
	| { kind: "job:added"; jobId: string; name: string }
	| { kind: "job:active"; jobId: string; name: string; attempts: number }
	| {
			kind: "job:completed";
			jobId: string;
			name: string;
			returnvalue?: unknown;
	  }
	| {
			kind: "job:failed";
			jobId: string;
			name: string;
			error: Error;
			willRetry: boolean;
	  }
	| { kind: "worker:started"; name: string; concurrency: number }
	| { kind: "worker:stopped"; name: string };

export type QueueEventListener = (event: QueueEvent) => void | Promise<void>;
