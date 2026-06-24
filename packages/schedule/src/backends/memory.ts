/**
 * In-process scheduler backend.
 *
 * Runs on a single setInterval tick (default 1s) and dispatches due
 * tasks. Honors cron expressions via `CronExpression.next()`, fixed
 * intervals via `setInterval`, and one-shot delays via `setTimeout`.
 *
 * Use for Bun / Node long-running servers. For Cloudflare Workers,
 * use the dedicated `CloudflareSchedulesBackend` which integrates
 * with Cron Triggers.
 */

import { CronExpression as CronExpr, nextCron } from "../cron-parser.js";
import type {
	CronExpression,
	CronOptions,
	ScheduledTask,
	ScheduleEvent,
	ScheduleEventListener,
	ScheduleHandler,
	ScheduleRegistry,
	TaskKind,
} from "../types.js";

interface InternalTask {
	id: string;
	name: string;
	kind: TaskKind;
	expression: string;
	/** Next run time (epoch ms). */
	nextRunAt: number;
	/** Last run time (epoch ms). */
	lastRunAt?: number;
	invocations: number;
	lastError?: string;
	status: "running" | "stopped" | "paused";
	handler: ScheduleHandler;
	/** Interval handle for `interval` / `timeout` tasks. */
	timer?: ReturnType<typeof setInterval> | ReturnType<typeof setTimeout>;
}

export interface MemoryBackendOptions {
	/** Tick interval in ms. Default: 1000. */
	tickMs?: number;
	/** Default cron timezone. */
	defaultTimezone?: string;
	/** Skip tasks that fall behind by more than this many ms. Default: 60_000. */
	maxDriftMs?: number;
}

export class MemorySchedulesBackend implements ScheduleRegistry {
	#tasks = new Map<string, InternalTask>();
	#byName = new Map<string, string>(); // name → id
	#listeners = new Set<ScheduleEventListener>();
	#tickHandle: ReturnType<typeof setInterval> | null = null;
	#tickMs: number;
	#maxDriftMs: number;
	#defaultTimezone: string | undefined = undefined;
	#nextId = 1;

	constructor(options: MemoryBackendOptions = {}) {
		this.#tickMs = options.tickMs ?? 1000;
		this.#maxDriftMs = options.maxDriftMs ?? 60_000;
		this.#defaultTimezone = options.defaultTimezone;
	}

	// ===========================================================================
	// Public API
	// ===========================================================================

