/**
 * `nexusjs/metrics` — Prometheus-compatible metrics collection.
 *
 * Public API:
 * - `MetricsService`        — main DI-friendly service
 * - `MetricsModule.forRoot()` — wires up default metrics, mounts /metrics
 * - `MetricsController.handler(service)` — Hono handler for /metrics
 * - `MetricsService#counter/gauge/histogram/summary()` — register metrics
 * - `@Counted()`, `@Timed()` decorators — auto-record on method calls
 * - `MetricsService#expose()` — serialize to Prometheus / OpenMetrics
 *
 * Zero external dependencies. ~5kb gzipped.
 *
 *   @Module({
 *     imports: [
 *       MetricsModule.forRoot({
 *         enableDefaultMetrics: true,
 *         path: "/metrics",
 *         globalLabels: { service: "my-app" },
 *       }),
 *     ],
 *   })
 *   class AppModule {}
 */

export { MetricsController } from "./controller.js";
export { CounterImpl } from "./counter.js";
export { Counted, type CountedOptions, Timed, type TimedOptions } from "./decorators/index.js";
export { GaugeImpl } from "./gauge.js";
export { DEFAULT_BUCKETS, HistogramImpl } from "./histogram.js";
export { MetricsModule } from "./module.js";
export { MetricsRegistry } from "./registry.js";
export {
	getMetricsService,
	METRICS_SERVICE_TOKEN,
	MetricsService,
	setMetricsService,
} from "./service.js";
export { DEFAULT_PERCENTILES, SummaryImpl } from "./summary.js";
export type {
	Counter,
	CounterOptions,
	ExpositionFormat,
	ExpositionResult,
	Gauge,
	GaugeOptions,
	Histogram,
	HistogramOptions,
	MetricSample,
	MetricsConfig,
	Summary,
	SummaryOptions,
} from "./types.js";
