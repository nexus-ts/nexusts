/**
 * `CircuitBreaker` — a single named circuit. Constructed on demand
 * via `ResilienceService.getOrCreate()` (so multiple parts of your
 * app share one circuit per external dependency), or directly:
 *
 *   import { CircuitBreaker } from "@kabyeon/nexusjs/resilience";
 *
 *   const stripe = new CircuitBreaker("stripe", {
 *     threshold: 0.5,
 *     timeout: 30_000,
 *   });
 *
 *   const result = await stripe.execute(() => stripeApi.charge(...));
 *
 * State machine:
 *
 *     closed  ──failures ≥ threshold──▶  open
 *        ▲                                │
 *        │                                │ after `timeout` ms
 *        │                                ▼
 *     closed ◀──success── half-open
 *                    │
 *                    └─ failure ──▶ open (reset)
 *
 *   - `closed`: all calls go through. Track success/failure in a
 *     rolling window.
 *   - `open`: calls fail-fast with `CircuitOpenError`. After
 *     `timeout` ms, transition to `half-open`.
 *   - `half-open`: at most `halfOpenAfter` calls are allowed. If any
 *     of them fails → back to `open`. If all succeed → back to
 *     `closed`.
 */
import type { CircuitBreakerConfig, CircuitState } from "./types.js";

const DEFAULTS = {
	threshold: 0.5,
	minCalls: 5,
	timeout: 30_000,
	halfOpenAfter: 1,
	window: 60_000,
};

const defaultIsFailure = (_err: unknown): boolean => true;

/** Thrown when the circuit is open. Callers should treat as "fail-fast". */
export class CircuitOpenError extends Error {
	readonly name = "CircuitOpenError";
	readonly circuit: string;
	readonly nextRetryAt: number;
	constructor(circuit: string, nextRetryAt: number) {
		super(`Circuit "${circuit}" is open; retry after ${nextRetryAt}ms`);
		this.circuit = circuit;
		this.nextRetryAt = nextRetryAt;
	}
}

interface Sample {
	ts: number;
	ok: boolean;
}

export class CircuitBreaker {
	readonly name: string;
	readonly config: Required<Omit<CircuitBreakerConfig, "onStateChange" | "onCall" | "isFailure">> & {
		isFailure: NonNullable<CircuitBreakerConfig["isFailure"]>;
	};
	private state: CircuitState = "closed";
	private samples: Sample[] = [];
	private openedAt = 0;
	private halfOpenInFlight = 0;
	private halfOpenAllowed = 0;

	constructor(name: string, config: CircuitBreakerConfig = {}) {
		this.name = name;
		this.config = {
			threshold: config.threshold ?? DEFAULTS.threshold,
			minCalls: config.minCalls ?? DEFAULTS.minCalls,
			timeout: config.timeout ?? DEFAULTS.timeout,
			halfOpenAfter: config.halfOpenAfter ?? DEFAULTS.halfOpenAfter,
			window: config.window ?? DEFAULTS.window,
			isFailure: config.isFailure ?? defaultIsFailure,
		};
	}

	get currentState(): CircuitState {
		// Lazy transition: if the open timer has elapsed, flip to half-open
		// before the next call, so the consumer sees the right state.
		if (
			this.state === "open" &&
			Date.now() - this.openedAt >= this.config.timeout
		) {
			this.transition("half-open");
			this.halfOpenAllowed = this.config.halfOpenAfter;
			this.halfOpenInFlight = 0;
		}
		return this.state;
	}

	/** Run `fn` through the circuit. Throws `CircuitOpenError` when open. */
	async execute<T>(fn: () => Promise<T> | T): Promise<T> {
		const state = this.currentState;

		if (state === "open") {
			throw new CircuitOpenError(this.name, this.openedAt + this.config.timeout);
		}

		// Concurrency control for half-open.
		if (state === "half-open") {
			if (this.halfOpenInFlight >= this.halfOpenAllowed) {
				throw new CircuitOpenError(this.name, this.openedAt + this.config.timeout);
			}
			this.halfOpenInFlight += 1;
		}

		const start = Date.now();
		let ok = false;
		try {
			const result = await fn();
			ok = true;
			return result;
		} finally {
			const latency = Date.now() - start;
			this.record(ok, latency, state);
		}
	}

	private record(ok: boolean, latency: number, stateAtCall: CircuitState): void {
		this.config; // touch — keep the type narrow
		// Track in the rolling window.
		const now = Date.now();
		this.samples.push({ ts: now, ok });
		const cutoff = now - this.config.window;
		while (this.samples.length > 0 && this.samples[0].ts < cutoff) {
			this.samples.shift();
		}

		const failed = ok ? 0 : 1;
		void failed;

		// State transitions.
		if (stateAtCall === "half-open") {
			this.halfOpenInFlight = Math.max(0, this.halfOpenInFlight - 1);
			if (!ok) {
				this.openedAt = now;
				this.transition("open");
			} else if (this.halfOpenInFlight === 0) {
				this.transition("closed");
				this.samples = [];
			}
			return;
		}

		// closed → possibly open
		if (!ok) {
			const total = this.samples.length;
			if (total >= this.config.minCalls) {
				const failures = this.samples.filter((s) => !s.ok).length;
				const ratio = failures / total;
				if (ratio >= this.config.threshold) {
					this.openedAt = now;
					this.transition("open");
				}
			}
		} else {
			// Reset the window on full-success periods so a long-stable
			// upstream doesn't carry stale failures forever.
			if (this.samples.length > this.config.minCalls * 4) {
				this.samples = this.samples.slice(-this.config.minCalls);
			}
		}

		// Hooks — best-effort, swallow errors.
		try {
			this.config; // (placeholder for future hooks read)
		} catch {
			/* ignore */
		}
	}

	private transition(to: CircuitState): void {
		const from = this.state;
		if (from === to) return;
		this.state = to;
		// Hooks are passed in `config`; we only know about them via
		// the outer constructor so we keep them on a parallel field.
		// (The hook API is set in the ResilienceService which owns
		// the onStateChange list.)
		this.fireHook(from, to);
	}

	/** Set by ResilienceService — fires on each transition. */
	_onStateChange?: (from: CircuitState, to: CircuitState, name: string) => void;
	_onCall?: (name: string, success: boolean, latencyMs: number) => void;
	private fireHook(from: CircuitState, to: CircuitState): void {
		try {
			this._onStateChange?.(from, to, this.name);
		} catch {
			/* ignore */
		}
	}
}
