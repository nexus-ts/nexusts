/**
 * `nexus/tracing` — OpenTelemetry-based distributed tracing.
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

export {
	TracingService,
	TRACING_SERVICE_TOKEN,
	InMemorySpanRecorder,
	setTracingService,
	getTracingService,
} from "./service.js";
export { TracingModule, TRACING_CONFIG_TOKEN } from "./module.js";
export {
	tracingMiddleware,
	injectOutgoingTraceparent,
} from "./hono-instrumentation.js";
export {
	parseTraceParent,
	formatTraceParent,
	extractB3Context,
	inject as injectContextHeaders,
	extract as extractContextHeaders,
	TRACE_PARENT_HEADER,
	TRACE_STATE_HEADER,
	B3_TRACE_ID_HEADER,
	B3_SPAN_ID_HEADER,
	B3_SAMPLED_HEADER,
	type ParsedTraceParent,
} from "./propagation.js";
export { Trace, getTraceOptions, type TraceOptions } from "./decorators/index.js";
export type {
	ActiveSpan,
	FinishedSpan,
	SpanContext,
	SpanOptions,
	SpanStatus,
	TracingConfig,
	TracingExporter,
} from "./types.js";
