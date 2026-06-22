/**
 * `nexusjs/resilience` — public types and config.
 *
 * The resilience module groups three classic distributed-systems
 * primitives — retry with backoff, circuit breaker, and bulkhead
 * (concurrency limiter) — under a single, decorator-friendly API.
 * Each primitive can be used as a class, a method decorator, or a
 * standalone function.
 */

// ============================================================================
// Retry
// ============================================================================

/** Backoff strategy between retry attempts. */
export type BackoffStrategy =
	| "constant"
	| "linear"
	| "exponential"
	| "exponential-jitter";

/**
 * Predicate: should we retry this error? Default: retry on any
 * non-abort error. Set to a function to filter (e.g. only retry
 * on network errors, not on 4xx HTTP responses).
 */
export type RetryOnPredicate = (err: unknown, attempt: number) => boolean;

/** Configuration for `@Retry()` and `retry()`. */
export interface RetryConfig {
	/** Maximum number of attempts (including the first call). Default: 3. */
	attempts?: number;
	/** Initial backoff in ms. Default: 100. */
	initialDelay?: number;
	/** Max backoff in ms (caps the exponential growth). Default: 30_000. */
	maxDelay?: number;
	/** Backoff strategy. Default: "exponential-jitter". */
	backoff?: BackoffStrategy;
	/** Multiplier for "linear" and "exponential*". Default: 2. */
	multiplier?: number;
	/** Optional: only retry if this predicate returns true. */
	retryOn?: RetryOnPredicate;
	/**
	 * Optional: hook called before each retry. Useful for logging
	 * and metrics.
	 */
	onRetry?: (err: unknown, attempt: number, delayMs: number) => void;
	/**
	 * Optional: hard timeout for the entire retried operation, in ms.
	 * If the operation takes longer, it is aborted.
	 */
	timeout?: number;
}

// ============================================================================
// Circuit Breaker
// ============================================================================

/** A circuit breaker's lifecycle state. */
export type CircuitState = "closed" | "open" | "half-open";

/** Configuration for `@CircuitBreaker()` and `CircuitBreaker`. */
export interface CircuitBreakerConfig {
	/**
	 * Failure ratio (0..1) that opens the circuit. Default: 0.5.
	 * Open when `failures / (failures + successes) >= threshold` over
	 * the rolling window.
	 */
	threshold?: number;
	/** Minimum number of calls before the threshold matters. Default: 5. */
	minCalls?: number;
	/** How long the circuit stays open before going half-open. Default: 30s. */
	timeout?: number;
	/** Calls allowed in half-open. Default: 1. */
	halfOpenAfter?: number;
	/** Predicate: should this error count as a failure? */
	isFailure?: (err: unknown) => boolean;
	/** Hook on state change. */
	onStateChange?: (from: CircuitState, to: CircuitState, name: string) => void;
	/** Hook on every call (good for metrics). */
	onCall?: (name: string, success: boolean, latencyMs: number) => void;
	/**
	 * Rolling window length for failure ratio, in ms. Default: 60_000.
	 */
	window?: number;
}

// ============================================================================
// Bulkhead
// ============================================================================

/** Configuration for `Bulkhead`. */
export interface BulkheadConfig {
	/** Max concurrent executions. Default: 10. */
	maxConcurrent?: number;
	/** Max queued callers waiting for a slot. Default: 100. */
	maxQueued?: number;
	/** Reject immediately if queue is full (vs. wait for a slot). */
	rejectOnFull?: boolean;
	/** Optional name for logging / metrics. */
	name?: string;
}

/** Result of a bulkhead call. */
export type BulkheadOutcome<T> = {
	ok: boolean;
	value?: T;
	error?: unknown;
	queueMs?: number;
	executionMs?: number;
};

// ============================================================================
// Combined decorator: `@Resilient`
// ============================================================================

/**
 * All three primitives in one decorator. Each section is optional;
 * pass only what you need.
 *
 *   @Resilient({
 *     retry: { attempts: 3, backoff: "exponential" },
 *     circuit: { threshold: 0.5, timeout: 30_000 },
 *     bulkhead: { maxConcurrent: 5 },
 *   })
 *   async callExternal() { ... }
 */
export interface ResilientConfig {
	retry?: RetryConfig;
	circuit?: CircuitBreakerConfig;
	bulkhead?: BulkheadConfig;
}

// ============================================================================
// Module
// ============================================================================

/** Top-level config for `ResilienceModule.forRoot()`. */
export interface ResilienceConfig {
	/**
	 * Default retry config — used when `@Retry()` is applied without
	 * explicit options.
	 */
	retry?: RetryConfig;
	/**
	 * Default circuit breaker config — used when `@CircuitBreaker()`
	 * is applied without explicit options, and as the template for
	 * circuit breakers created via `getOrCreate()`.
	 */
	circuit?: CircuitBreakerConfig;
	/**
	 * Default bulkhead config — same as above.
	 */
	bulkhead?: BulkheadConfig;
}

// ============================================================================
// Helpers
// ============================================================================

/** Internal — used by decorators to attach metadata. */
export const RESILIENCE_META = Symbol.for("nexus:Resilience:Meta");
