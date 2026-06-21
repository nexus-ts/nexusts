/**
 * `MetricsService` — DI-friendly facade over `MetricsRegistry`.
 *
 * The service is always available; you can call `counter()`,
 * `gauge()`, `histogram()`, `summary()` at any time. Registered
 * metrics live for the lifetime of the application.
 *
 * Default Node.js process metrics are registered when
 * `MetricsModule.forRoot({ enableDefaultMetrics: true })` is
 * called. Without `forRoot()`, the service is fully functional
 * but no default metrics are registered.
 */

import { MetricsRegistry } from "./registry.js";
import type {
	Counter,
	CounterOptions,
	ExpositionFormat,
	ExpositionResult,
	Gauge,
	GaugeOptions,
	Histogram,
	HistogramOptions,
	Summary,
	SummaryOptions,
} from "./types.js";

export const METRICS_SERVICE_TOKEN = Symbol.for("nexus:MetricsService");

/**
 * Global registry of the active `MetricsService` instance.
 * Set by `MetricsModule.forRoot()`. Read by `@Counted()` and
 * `@Timed()` decorators.
 */
let _current: MetricsService | undefined;

export function setMetricsService(service: MetricsService): void {
	_current = service;
}

export function getMetricsService(): MetricsService | undefined {
	return _current;
}

export class MetricsService {
	readonly registry: MetricsRegistry = new MetricsRegistry();

	/* ---------------- factory methods ---------------- */

	counter(opts: CounterOptions): Counter {
		return this.registry.registerCounter(opts);
	}

	gauge(opts: GaugeOptions): Gauge {
		return this.registry.registerGauge(opts);
	}

	histogram(opts: HistogramOptions): Histogram {
		return this.registry.registerHistogram(opts);
	}

	summary(opts: SummaryOptions): Summary {
		return this.registry.registerSummary(opts);
	}

	/* ---------------- lookup ---------------- */

	getCounter(name: string): Counter {
		return this.registry.getCounter(name);
	}

	/**
	 * Get an existing counter or create a new one with the given
	 * label names. Used by the `@Counted()` decorator.
	 */
	getOrCreateCounter(name: string, help: string | undefined, labelNames: string[] | undefined): Counter {
		try {
			return this.registry.getCounter(name);
		} catch {
			return this.registry.registerCounter({ name, help, labelNames });
		}
	}

	/**
	 * Get an existing histogram or create a new one. Used by the
	 * `@Timed()` decorator.
	 */
	getOrCreateHistogram(name: string, help: string | undefined, labelNames: string[] | undefined, buckets: number[] | undefined): Histogram {
		try {
			return this.registry.getHistogram(name);
		} catch {
			return this.registry.registerHistogram({ name, help, labelNames, buckets });
		}
	}

	getGauge(name: string): Gauge {
		return this.registry.getGauge(name);
	}

	getHistogram(name: string): Histogram {
		return this.registry.getHistogram(name);
	}

	getSummary(name: string): Summary {
		return this.registry.getSummary(name);
	}

	/* ---------------- exposition ---------------- */

	expose(format: ExpositionFormat = "prometheus"): ExpositionResult {
		return this.registry.expose(format);
	}

	/** Number of registered metrics. */
	get size(): number {
		return this.registry.size;
	}
}
