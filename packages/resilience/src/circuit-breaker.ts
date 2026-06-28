/**
 * `CircuitBreaker` — a single named circuit. Constructed on demand
 * via `ResilienceService.getOrCreate()` (so multiple parts of your
 * app share one circuit per external dependency), or directly:
 *
 *   import { CircuitBreaker } from "@nexusts/resilience";
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
import type { CircuitBreakerConfig, CircuitMetrics, CircuitState, ResilienceStore } from "./types.js";

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

	/** Set by ResilienceService when a cross-pod store is configured. */
	_store?: ResilienceStore;
	/** How often (ms) to pull state from the store. Default: 5000. */
	_syncIntervalMs = 5000;
	private _lastSync = 0;
	private _lastRemoteUpdate = 0;

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
		if (this._store) await this._maybeSyncFromStore();
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

	// ===================================================================
	// Admin API — manual overrides & inspection
	// ===================================================================

	/**
	 * Return a snapshot of the circuit's current state and metrics.
	 * Useful for admin dashboards and monitoring.
	 */
	metrics(): CircuitMetrics {
		const now = Date.now();
		const cutoff = now - this.config.window;
		const windowSamples = this.samples.filter((s) => s.ts >= cutoff);
		const total = windowSamples.length;
		const failures = windowSamples.filter((s) => !s.ok).length;
		const successes = total - failures;
		const ratio = total > 0 ? failures / total : 0;
		const openedAt = this.openedAt;
		const msUntilHalfOpen =
			this.state === "open"
				? Math.max(0, openedAt + this.config.timeout - Date.now())
				: 0;

		return {
			name: this.name,
			state: this.currentState,
			totalCalls: total,
			failures,
			successes,
			failureRatio: ratio,
			openedAt,
			msUntilHalfOpen,
		};
	}

	/** Manually open the circuit (overrides normal state machine). */
	forceOpen(): void {
		this.openedAt = Date.now();
		this.halfOpenInFlight = 0;
		this.transition("open");
	}

	/** Manually close the circuit (overrides normal state machine). */
	forceClose(): void {
		this.openedAt = 0;
		this.halfOpenInFlight = 0;
		this.samples = [];
		this.transition("closed");
	}

	/** Reset the circuit to its initial closed state (clears all history). */
	reset(): void {
		this.state = "closed";
		this.openedAt = 0;
		this.halfOpenInFlight = 0;
		this.halfOpenAllowed = 0;
		this.samples = [];
	}

	// ===================================================================
	// Internal
	// ===================================================================

	private record(ok: boolean, latency: number, stateAtCall: CircuitState): void {
		// Fire per-call hook.
		try {
			this._onCall?.(this.name, ok, latency);
		} catch {
			/* ignore */
		}

		// Track in the rolling window.
		const now = Date.now();
		this.samples.push({ ts: now, ok });
		const cutoff = now - this.config.window;
		while (this.samples.length > 0 && this.samples[0].ts < cutoff) {
			this.samples.shift();
		}

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
		if (this._store) this._saveToStore();
	}

	// ===================================================================
	// Cross-pod store sync (best-effort, non-throwing)
	// ===================================================================

	private async _maybeSyncFromStore(): Promise<void> {
		const now = Date.now();
		if (now - this._lastSync < this._syncIntervalMs) return;
		this._lastSync = now;
		try {
			const snap = await this._store?.getSnapshot(this.name);
			if (!snap) return;
			// Apply only if the remote snapshot is newer than the last one we applied.
			if (snap.updatedAt <= this._lastRemoteUpdate) return;
			this._lastRemoteUpdate = snap.updatedAt;
			this.state = snap.state;
			this.openedAt = snap.openedAt;
			if (snap.state === "half-open") {
				this.halfOpenAllowed = this.config.halfOpenAfter;
				this.halfOpenInFlight = 0;
			}
		} catch {
			// Degraded to local-only mode — do not throw.
		}
	}

	private _saveToStore(): void {
		const now = Date.now();
		const cutoff = now - this.config.window;
		const win = this.samples.filter((s) => s.ts >= cutoff);
		const failures = win.filter((s) => !s.ok).length;
		const successes = win.length - failures;
		this._store?.saveSnapshot(this.name, {
				state: this.state,
				openedAt: this.openedAt,
				failures,
				successes,
				updatedAt: now,
			})
			.catch(() => {}); // fire-and-forget; errors are non-fatal
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
