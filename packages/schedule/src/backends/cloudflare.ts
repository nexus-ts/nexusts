/**
 * Cloudflare Cron Triggers backend.
 *
 * Cloudflare Cron Triggers are configured in `wrangler.toml`:
 *
 *   [[triggers.crons]]
 *   cron = "every 15m (your expression)"
 *
 * The trigger fires a Worker's `scheduled(event, env, ctx)` handler.
 * We dispatch that to the registered task by name.
 *
 * This backend is a **registration-only facade**: tasks are stored
 * locally (so `nx route:list`-style introspection works), but the
 * actual scheduling is at the platform level. The worker's `scheduled`
 * export calls `dispatch(event)` to run the matching task.
 */

import type {
	CronExpression,
	CronOptions,
	ScheduledTask,
	ScheduleEvent,
	ScheduleEventListener,
	ScheduleHandler,
	ScheduleRegistry,
} from "../types.js";

interface InternalTask {
	id: string;
	name: string;
	expression: string;
	handler: ScheduleHandler;
	options: CronOptions;
}

/** Shape of the Worker's `scheduled` event. Mirrors `cloudflare-types`. */
export interface CloudflareScheduledEvent {
	cron: string;
	/** ISO timestamp of when the trigger fired. */
	scheduledTime: Date | number;
}

export interface CloudflareSchedulesOptions {
	/** Validate that registered expressions match the wrangler.toml trigger. Default: true. */
	validateAgainstTrigger?: boolean;
}

export class CloudflareSchedulesBackend implements ScheduleRegistry {
	#tasks = new Map<string, InternalTask>();
	#byName = new Map<string, string>();
	#listeners = new Set<ScheduleEventListener>();
	#nextId = 1;
	#validate: boolean;

	constructor(options: CloudflareSchedulesOptions = {}) {
		this.#validate = options.validateAgainstTrigger ?? true;
	}

	addCron(
		name: string,
		expression: CronExpression,
		handler: ScheduleHandler,
		options: CronOptions = {},
	): string {
		const id = `sched-${this.#nextId++}`;
		this.#tasks.set(id, { id, name, expression, handler, options });
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

	addInterval(): string {
		throw new Error(
			"[schedule/cloudflare] setInterval is not supported on Workers. " +
				"Use @Cron with a short interval or use the memory backend for in-process scheduling.",
		);
	}

	addTimeout(): string {
		throw new Error(
			"[schedule/cloudflare] setTimeout is not supported on Workers. " +
				'Use @Cron with a delay (e.g. "@every 30s") or run the work from a request handler.',
		);
	}

	delete(idOrName: string): boolean {
		const id = this.#resolveId(idOrName);
		if (!id) return false;
		const task = this.#tasks.get(id);
		if (!task) return false;
		this.#tasks.delete(id);
		this.#byName.delete(task.name);
		this.#emit({ kind: "task:deleted", id });
		return true;
	}

	list(): ScheduledTask[] {
		return [...this.#tasks.values()].map((t) => ({
			id: t.id,
			name: t.name,
			kind: "cron",
			expression: t.expression,
			status: "running",
			invocations: 0,
		}));
	}

	get(idOrName: string): ScheduledTask | undefined {
		const id = this.#resolveId(idOrName);
		if (!id) return undefined;
		const t = this.#tasks.get(id);
		return t
			? {
					id: t.id,
					name: t.name,
					kind: "cron",
					expression: t.expression,
					status: "running",
					invocations: 0,
				}
			: undefined;
	}

	pause(): boolean {
		// No-op — Cloudflare controls the trigger. Edit wrangler.toml to disable.
		return false;
	}

	resume(): boolean {
		return false;
	}

	async stop(): Promise<void> {
		this.#tasks.clear();
		this.#byName.clear();
	}

	// ===========================================================================
	// Events
	// ===========================================================================

	on(listener: ScheduleEventListener): () => void {
		this.#listeners.add(listener);
		return () => this.#listeners.delete(listener);
	}

	// ===========================================================================
	// Worker integration
	// ===========================================================================

	/**
	 * Return the Worker's `scheduled()` handler. Mount it in the
	 * default export:
	 *
	 *   export default {
	 *     fetch: app.fetch,
	 *     scheduled: backend.scheduledHandler(),
	 *   };
	 *
	 * The handler dispatches based on the trigger's cron expression
	 * (or, when validation is disabled, by event ordering).
	 */
	scheduledHandler(): (event: CloudflareScheduledEvent) => Promise<void> {
		return async (event) => {
			for (const task of this.#tasks.values()) {
				if (this.#validate && task.expression !== event.cron) continue;
				await this.#dispatch(task, event);
			}
		};
	}

	async #dispatch(
		task: InternalTask,
		event: CloudflareScheduledEvent,
	): Promise<void> {
		const startedAt = new Date();
		this.#emit({
			kind: "task:invoked",
			id: task.id,
			name: task.name,
			startedAt: startedAt.toISOString(),
		});
		try {
			const result = await task.handler();
			this.#emit({
				kind: "task:completed",
				id: task.id,
				name: task.name,
				durationMs: Date.now() - startedAt.getTime(),
				returnvalue: result,
			});
		} catch (err) {
			const error = err instanceof Error ? err : new Error(String(err));
			this.#emit({ kind: "task:failed", id: task.id, name: task.name, error });
		}
		void event; // (kept for future event-based logic)
	}

	// ===========================================================================
	// Internal
	// ===========================================================================

	#resolveId(idOrName: string): string | null {
		if (this.#tasks.has(idOrName)) return idOrName;
		return this.#byName.get(idOrName) ?? null;
	}

	#emit(event: ScheduleEvent): void {
		for (const l of this.#listeners) {
			void Promise.resolve(l(event));
		}
	}
}
