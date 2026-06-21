/**
 * `nexus/metrics` — Prometheus-compatible metrics collection.
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

export { CounterImpl } from "./counter.js";
export { GaugeImpl } from "./gauge.js";
export { HistogramImpl, DEFAULT_BUCKETS } from "./histogram.js";
export { SummaryImpl, DEFAULT_PERCENTILES } from "./summary.js";
export { MetricsRegistry } from "./registry.js";
export {
	MetricsService,
	METRICS_SERVICE_TOKEN,
	setMetricsService,
	getMetricsService,
} from "./service.js";
export { MetricsModule } from "./module.js";
export { MetricsController } from "./controller.js";
export { Counted, Timed, type CountedOptions, type TimedOptions } from "./decorators/index.js";
export type {
	Counter,
	CounterOptions,
	Gauge,
	GaugeOptions,
	Histogram,
	HistogramOptions,
	Summary,
	SummaryOptions,
	MetricSample,
	MetricsConfig,
	ExpositionFormat,
	ExpositionResult,
} from "./types.js";
