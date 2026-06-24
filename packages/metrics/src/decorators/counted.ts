/**
 * `@Counted()` — class-method decorator that increments a counter
 * on each call.
 *
 * Usage:
 *   class UserController {
 *     @Counted('http_requests_total', { labels: () => ({ method: 'GET' }) })
 *     list() { ... }
 *   }
 *
 * The decorator reads the `MetricsService` from the global registry
 * (set by `MetricsModule.forRoot()`). When no service is registered
 * the decorator is a pass-through.
 */

import { getMetricsService } from "../service.js";

export interface CountedOptions {
	/** Optional label values, computed at call time. */
	labels?: () => Record<string, string>;
}

/**
 * Method decorator: increment a counter on each invocation.
 *
 * The counter is registered lazily the first time the method is
 * called, using the service from the global registry.
 */
export function Counted(metricName: string, options: CountedOptions = {}) {
	return (_target: object, _propertyKey: string | symbol, descriptor: PropertyDescriptor) => {
		const original = descriptor.value as (...args: unknown[]) => unknown;
		if (typeof original !== "function") {
			throw new Error(`@Counted() can only be applied to methods, got ${typeof original}`);
		}

		const isAsync = (original as any).constructor?.name === "AsyncFunction";

		if (isAsync) {
			descriptor.value = async function wrapped(this: unknown, ...args: unknown[]) {
				const svc = getMetricsService();
				if (svc) {
					const labels = options.labels?.();
					svc.getOrCreateCounter(
						metricName,
						undefined,
						labels ? Object.keys(labels) : undefined,
					).inc(labels);
				}
				return original.apply(this, args);
			};
		} else {
			descriptor.value = function wrapped(this: unknown, ...args: unknown[]) {
				const svc = getMetricsService();
				if (svc) {
					const labels = options.labels?.();
					svc.getOrCreateCounter(
						metricName,
						undefined,
						labels ? Object.keys(labels) : undefined,
					).inc(labels);
				}
				return original.apply(this, args);
			};
		}
		return descriptor;
	};
}