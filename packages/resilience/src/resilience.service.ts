/**
 * `ResilienceService` — owns the named circuit-breaker and bulkhead
 * registry. Exposed via DI so multiple parts of an app can share
 * the same circuit for an external dependency.
 *
 *   constructor(@Inject(ResilienceService.TOKEN) private r: ResilienceService) {}
 *
 *   const cb = this.r.getOrCreateCircuit("stripe", { threshold: 0.5 });
 *   const result = await cb.execute(() => stripeApi.charge(...));
 *
 * The service also holds the *default* config (RetryConfig,
 * CircuitBreakerConfig, BulkheadConfig) used by the decorators
 * when no per-call options are given.
 */
import { Inject, Injectable } from "@nexusts/core";
import { CircuitBreaker } from "./circuit-breaker.js";
import { Bulkhead } from "./bulkhead.js";
import { retry } from "./retry.js";
import { safeGetMeta, safeDefineMeta, safeHasMeta } from "@nexusts/core/di/safe-reflect";
import type {
	BackoffStrategy,
	BulkheadConfig,
	CircuitBreakerConfig,
	ResilienceConfig,
	ResilienceStore,
	RetryConfig,
} from "./types.js";

@Injectable()
export class ResilienceService {
	/** DI token — `@Inject(ResilienceService.TOKEN)`. */
	static readonly TOKEN = Symbol.for("nexus:ResilienceService");

	readonly defaults: {
		retry: Required<RetryConfig>;
		circuit: Required<CircuitBreakerConfig>;
		bulkhead: Required<BulkheadConfig>;
	};

	private circuits = new Map<string, CircuitBreaker>();
	private bulkheads = new Map<string, Bulkhead>();
	private store?: ResilienceStore;
	private syncIntervalMs: number;

	constructor(
		@Inject("RESILIENCE_CONFIG") config: ResilienceConfig = {},
		store?: ResilienceStore,
	) {
		this.syncIntervalMs = config.syncIntervalMs ?? 5000;
		this.store = store ?? undefined;
		this.defaults = {
			retry: {
				attempts: 3,
				initialDelay: 100,
				maxDelay: 30_000,
				backoff: "exponential-jitter",
				multiplier: 2,
				...config.retry,
			} as Required<RetryConfig>,
			circuit: {
				threshold: 0.5,
				minCalls: 5,
				timeout: 30_000,
				halfOpenAfter: 1,
				window: 60_000,
				...config.circuit,
			} as Required<CircuitBreakerConfig>,
			bulkhead: {
				maxConcurrent: 10,
				maxQueued: 100,
				rejectOnFull: false,
				...config.bulkhead,
			} as Required<BulkheadConfig>,
		};
	}

	/** Set (or replace) the cross-pod store after construction. */
	setStore(store: ResilienceStore): void {
		this.store = store;
		for (const cb of this.circuits.values()) {
			cb._store = store;
			cb._syncIntervalMs = this.syncIntervalMs;
		}
	}

	/** Get or create a named circuit breaker. Shared across the app. */
	getOrCreateCircuit(name: string, config: CircuitBreakerConfig = {}): CircuitBreaker {
		let cb = this.circuits.get(name);
		if (!cb) {
			cb = new CircuitBreaker(name, { ...this.defaults.circuit, ...config });
			if (this.store) {
				cb._store = this.store;
				cb._syncIntervalMs = this.syncIntervalMs;
			}
			this.circuits.set(name, cb);
		}
		return cb;
	}

	/** Get or create a named bulkhead. */
	getOrCreateBulkhead(name: string, config: BulkheadConfig = {}): Bulkhead {
		let bh = this.bulkheads.get(name);
		if (!bh) {
			// Merge: explicit config overrides defaults, except for
			// `name` (always use the caller's name). Strip `name` from
			// the defaults before spreading to avoid a duplicate.
			const { name: _ignored, ...defaultRest } = this.defaults.bulkhead as BulkheadConfig;
			void _ignored;
			bh = new Bulkhead({ ...defaultRest, ...config, name });
			this.bulkheads.set(name, bh);
		}
		return bh;
	}

	/** Look up an existing circuit (no creation). */
	getCircuit(name: string): CircuitBreaker | undefined {
		return this.circuits.get(name);
	}

	/** Look up an existing bulkhead. */
	getBulkhead(name: string): Bulkhead | undefined {
		return this.bulkheads.get(name);
	}

	/**
	 * List all registered circuit breakers and their current metrics.
	 * Useful for admin dashboards and monitoring.
	 */
	listCircuits(): Array<{
		name: string;
		state: import("./types.js").CircuitState;
		metrics: import("./types.js").CircuitMetrics;
	}> {
		const results: Array<{
			name: string;
			state: import("./types.js").CircuitState;
			metrics: import("./types.js").CircuitMetrics;
		}> = [];
		for (const [name, cb] of this.circuits) {
			results.push({ name, state: cb.currentState, metrics: cb.metrics() });
		}
		return results;
	}

	/**
	 * List all registered bulkheads and their current stats.
	 */
	listBulkheads(): Array<{
		name: string;
		inFlight: number;
		queued: number;
		maxConcurrent: number;
	}> {
		const results: Array<{
			name: string;
			inFlight: number;
			queued: number;
			maxConcurrent: number;
		}> = [];
		for (const [name, bh] of this.bulkheads) {
			results.push({
				name,
				...bh.stats,
				maxConcurrent: bh.config.maxConcurrent,
			});
		}
		return results;
	}

	/** Retry with default config. */
	retry<T>(fn: (signal: AbortSignal) => Promise<T> | T, cfg?: RetryConfig): Promise<T> {
		return retry(fn, { ...this.defaults.retry, ...cfg });
	}

	/** Compute the backoff for a given attempt. Exposed for tests. */
	computeBackoff(attempt: number, overrides?: Partial<RetryConfig>): number {
		const cfg = { ...this.defaults.retry, ...overrides };
		// Local copy of the same algorithm — kept here to avoid
		// importing from retry.ts just for the math.
		const { initialDelay, maxDelay, multiplier } = cfg;
		const backoff: BackoffStrategy = cfg.backoff;
		let raw: number;
		switch (backoff) {
			case "constant":
				raw = initialDelay;
				break;
			case "linear":
				raw = initialDelay * attempt;
				break;
			case "exponential":
				raw = initialDelay * Math.pow(multiplier, attempt - 1);
				break;
			case "exponential-jitter":
				raw = Math.random() * initialDelay * Math.pow(multiplier, attempt - 1);
				break;
		}
		return Math.min(raw, maxDelay);
	}
}
