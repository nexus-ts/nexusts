/**
 * `nexusjs/sse` — Server-Sent Events.
 *
 *   @Get('/events')
 *   events() {
 *     return sse((stream) => {
 *       const id = setInterval(() => {
 *         stream.send({ event: 'tick', data: Date.now() });
 *       }, 1000);
 *       stream.onClose(() => clearInterval(id));
 *     });
 *   }
 *
 *   // Or with reconnection support:
 *   @Get('/events')
 *   events(@LastEventId() lastId: string | null) {
 *     return sse(async (stream) => {
 *       // Replay events with id > lastId (if you have them).
 *       // Then continue with the live stream.
 *     });
 *   }
 *
 * Features:
 *   - Type-safe event payloads
 *   - Auto-cleanup on client disconnect
 *   - Last-Event-ID support for reconnection
 *   - JSON helpers (auto-stringify objects)
 *   - `retry:` hint to control client reconnect timing
 */

import { METADATA_KEY } from "@nexusts/core";
import { safeGetMeta, safeDefineMeta, safeHasMeta } from "@nexusts/core/di/safe-reflect";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/**
 * A single SSE event. The shape mirrors the wire format:
 *
 *   - `id`    — event id (used for `Last-Event-ID` reconnection)
 *   - `event` — event name (client subscribes via EventSource.addEventListener)
 *   - `data`  — payload (string, object, or number)
 *   - `retry` — reconnect delay in ms (sent as `retry: <ms>`)
 *
 * `data` accepts anything JSON-serializable. Objects are auto-stringified
 * via `JSON.stringify`. Strings are sent verbatim (one `data:` line per
 * newline).
 */
export interface SseEvent<T = unknown> {
	id?: string | number;
	event?: string;
	data: T;
	/** Reconnect delay (ms) hint. */
	retry?: number;
}

/**
 * Per-stream controller. Returned to the `sse()` callback.
 *
 *   const stream = new SseStream(api);
 *   stream.send({ data: 'hello' });                // data-only event
 *   stream.send({ event: 'tick', data: { x: 1 } });
 *   stream.close();
 */
export interface SseStreamController {
	/** Push an event. Safe to call after `close()` (no-op). */
	send<T = unknown>(event: SseEvent<T> | string): void;
	/** Close the stream. Idempotent. Awaits pending writes. */
	close(): void | Promise<void>;
	/** True after `close()` has been called. */
	get closed(): boolean;
	/** Register a callback to run on client disconnect (or `close()`). */
	onClose(cb: () => void): void;
	/** Sleep for `ms` milliseconds (preserves the connection). */
	sleep(ms: number): Promise<unknown>;
}

// ---------------------------------------------------------------------------
// Decorator
// ---------------------------------------------------------------------------

/** Marks a controller method as an SSE endpoint. OpenAPI hint. */
export function SseEventMeta(options: { name?: string; description?: string } = {}): MethodDecorator {
	return (target: object, propertyKey: string | symbol) => {
		safeDefineMeta(
			"nexus:sse:event",
			options,
			target.constructor,
			propertyKey,
		);
	};
}

/**
 * `@LastEventId()` — inject the `Last-Event-ID` header from the
 * client's reconnect attempt. `null` if the header is missing.
 */
export function LastEventId(): ParameterDecorator {
	return (target: object, propertyKey: string | symbol | undefined, parameterIndex: number) => {
		const t = propertyKey === undefined ? (target as Function) : (target.constructor as Function);
		const existing: number[] =
			safeGetMeta("nexus:sse:lastEventId", t, propertyKey as string | symbol) ?? [];
		existing.push(parameterIndex);
		safeDefineMeta("nexus:sse:lastEventId", existing, t, propertyKey as string | symbol);
	};
}

export const SSE_META = "nexus:sse:event";
export const SSE_LAST_EVENT_ID_META = "nexus:sse:lastEventId";
export { METADATA_KEY };
