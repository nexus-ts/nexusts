/**
 * In-process event emitter with wildcard matching, priorities, and
 * guards. Mirrors `@nestjs/event-emitter` and AdonisJS's emitter.
 *
 * Wildcards:
 *   - star (single segment)        — `user.star` matches `user.created`
 *   - double-star (multi segment)  — `star-star` matches `user.created` and `user.profile.updated`
 *   - exact                       — `user.created` matches only itself
 *
 * Priority: lower runs first (default 5). When two listeners have the
 * same priority, registration order is preserved (FIFO).
 *
 * Guards: a listener can register an `if(payload) → boolean` predicate;
 * when it returns false, the listener is skipped.
 *
 * Errors: by default, a throwing listener does NOT stop the rest of
 * the dispatch — errors are collected in `EmitResult.errors`. Set
 * `EventsConfig.throwOnError: true` to make `emit()` reject instead.
 */

import type {
	EmitResult,
	EmitterEvent,
	EmitterEventListener,
	EventEmitter,
	EventListener,
	EventName,
	EventPriority,
	EventsConfig,
	ListenerOptions,
} from "./types.js";

interface InternalListener {
	id: string;
	pattern: string;
	regex: RegExp | null; // null = exact match
	priority: EventPriority;
	guard?: (payload: any) => boolean | Promise<boolean>;
	once: boolean;
	listener: EventListener;
	createdAt: number;
}

export class NexusEventEmitter implements EventEmitter {
	#listeners: InternalListener[] = [];
	#emitterListeners = new Set<EmitterEventListener>();
	#maxPerPattern: number;
	#throwOnError: boolean;
	#defaultPriority: EventPriority;
	#nextId = 1;

	constructor(config: EventsConfig = {}) {
		this.#maxPerPattern = config.maxListenersPerPattern ?? 10;
		this.#throwOnError = config.throwOnError ?? false;
		this.#defaultPriority = config.defaultPriority ?? 5;
	}

	// ===========================================================================
	// Public API
	// ===========================================================================

	on<T = unknown>(
		pattern: EventName,
		listener: EventListener<T>,
		options: ListenerOptions = {},
	): string {
		const existing = this.#listeners.filter((l) => l.pattern === pattern);
		if (existing.length >= this.#maxPerPattern) {
			throw new Error(
				`[events] Too many listeners registered for "${pattern}" ` +
					`(max ${this.#maxPerPattern}). Increase \`maxListenersPerPattern\` ` +
					`or call \`off()\` on stale listeners.`,
			);
		}
		const id = this.#allocateId();
		const internal: InternalListener = {
			id,
			pattern,
			regex: compilePattern(pattern),
			priority: options.priority ?? this.#defaultPriority,
			once: options.once ?? false,
			listener: listener as EventListener,
			createdAt: Date.now(),
		};
		if (options.if !== undefined) {
			internal.guard = options.if as (
				payload: any,
			) => boolean | Promise<boolean>;
		}
		this.#listeners.push(internal);
		this.#sortListeners();
		this.#emitEmitterEvent({ kind: "listener:registered", id, pattern });
		return id;
	}

	once<T = unknown>(
		pattern: EventName,
		listener: EventListener<T>,
		options: Omit<ListenerOptions, "once"> = {},
	): string {
		return this.on(pattern, listener, { ...options, once: true });
	}

