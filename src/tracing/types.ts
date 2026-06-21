/**
 * Public types for `nexus/tracing`.
 *
 * `nexus/tracing` is a thin, ergonomic wrapper around the
 * OpenTelemetry API (and, when configured, the SDK). It is
 * intentionally minimal — no global side effects on import.
 *
 * If you don't import `TracingModule.forRoot()`, this module
 * is a complete no-op: no OpenTelemetry packages are loaded
 * and `TracingService` falls back to in-memory no-op spans.
 */

import type { SpanContext as OtelSpanContext } from "@opentelemetry/api";

/* ------------------------------------------------------------------ *
 * Configuration
 * ------------------------------------------------------------------ */

export type TracingExporter = "otlp-http" | "otlp-grpc" | "console" | "memory";

export interface TracingConfig {
	/** Service name reported in spans. Defaults to `process.env.OTEL_SERVICE_NAME ?? "nexus"`. */
	serviceName?: string;
	/** Service version (sent as `service.version` resource attribute). */
	serviceVersion?: string;
	/** Deployment environment (e.g. "production", "staging"). */
	environment?: string;
	/** Exporter to use. Default: `"otlp-http"`. */
	exporter?: TracingExporter;
	/** OTLP endpoint. Default: `process.env.OTEL_EXPORTER_OTLP_ENDPOINT ?? "http://localhost:4318"`. */
	endpoint?: string;
	/** Sampling ratio in [0, 1]. 0.0 = drop everything, 1.0 = keep everything. Default: `1.0`. */
	sampleRatio?: number;
	/** Whether to install the Hono HTTP server middleware. Default: `true`. */
	enableHttpInstrumentation?: boolean;
	/** Whether to capture DB spans via `nexus/drizzle` (if installed). Default: `true`. */
	enableDbInstrumentation?: boolean;
	/** Extra static resource attributes (service.namespace, deployment.id, ...). */
	resourceAttributes?: Record<string, string>;
	/** When true, exit process on uncaught span error. Default: `false`. */
	throwOnError?: boolean;
}

/* ------------------------------------------------------------------ *
 * Public types
 * ------------------------------------------------------------------ */

/** Public-facing span context (mirrors OTel's, but vendor-neutral). */
export interface SpanContext extends OtelSpanContext {}

/** Status of a span — mirrors OTel's `SpanStatusCode`. */
export type SpanStatus = "unset" | "ok" | "error";

/** A finished span, returned from `withSpan()` / `endSpan()`. */
export interface FinishedSpan {
	readonly name: string;
	readonly traceId: string;
	readonly spanId: string;
	readonly parentSpanId?: string;
	readonly startTime: number;
	readonly endTime: number;
	readonly durationMs: number;
	readonly status: SpanStatus;
	readonly attributes: Record<string, string | number | boolean>;
	readonly events: Array<{ name: string; time: number; attributes?: Record<string, unknown> }>;
}

/** Per-span options. */
export interface SpanOptions {
	/** Span kind. Default: `"internal"`. */
	kind?: "server" | "client" | "producer" | "consumer" | "internal";
	/** Initial attributes. */
	attributes?: Record<string, string | number | boolean>;
	/** Span start time override (epoch ms). */
	startTime?: number;
}

/** Active span handle returned from `startSpan()`. */
export interface ActiveSpan {
	/** Span name. */
	readonly name: string;
	/** Current trace id (32 hex chars). */
	readonly traceId: string;
	/** Current span id (16 hex chars). */
	readonly spanId: string;
	/** True if the underlying OTel span is a no-op (no SDK configured). */
	readonly isRecording: boolean;
	/** Set an attribute. */
	setAttribute(key: string, value: string | number | boolean): void;
	/** Set multiple attributes at once. */
	setAttributes(attributes: Record<string, string | number | boolean>): void;
	/** Record an event with optional attributes. */
	addEvent(name: string, attributes?: Record<string, unknown>): void;
	/** Record an exception. */
	recordException(err: unknown): void;
	/** Set the span status to "ok" with an optional description. */
	setStatus(status: "ok" | "error" | "unset", description?: string): void;
	/** End the span. After calling, no other methods are valid. */
	end(): void;
}
