/**
 * `retry()` — pure function. The same code that powers `@Retry()`
 * — useful when you can't (or don't want to) decorate a method.
 *
 *   import { retry } from "@nexusts/resilience";
 *
 *   const user = await retry(
 *     () => fetch("https://api.example.com/users/42").then(r => r.json()),
 *     { attempts: 3, backoff: "exponential-jitter" },
 *   );
 *
 * Error handling:
 *   - If the function throws and `retryOn(err)` returns true, the
 *     call is retried up to `attempts` times.
 *   - The final error is re-thrown to the caller.
 *   - AbortError / CancellationError short-circuit immediately.
 */
import type { RetryConfig, RetryOnPredicate } from "./types.js";

const DEFAULTS = {
	attempts: 3,
	initialDelay: 100,
	maxDelay: 30_000,
	backoff: "exponential-jitter" as const,
	multiplier: 2,
};

const defaultRetryOn: RetryOnPredicate = (err: unknown) => {
	if (err == null) return false;
	// Honour explicit aborts.
	const name = (err as { name?: string })?.name ?? "";
	if (name === "AbortError" || name === "CancellationError") return false;
	return true;
};

/** Sleep helper that respects AbortSignal. */
function sleep(ms: number, signal?: AbortSignal): Promise<void> {
	return new Promise((resolve, reject) => {
		if (signal?.aborted) {
			reject(signal.reason ?? new DOMException("Aborted", "AbortError"));
			return;
		}
		const id = setTimeout(() => {
			signal?.removeEventListener("abort", onAbort);
			resolve();
		}, ms);
		const onAbort = () => {
			clearTimeout(id);
			reject(signal?.reason ?? new DOMException("Aborted", "AbortError"));
		};
		signal?.addEventListener("abort", onAbort, { once: true });
	});
}

/**
 * Compute the next backoff delay. Returns ms.
 *
 *   constant:         initialDelay
 *   linear:           initialDelay * attempt * multiplier
 *   exponential:      initialDelay * multiplier^(attempt-1)
 *   exponential-jitter: above * (0.5..1.5) random factor
 */
export function computeBackoff(
	attempt: number,
	cfg: Required<Pick<RetryConfig, "initialDelay" | "maxDelay" | "backoff" | "multiplier">>,
): number {
	const { initialDelay, maxDelay, backoff, multiplier } = cfg;
	let raw: number;
	switch (backoff) {
		case "constant":
			raw = initialDelay;
			break;
		case "linear":
			raw = initialDelay * attempt;
			break;
		case "exponential":
			raw = initialDelay * multiplier ** (attempt - 1);
			break;
		case "exponential-jitter": {
			const base = initialDelay * multiplier ** (attempt - 1);
			// ±50% jitter — full jitter (AWS-style).
			raw = Math.random() * base;
			break;
		}
		default:
			raw = initialDelay;
	}
	return Math.min(raw, maxDelay);
}

/**
 * Retry `fn` according to `cfg`. Returns the eventual value or
 * re-throws the last error.
 */
export async function retry<T>(
	fn: (signal: AbortSignal) => Promise<T> | T,
	cfg: RetryConfig = {},
): Promise<T> {
	const attempts = Math.max(1, cfg.attempts ?? DEFAULTS.attempts);
	const initialDelay = cfg.initialDelay ?? DEFAULTS.initialDelay;
	const maxDelay = cfg.maxDelay ?? DEFAULTS.maxDelay;
	const backoff = cfg.backoff ?? DEFAULTS.backoff;
	const multiplier = cfg.multiplier ?? DEFAULTS.multiplier;
	const retryOn = cfg.retryOn ?? defaultRetryOn;
	const onRetry = cfg.onRetry;
	const overallTimeout = cfg.timeout;

	const ac = new AbortController();
	const overallTimer = overallTimeout
		? setTimeout(() => ac.abort(new Error("retry: overall timeout exceeded")), overallTimeout)
		: undefined;

	const normalized = { initialDelay, maxDelay, backoff, multiplier };
	let lastErr: unknown;
	for (let attempt = 1; attempt <= attempts; attempt++) {
		if (ac.signal.aborted) break;
		try {
			return await fn(ac.signal);
		} catch (err) {
			lastErr = err;
			if (attempt >= attempts) break;
			if (!retryOn(err, attempt)) break;
			const delay = computeBackoff(attempt, normalized);
			if (onRetry) {
				try {
					onRetry(err, attempt, delay);
				} catch {
					/* hook errors must not break the retry */
				}
			}
			try {
				await sleep(delay, ac.signal);
			} catch (sleepErr) {
				lastErr = sleepErr;
				break;
			}
		}
	}

	if (overallTimer) clearTimeout(overallTimer);
	throw lastErr;
}
