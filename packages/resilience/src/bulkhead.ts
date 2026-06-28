/**
 * `Bulkhead` — concurrency limiter with optional queue.
 *
 *   import { Bulkhead } from "@nexusts/resilience";
 *
 *   const api = new Bulkhead({ maxConcurrent: 5, maxQueued: 100 });
 *
 *   const result = await api.execute(() => fetch("..."));
 *
 * Behavior:
 *   - `maxConcurrent`: how many `execute()` calls may be in-flight at once.
 *   - `maxQueued`: how many additional callers may wait in the queue
 *     for a free slot.
 *   - `rejectOnFull` (default false): when the queue is full, reject
 *     immediately with `BulkheadFullError` instead of waiting.
 *
 * The bulkhead is fair: callers are released in FIFO order. Each
 * waiter carries its own resolver; when a slot frees up we wake the
 * next waiter in the queue, who then re-enters and runs its function.
 */
import type { BulkheadConfig } from "./types.js";

const DEFAULTS = {
	maxConcurrent: 10,
	maxQueued: 100,
	rejectOnFull: false,
};

/** Thrown when `rejectOnFull` is set and the queue is at capacity. */
export class BulkheadFullError extends Error {
	readonly name = "BulkheadFullError";
	constructor(public readonly name_: string) {
		super(`Bulkhead "${name_}" is at capacity`);
	}
}

/** A queued caller. Resolves when this caller gets a slot. */
interface SlotToken {
	/** Acquired by the drain loop when a slot opens. */
	acquired: boolean;
	/** Cancelled before we got a slot. */
	cancelled: boolean;
	resolve: () => void;
	reject: (e: unknown) => void;
}

export class Bulkhead {
	readonly name: string;
	readonly config: Required<Omit<BulkheadConfig, "name">>;

	private inFlight = 0;
	private queue: SlotToken[] = [];

	constructor(config: BulkheadConfig = {}) {
		this.name = config.name ?? "bulkhead";
		this.config = {
			maxConcurrent: config.maxConcurrent ?? DEFAULTS.maxConcurrent,
			maxQueued: config.maxQueued ?? DEFAULTS.maxQueued,
			rejectOnFull: config.rejectOnFull ?? DEFAULTS.rejectOnFull,
		};
	}

	get stats(): { inFlight: number; queued: number } {
		return { inFlight: this.inFlight, queued: this.queue.length };
	}

	/** Run `fn` through the bulkhead. */
	async execute<T>(fn: () => Promise<T> | T): Promise<T> {
		// Fast path: a slot is free.
		if (this.inFlight < this.config.maxConcurrent) {
			this.inFlight += 1;
			try {
				return await fn();
			} finally {
				this.inFlight -= 1;
				this.drain();
			}
		}

		// No slot — wait for one.
		if (this.queue.length >= this.config.maxQueued) {
			throw new BulkheadFullError(this.name);
		}

		const token = this.enqueue();
			await token.acquire();
		// Slot acquired. Run and release on completion.
		this.inFlight += 1;
		try {
			return await fn();
		} finally {
			this.inFlight -= 1;
			this.drain();
		}
	}

	/** Allocate a slot token, joining the FIFO queue. */
	private enqueue(): SlotToken & { acquire(): Promise<void> } {
		let resolve!: () => void;
		let reject!: (e: unknown) => void;
		const promise = new Promise<void>((res, rej) => {
			resolve = res;
			reject = rej;
		});
		const token: SlotToken = {
			acquired: false,
			cancelled: false,
			resolve,
			reject,
		};
		this.queue.push(token);
		return Object.assign(promise as never, {
			acquire: () => promise,
			cancel: () => {
				if (token.acquired) return;
				token.cancelled = true;
				token.reject(new DOMException("Cancelled", "AbortError"));
			},
		});
	}

	/** Release a slot by waking the next waiter. Idempotent. */
	private drain(): void {
		while (
			this.inFlight < this.config.maxConcurrent &&
			this.queue.length > 0
		) {
			const next = this.queue.shift()!;
			if (next.cancelled) continue;
			next.acquired = true;
			next.resolve();
			return; // Only one slot opens per drain call.
		}
	}
}