	off(idOrPattern: string): number {
		const before = this.#listeners.length;
		const removed: InternalListener[] = [];
		this.#listeners = this.#listeners.filter((l) => {
			const match = l.id === idOrPattern || l.pattern === idOrPattern;
			if (match) removed.push(l);
			return !match;
		});
		for (const r of removed) {
			this.#emitEmitterEvent({ kind: "listener:removed", id: r.id });
		}
		return before - this.#listeners.length;
	}

	async emit<T = unknown>(name: EventName, payload?: T): Promise<EmitResult> {
		const result: EmitResult = {
			name,
			matched: 0,
			completed: 0,
			failed: 0,
			errors: [],
		};
		const matches = this.#matchingListeners(name);
		result.matched = matches.length;
		if (matches.length === 0) return result;

		// Run guards in parallel (they're cheap), then dispatch in priority order.
		const eligible: Array<{ listener: InternalListener; payload: any }> = [];
		for (const l of matches) {
			if (l.guard) {
				try {
					const ok = await l.guard(payload);
					if (!ok) {
						this.#emitEmitterEvent({
							kind: "listener:skipped",
							id: l.id,
							pattern: l.pattern,
							reason: "guard",
						});
						continue;
					}
				} catch {
					// Guard threw — skip.
					this.#emitEmitterEvent({
						kind: "listener:skipped",
						id: l.id,
						pattern: l.pattern,
						reason: "guard",
					});
					continue;
				}
			}
			eligible.push({ listener: l, payload });
		}

		// Dispatch eligible listeners in priority order.
		// `once` listeners are removed on success or failure.
		const toRemove: InternalListener[] = [];
		for (const { listener, payload: p } of eligible) {
			const start = Date.now();
			try {
				await listener.listener(p);
				result.completed++;
				this.#emitEmitterEvent({
					kind: "listener:fired",
					id: listener.id,
					pattern: listener.pattern,
					durationMs: Date.now() - start,
				});
			} catch (err) {
				result.failed++;
				const error = err instanceof Error ? err : new Error(String(err));
				result.errors.push({
					listenerId: listener.id,
					listenerName: listener.pattern,
					error: error.message,
				});
				this.#emitEmitterEvent({
					kind: "listener:failed",
					id: listener.id,
					pattern: listener.pattern,
					error,
				});
				if (this.#throwOnError) {
					throw error;
				}
			} finally {
				if (listener.once) toRemove.push(listener);
			}
		}
		if (toRemove.length > 0) {
			const ids = new Set(toRemove.map((l) => l.id));
			this.#listeners = this.#listeners.filter((l) => !ids.has(l.id));
		}
		return result;
	}

	emitSync<T = unknown>(name: EventName, payload?: T): EmitResult {
		const result: EmitResult = {
			name,
			matched: 0,
			completed: 0,
			failed: 0,
			errors: [],
		};
		const matches = this.#matchingListeners(name);
		result.matched = matches.length;
		if (matches.length === 0) return result;

		const toRemove: InternalListener[] = [];
		for (const l of matches) {
			if (l.guard) {
				let ok: boolean;
				try {
					ok = l.guard(payload) as boolean;
				} catch {
					continue;
				}
				if (!ok) continue;
			}
			const start = Date.now();
			try {
				const ret = l.listener(payload);
				if (ret && typeof (ret as Promise<unknown>).then === "function") {
					// Promise — fire-and-forget; not awaited in sync mode.
					(ret as Promise<unknown>).then(
						() => {
							result.completed++;
							if (l.once) toRemove.push(l);
						},
						(err: unknown) => {
							result.failed++;
							result.errors.push({
								listenerId: l.id,
								listenerName: l.pattern,
								error: err instanceof Error ? err.message : String(err),
							});
							if (l.once) toRemove.push(l);
						},
					);
				} else {
					result.completed++;
					if (l.once) toRemove.push(l);
				}
				this.#emitEmitterEvent({
					kind: "listener:fired",
					id: l.id,
					pattern: l.pattern,
					durationMs: Date.now() - start,
				});
			} catch (err) {
				result.failed++;
				const error = err instanceof Error ? err : new Error(String(err));
				result.errors.push({
					listenerId: l.id,
					listenerName: l.pattern,
					error: error.message,
				});
				if (l.once) toRemove.push(l);
			}
		}
		if (toRemove.length > 0) {
			const ids = new Set(toRemove.map((l) => l.id));
			this.#listeners = this.#listeners.filter((l) => !ids.has(l.id));
		}
		return result;
	}

	listenerCount(pattern?: EventName): number {
		if (pattern === undefined) return this.#listeners.length;
		return this.#listeners.filter((l) => l.pattern === pattern).length;
	}

	listListeners(pattern?: EventName): Array<{
		id: string;
		pattern: string;
		priority: EventPriority;
		once: boolean;
	}> {
		const list =
			pattern === undefined
				? this.#listeners
				: this.#listeners.filter((l) => l.pattern === pattern);
		return list.map((l) => ({
			id: l.id,
			pattern: l.pattern,
			priority: l.priority,
			once: l.once,
		}));
	}

	removeAllListeners(): void {
		const ids = this.#listeners.map((l) => l.id);
		this.#listeners = [];
		for (const id of ids) {
			this.#emitEmitterEvent({ kind: "listener:removed", id });
		}
	}

	/** Subscribe to emitter-internal events (registration, firing, etc.). */
	onEmitterEvent(listener: EmitterEventListener): () => void {
		this.#emitterListeners.add(listener);
		return () => this.#emitterListeners.delete(listener);
	}

	// ===========================================================================
	// Internal
	// ===========================================================================

	#allocateId(): string {
		return `evt-${this.#nextId++}`;
	}

	#matchingListeners(name: EventName): InternalListener[] {
		return this.#listeners.filter((l) => {
			if (l.regex === null) return l.pattern === name;
			return l.regex.test(name);
		});
	}

	#sortListeners(): void {
		// Stable sort: by priority asc, then createdAt asc.
		this.#listeners.sort((a, b) => {
			if (a.priority !== b.priority) return a.priority - b.priority;
			return a.createdAt - b.createdAt;
		});
	}

	#emitEmitterEvent(event: EmitterEvent): void {
		for (const l of this.#emitterListeners) {
			void Promise.resolve(l(event));
		}
	}
}

// ---------------------------------------------------------------------------
// Pattern compiler
// ---------------------------------------------------------------------------

/**
 * Compile an event-name pattern into a RegExp. `null` means exact
 * match (no wildcards).
 *
 * Strategy:
 *   1. Replace `**` and `*` with sentinel placeholders that survive
 *      regex escaping.
 *   2. Escape all other regex metacharacters.
 *   3. Replace placeholders with the actual regex fragments
 *      (`**` → `.*`, `*` → `[^.]+`).
 */
export function compilePattern(pattern: string): RegExp | null {
	if (!pattern.includes("*")) return null;

	const DOUBLE = "\x00DOUBLE\x00";
	const SINGLE = "\x00SINGLE\x00";
	let p = pattern.split("**").join(DOUBLE).split("*").join(SINGLE);

	// Escape regex metacharacters (except our placeholders, which are
	// control characters that have no regex meaning).
	p = p.replace(/[.+?^${}()|[\]\\]/g, "\\$&");

	p = p.split(DOUBLE).join(".*").split(SINGLE).join("[^.]+");
	return new RegExp(`^${p}$`);
}
