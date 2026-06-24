/**
 * `nexusjs/tracing` — OpenTelemetry-based distributed tracing.
 *
 * Public API:
 * - `TracingService`        — the main service (lives in DI)
 * - `TracingModule.forRoot()` — wires up the OTel SDK
 * - `tracingMiddleware()`   — Hono auto-instrumentation
 * - `@Trace()` decorator    — wrap a method in a span
 * - `withSpan(name, fn)`    — manual span helper
 * - W3C + B3 propagation helpers
 * - `InMemorySpanRecorder`  — for tests / `console` exporter
 *
 * The OpenTelemetry **API** package is the only required
 * dependency (~7kb). The **SDK** packages are optional peer
 * dependencies — install them when you call `forRoot()`.
 *
 *   bun add @opentelemetry/api                          # always
 *   bun add @opentelemetry/sdk-node                     # for OTLP export
 *   bun add @opentelemetry/exporter-trace-otlp-http
 *   bun add @opentelemetry/resources
 *   bun add @opentelemetry/semantic-conventions
 */

export { getTraceOptions, Trace, type TraceOptions } from "./decorators/index.js";
export {
	injectOutgoingTraceparent,
	tracingMiddleware,
} from "./hono-instrumentation.js";
export { TRACING_CONFIG_TOKEN, TracingModule } from "./module.js";
export {
	B3_SAMPLED_HEADER,
	B3_SPAN_ID_HEADER,
	B3_TRACE_ID_HEADER,
	extract as extractContextHeaders,
	extractB3Context,
	formatTraceParent,
	inject as injectContextHeaders,
	type ParsedTraceParent,
	parseTraceParent,
	TRACE_PARENT_HEADER,
	TRACE_STATE_HEADER,
} from "./propagation.js";
export {
	getTracingService,
	InMemorySpanRecorder,
	setTracingService,
	TRACING_SERVICE_TOKEN,
	TracingService,
} from "./service.js";
export type {
	ActiveSpan,
	FinishedSpan,
	SpanContext,
	SpanOptions,
	SpanStatus,
	TracingConfig,
	TracingExporter,
} from "./types.js";