	addCron(
		name: string,
		expression: CronExpression,
		handler: ScheduleHandler,
		options: CronOptions = {},
	): string {
		const id = this.#allocateId();
		const next = nextCron(
			expression,
			options.runOnInit ? new Date(Date.now() - 1000) : new Date(),
		);
		const task: InternalTask = {
			id,
			name,
			kind: "cron",
			expression,
			nextRunAt: next?.getTime() ?? Date.now() + 60_000,
			invocations: 0,
			status: "running",
			handler,
		};
		this.#tasks.set(id, task);
		this.#byName.set(name, id);
		this.#emit({
			kind: "task:registered",
			id,
			name,
			taskKind: "cron",
			expression,
		});
		return id;
	}

	addInterval(name: string, ms: number, handler: ScheduleHandler): string {
		const id = this.#allocateId();
		const task: InternalTask = {
			id,
			name,
			kind: "interval",
			expression: `${ms}ms`,
			nextRunAt: Date.now() + ms,
			invocations: 0,
			status: "running",
			handler,
		};
		task.timer = setInterval(() => this.#runTask(id), ms);
		this.#tasks.set(id, task);
		this.#byName.set(name, id);
		this.#emit({
			kind: "task:registered",
			id,
			name,
			taskKind: "interval",
			expression: `${ms}ms`,
		});
		return id;
	}

	addTimeout(name: string, ms: number, handler: ScheduleHandler): string {
		const id = this.#allocateId();
		const task: InternalTask = {
			id,
			name,
			kind: "timeout",
			expression: `${ms}ms`,
			nextRunAt: Date.now() + ms,
			invocations: 0,
			status: "running",
			handler,
		};
		task.timer = setTimeout(() => this.#runOnceAndRemove(id), ms);
		this.#tasks.set(id, task);
		this.#byName.set(name, id);
		this.#emit({
			kind: "task:registered",
			id,
			name,
			taskKind: "timeout",
			expression: `${ms}ms`,
		});
		return id;
	}

	delete(idOrName: string): boolean {
		const id = this.#resolveId(idOrName);
		if (!id) return false;
		const task = this.#tasks.get(id);
		if (!task) return false;
		this.#clearTimer(task);
		this.#tasks.delete(id);
		this.#byName.delete(task.name);
		this.#emit({ kind: "task:deleted", id });
		return true;
	}

	list(): ScheduledTask[] {
		return [...this.#tasks.values()].map((t) => this.#toPublic(t));
	}

	get(idOrName: string): ScheduledTask | undefined {
		const id = this.#resolveId(idOrName);
		if (!id) return undefined;
		const task = this.#tasks.get(id);
		return task ? this.#toPublic(task) : undefined;
	}

	pause(idOrName: string): boolean {
		const id = this.#resolveId(idOrName);
		if (!id) return false;
		const task = this.#tasks.get(id);
		if (!task) return false;
		this.#clearTimer(task);
		task.status = "paused";
		this.#emit({ kind: "task:paused", id });
		return true;
	}

	resume(idOrName: string): boolean {
		const id = this.#resolveId(idOrName);
		if (!id) return false;
		const task = this.#tasks.get(id);
		if (!task) return false;
		if (task.kind === "interval" && !task.timer) {
			task.timer = setInterval(
				() => this.#runTask(id),
				Number(task.expression.replace("ms", "")),
			);
		}
		task.status = "running";
		this.#emit({ kind: "task:resumed", id });
		return true;
	}

	async stop(): Promise<void> {
		for (const task of this.#tasks.values()) {
			this.#clearTimer(task);
		}
		this.#tasks.clear();
		this.#byName.clear();
		if (this.#tickHandle) clearInterval(this.#tickHandle);
		this.#tickHandle = null;
	}

	// ===========================================================================
	// Events
	// ===========================================================================

	on(listener: ScheduleEventListener): () => void {
		this.#listeners.add(listener);
		return () => this.#listeners.delete(listener);
	}

	// ===========================================================================
	// Lifecycle
	// ===========================================================================

	/** Start the tick loop. Idempotent. */
	start(): void {
		if (this.#tickHandle) return;
		this.#tickHandle = setInterval(() => this.#tick(), this.#tickMs);
		// Don't keep Node alive just for the tick.
		const handle = this.#tickHandle as unknown as { unref?: () => void };
		if (typeof handle.unref === "function") handle.unref();
	}

	// ===========================================================================
	// Internal
	// ===========================================================================

	#allocateId(): string {
		return `sched-${this.#nextId++}`;
	}

	#resolveId(idOrName: string): string | null {
		if (this.#tasks.has(idOrName)) return idOrName;
		return this.#byName.get(idOrName) ?? null;
	}

	#toPublic(t: InternalTask): ScheduledTask {
		const public_: ScheduledTask = {
			id: t.id,
			name: t.name,
			kind: t.kind,
			expression: t.expression,
			status: t.status,
			invocations: t.invocations,
		};
		if (t.lastRunAt !== undefined) {
			public_.lastRunAt = new Date(t.lastRunAt).toISOString();
		}
		public_.nextRunAt = new Date(t.nextRunAt).toISOString();
		if (t.lastError !== undefined) public_.lastError = t.lastError;
		return public_;
	}

	#clearTimer(task: InternalTask): void {
		if (task.timer) {
			clearInterval(task.timer as ReturnType<typeof setInterval>);
			clearTimeout(task.timer as ReturnType<typeof setTimeout>);
			task.timer = undefined;
		}
	}

	#tick(): void {
		const now = Date.now();
		for (const [id, task] of this.#tasks) {
			if (task.status !== "running") continue;
			if (task.kind !== "cron") continue; // intervals/timeouts fire via their own timer
			if (task.nextRunAt > now) continue;
			void this.#runTask(id);
		}
	}

	async #runTask(id: string): Promise<void> {
		const task = this.#tasks.get(id);
		if (!task) return;
		const startedAt = new Date();
		this.#emit({
			kind: "task:invoked",
			id,
			name: task.name,
			startedAt: startedAt.toISOString(),
		});
		const start = Date.now();
		try {
			const result = await task.handler();
			task.invocations++;
			task.lastRunAt = start;
			task.lastError = undefined;
			this.#emit({
				kind: "task:completed",
				id,
				name: task.name,
				durationMs: Date.now() - start,
				returnvalue: result,
			});
		} catch (err) {
			task.invocations++;
			task.lastRunAt = start;
			const error = err instanceof Error ? err : new Error(String(err));
			task.lastError = error.message;
			this.#emit({ kind: "task:failed", id, name: task.name, error });
		} finally {
			// Schedule the next cron run.
			if (task.kind === "cron" && task.status === "running") {
				const next = nextCron(task.expression, new Date());
				if (next) {
					const drift = next.getTime() - Date.now();
					task.nextRunAt =
						drift > this.#maxDriftMs ? Date.now() + 60_000 : next.getTime();
				} else {
					task.nextRunAt = Date.now() + 60_000;
				}
			}
		}
	}

	#runOnceAndRemove(id: string): void {
		void this.#runTask(id);
		const task = this.#tasks.get(id);
		if (task) {
			this.#tasks.delete(id);
			this.#byName.delete(task.name);
			this.#emit({ kind: "task:deleted", id });
		}
	}

	#emit(event: ScheduleEvent): void {
		for (const l of this.#listeners) {
			void Promise.resolve(l(event));
		}
	}
}

// Re-export the parser's CronExpression class for users who want to
// parse expressions manually.
export { CronExpr };
