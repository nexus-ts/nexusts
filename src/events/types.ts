/**
 * Event System types — the public contract for `nexus/events`.
 *
 * Mirrors `@nestjs/event-emitter` and AdonisJS's emitter:
 *   - `emit(name, payload)` to dispatch an event
 *   - `@OnEvent(name)` to subscribe
 *   - Wildcards: `*` (single segment) and `**` (multi-segment)
 *   - Priorities (lower runs first; default 5)
 *   - Guards (`if` predicate) for conditional handling
 *   - Sync and async listeners
 *
 * The events module is separate from `nexus/core` and ships as its
 * own bundle entry point.
 */

// ---------------------------------------------------------------------------
// Event names
// ---------------------------------------------------------------------------

/**
 * An event name. Convention: `domain.action` (e.g. `user.created`,
 * `order.shipped`). Wildcards:
 *
 *   - star — matches a single segment (`user.star` → user.created)
 *   - double-star — matches one or more segments (`star-star`)
 *   - exact — matches only the literal name
 */
export type EventName = string;

/** Listener priority. Lower runs first. Default: 5. */
export type EventPriority = number;

// ---------------------------------------------------------------------------
// Listener shape
// ---------------------------------------------------------------------------

/** A listener function. Sync or async. */
export type EventListener<T = unknown> = (payload: T) => void | Promise<void>;

/** Options attached to a listener registration. */
export interface ListenerOptions {
	/** Lower runs first. Default: 5. */
	priority?: EventPriority;
	/** Skip this listener unless the predicate returns true. */
	if?: (payload: any) => boolean | Promise<boolean>;
	/** Mark the listener as a one-shot — auto-removed after the first match. */
	once?: boolean;
}

// ---------------------------------------------------------------------------
// Registration record
// ---------------------------------------------------------------------------

interface InternalListener {
	id: string;
	name: string; // exact event name (post-wildcard)
	originalPattern: string;
	priority: EventPriority;
	guard?: (payload: any) => boolean | Promise<boolean>;
	once: boolean;
	listener: EventListener;
	createdAt: number;
}

// ---------------------------------------------------------------------------
// Dispatch result
// ---------------------------------------------------------------------------

/** Result of a single `emit()` call. */
export interface EmitResult {
	name: EventName;
	/** Number of listeners that matched the pattern. */
	matched: number;
	/** Number of listeners that completed (sync or async) without throwing. */
	completed: number;
	/** Number of listeners that threw or rejected. */
	failed: number;
	/** Per-listener error messages (if any). */
	errors: Array<{ listenerId: string; listenerName: string; error: string }>;
}

// ---------------------------------------------------------------------------
// Emitter contract
// ---------------------------------------------------------------------------

/**
 * Emitter contract — every backend (we ship one for now: in-process)
 * implements this. The `EventService` is the user-facing facade.
 */
export interface EventEmitter {
	/** Register a listener. Returns the assigned listener id. */
	on<T = unknown>(
		pattern: EventName,
		listener: EventListener<T>,
		options?: ListenerOptions,
	): string;

	/** Register a one-shot listener. Returns the assigned listener id. */
	once<T = unknown>(
		pattern: EventName,
		listener: EventListener<T>,
		options?: Omit<ListenerOptions, "once">,
	): string;

	/** Remove a listener by id (or by pattern — all matching listeners). */
	off(idOrPattern: string): number;

	/** Emit an event. Returns the dispatch result. */
	emit<T = unknown>(name: EventName, payload?: T): Promise<EmitResult>;

	/** Synchronous variant — only awaits already-resolved listeners. */
	emitSync<T = unknown>(name: EventName, payload?: T): EmitResult;

	/** Number of registered listeners. */
	listenerCount(pattern?: EventName): number;

	/** List registered listeners (for debugging). */
	listListeners(pattern?: EventName): Array<{
		id: string;
		pattern: string;
		priority: EventPriority;
		once: boolean;
	}>;

	/** Remove every listener. */
	removeAllListeners(): void;
}

// ---------------------------------------------------------------------------
// Events emitted by the emitter itself
// ---------------------------------------------------------------------------

/** Internal events emitted by the emitter itself (not user-facing). */
export type EmitterEvent =
	| { kind: "listener:registered"; id: string; pattern: string }
	| { kind: "listener:removed"; id: string }
	| { kind: "listener:fired"; id: string; pattern: string; durationMs: number }
	| { kind: "listener:failed"; id: string; pattern: string; error: Error }
	| {
			kind: "listener:skipped";
			id: string;
			pattern: string;
			reason: "guard" | "once" | "pattern";
	  };

export type EmitterEventListener = (
	event: EmitterEvent,
) => void | Promise<void>;

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

export interface EventsConfig {
	/**
	 * Maximum number of listeners that can be registered for a single
	 * pattern. Default: 10. Helps catch leaks.
	 */
	maxListenersPerPattern?: number;
	/**
	 * When true, `emit()` rejects (throws AggregateError-like) if any
	 * listener rejects. When false (default), errors are collected in
	 * `EmitResult.errors` and dispatch continues.
	 */
	throwOnError?: boolean;
	/** Default priority for new listeners. Default: 5. */
	defaultPriority?: EventPriority;
}
