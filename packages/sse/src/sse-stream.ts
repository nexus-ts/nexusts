/**
 * `SseStream` — per-stream controller exposed to the `sse()` callback.
 *
 * The class wraps Hono's `SSEStreamingApi` so user code never sees
 * the Hono-specific shape. It owns:
 *
 *   - A `closed` flag (idempotent `close()`)
 *   - A list of `onClose` callbacks fired on disconnect OR close
 *   - JSON auto-serialization for object payloads
 *
 * Instances are created by `sse()` and passed to the user callback.
 * They should not be constructed directly.
 */
import type { SseEvent, SseStreamController } from "./types.js";

/** Minimal subset of Hono's `SSEStreamingApi` we depend on. */
interface HonoSSEApi {
	writeSSE(message: { id?: string; event?: string; data: string; retry?: number }): Promise<void>;
	sleep(ms: number): Promise<unknown>;
	onAbort(callback: () => void): void;
	close(): Promise<void>;
	abort(): void;
}

export class SseStream implements SseStreamController {
	#api: HonoSSEApi;
	#closed = false;
	#onClose: Array<() => void> = [];
	#pendingWrites: Set<Promise<void>> = new Set();

	constructor(api: HonoSSEApi) {
		this.#api = api;
		// When the client disconnects, Hono calls onAbort.
		// Run our user-facing cleanup chain.
		this.#api.onAbort(() => this.#fireClose());
	}

	get closed(): boolean {
		return this.#closed;
	}

	/** Push an event. No-op after `close()`. */
	send<T = unknown>(event: SseEvent<T> | string): void {
		if (this.#closed) return;
		const e: SseEvent<unknown> = typeof event === "string" ? { data: event } : event;
		const dataStr =
			typeof e.data === "string" ? e.data : JSON.stringify(e.data);
		const promise = this.#api
			.writeSSE({
				id: e.id !== undefined ? String(e.id) : undefined,
				event: e.event,
				data: dataStr,
				retry: e.retry,
			})
			.catch(() => {
				/* swallow — abort happened mid-write */
			})
			.finally(() => {
				this.#pendingWrites.delete(promise);
			});
		this.#pendingWrites.add(promise);
	}

	/** Close the stream. Idempotent. Waits for pending writes. */
	async close(): Promise<void> {
		if (this.#closed) return;
		this.#closed = true;
		// Wait for all pending writes to flush.
		if (this.#pendingWrites.size > 0) {
			await Promise.allSettled([...this.#pendingWrites]);
		}
		await this.#api.close();
		this.#fireClose();
	}

	/** Register a cleanup callback. */
	onClose(cb: () => void): void {
		if (this.#closed) {
			try {
				cb();
			} catch {
				/* ignore */
			}
			return;
		}
		this.#onClose.push(cb);
	}

	/** Sleep for `ms` (preserves the open connection). */
	sleep(ms: number): Promise<unknown> {
		return this.#api.sleep(ms);
	}

	#fireClose(): void {
		if (!this.#closed) {
			this.#closed = true;
		}
		const cbs = this.#onClose;
		this.#onClose = [];
		for (const cb of cbs) {
			try {
				cb();
			} catch {
				/* swallow — we are tearing down */
			}
		}
	}

	/** Internal escape hatch. Do not use from user code. */
	_internal(): HonoSSEApi {
		return this.#api;
	}

	/** Internal: indicate that the underlying API was aborted by Hono. */
	_internalAbort(): void {
		this.#api.abort();
		this.#fireClose();
	}
}
