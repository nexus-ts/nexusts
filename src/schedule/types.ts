/**
 * Schedule types — the public contract for `nexus/schedule`.
 *
 * The schedule module wraps three kinds of recurring work:
 *
 *   - @Cron(expr)       — runs on a cron expression (`* * * * *`)
 *   - @Interval(ms)     — runs every N milliseconds
 *   - @Timeout(ms)      — runs once after N milliseconds
 *
 * Behind a `ScheduleBackend` interface, with two implementations:
 *   - in-process (Bun / Node) — setInterval-driven, in-memory
 *   - Cloudflare Cron Triggers — Workers-native, declared in wrangler.toml
 *
 * The shape mirrors nestjs/schedule so users coming from that
 * ecosystem feel at home.
 */

// ---------------------------------------------------------------------------
// Cron expression
// ---------------------------------------------------------------------------

/**
 * A cron expression as a string. Supports:
 *   - 5 fields:  `* * * * *`           (minute hour day month weekday)
 *   - 6 fields:  `* * * * * *`        (second + the above)
 *   - Aliases:   @yearly, @annually, @monthly, @weekly, @daily,
 *                @midnight, @hourly
 *   - Intervals: @every 1h, @every 30m, @every 15s, @every 1d
 *   - Wildcards, lists, ranges, steps: *, 1\,3\,5, 1-5, star-slash-2
 *   - Names:     JAN-DEC, SUN-SAT (case-insensitive)
 */
export type CronExpression = string;

/** Options applied to a scheduled task. */
export interface CronOptions {
	/** Display name. Default: method name. */
	name?: string;
	/** IANA timezone, e.g. `America/New_York`. Default: host's local TZ. */
	timezone?: string;
	/** Run immediately on register instead of waiting for the first tick. */
	runOnInit?: boolean;
}

// ---------------------------------------------------------------------------
// Task model
// ---------------------------------------------------------------------------

/** A scheduled task's status. */
export type TaskStatus = "running" | "stopped" | "paused";

/** What kind of schedule a task uses. */
export type TaskKind = "cron" | "interval" | "timeout";

/** A registered scheduled task. */
export interface ScheduledTask {
	id: string;
	name: string;
	kind: TaskKind;
	expression: string;
	/** Current status. */
	status: TaskStatus;
	/** Number of invocations so far. */
	invocations: number;
	/** When the task last started (ISO). */
	lastRunAt?: string;
	/** When the next invocation is scheduled (ISO), if known. */
	nextRunAt?: string;
	/** Last error message, if any. */
	lastError?: string;
}

/** A handler invoked by the scheduler. */
export type ScheduleHandler = () => void | Promise<void>;

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

/**
 * Registry contract — every backend implements this. The
 * ScheduleService is the user-facing facade.
 */
export interface ScheduleRegistry {
	/**
	 * Register a cron task. Returns the assigned task id.
	 */
	addCron(
		name: string,
		expression: CronExpression,
		handler: ScheduleHandler,
		options?: CronOptions,
	): string;

	/**
	 * Register a recurring task.
	 */
	addInterval(
		name: string,
		milliseconds: number,
		handler: ScheduleHandler,
	): string;

	/**
	 * Register a one-shot delayed task.
	 */
	addTimeout(
		name: string,
		milliseconds: number,
		handler: ScheduleHandler,
	): string;

	/** Delete a task by id. Returns true if it existed. */
	delete(id: string): boolean;

	/** List all registered tasks. */
	list(): ScheduledTask[];

	/** Get one task by id (or by name — first match). */
	get(idOrName: string): ScheduledTask | undefined;

	/** Pause a task without removing it. */
	pause(idOrName: string): boolean;

	/** Resume a paused task. */
	resume(idOrName: string): boolean;

	/** Stop the registry entirely. Workers / intervals are cleared. */
	stop(): Promise<void>;

	/** Subscribe to schedule events. Returns an unsubscribe function. */
	on(listener: ScheduleEventListener): () => void;
}

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

export type ScheduleBackendKind = "memory" | "cloudflare";

export interface ScheduleConfig {
	/** Backend to use. Default: memory. */
	backend?: ScheduleBackendKind;
	/** Default timezone applied to every cron task. Default: host local. */
	defaultTimezone?: string;
	/** Run tasks in-process even when the configured backend is Cloudflare. */
	/** Cloudflare Cron Triggers run separately at the platform level; */
	/** this flag is mostly useful for tests. */
	dualRun?: boolean;
	/** Cron config specific to the in-process backend. */
	memory?: {
		/** Tick interval in ms. Default: 1000. */
		tickMs?: number;
		/** Skip tasks that fall behind by more than N ms. Default: 60_000. */
		maxDriftMs?: number;
	};
	/** Cron config specific to Cloudflare. */
	cloudflare?: {
		/** Cron trigger name (matches wrangler.toml). */
		triggerName: string;
		/** Cron expression forwarded to the trigger. */
		expression: CronExpression;
	};
}

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------

export type ScheduleEvent =
	| {
			kind: "task:registered";
			id: string;
			name: string;
			taskKind: TaskKind;
			expression: string;
	  }
	| { kind: "task:invoked"; id: string; name: string; startedAt: string }
	| {
			kind: "task:completed";
			id: string;
			name: string;
			durationMs: number;
			returnvalue?: unknown;
	  }
	| { kind: "task:failed"; id: string; name: string; error: Error }
	| { kind: "task:paused"; id: string }
	| { kind: "task:resumed"; id: string }
	| { kind: "task:deleted"; id: string };

export type ScheduleEventListener = (
	event: ScheduleEvent,
) => void | Promise<void>;
