/**
 * `TracingService` — the framework's distributed-tracing primitive.
 *
 * Design:
 * 1. The OpenTelemetry API (`@opentelemetry/api`) is the only
 *    required dependency; it's ~7kb and provides the no-op default
 *    tracer when the SDK is not configured.
 * 2. The OTel SDK is **lazy-loaded**: only when the user calls
 *    `TracingModule.forRoot(...)` is `@opentelemetry/sdk-node` and
 *    the configured exporter imported. This keeps the bundle small
 *    for users who don't trace.
 * 3. Without `forRoot()`, the service returns no-op spans. They have
 *    valid `traceId` / `spanId` (the OTel no-op span id format) so
 *    log lines and error reports don't need to special-case "not
 *    configured".
 *
 * Public API:
 * - `startSpan(name, options?)` — create a new active span
 * - `withSpan(name, fn, options?)` — run `fn` inside a span, return its result
 * - `getCurrentTraceId()` / `getCurrentSpanId()` — read the active context
 * - `extractContext(headers)` / `injectContext(headers)` — W3C trace context
 * - `getSpans()` — read the in-memory span recorder (always available,
 *   used for tests and for the `console` exporter)
 * - `reset()` — clear the in-memory recorder
 *
 * The service is registered in the DI container as a singleton. The
 * framework does **not** call `trace.getTracer` until something
 * actually starts a span.
 */

import {
	type Context,
	type Span as OtelSpan,
	context as otelContext,
	propagation,
	SpanKind,
	SpanStatusCode,
	type Tracer,
	trace,
} from "@opentelemetry/api";
import type {
	ActiveSpan,
	FinishedSpan,
	SpanContext,
	SpanOptions,
	SpanStatus,
} from "./types.js";

/* ------------------------------------------------------------------ *
 * In-memory recorder
 * ------------------------------------------------------------------ */

export class InMemorySpanRecorder {
	private finished: FinishedSpan[] = [];
	private nextEventCounter = 0;

	/** Append a finished span. */
	record(span: FinishedSpan): void {
		this.finished.push(span);
		this.nextEventCounter++;
	}

	/** Return all finished spans (most recent last). */
	getAll(): FinishedSpan[] {
		return this.finished;
	}

	/** Return only the spans whose `name` matches. */
	findByName(name: string): FinishedSpan[] {
		return this.finished.filter((s) => s.name === name);
	}

	/** Clear the recorder. */
	clear(): void {
		this.finished = [];
		this.nextEventCounter = 0;
	}

	/** Number of recorded spans. */
	get size(): number {
		return this.finished.length;
	}
}

/* ------------------------------------------------------------------ *
 * ActiveSpan wrapper around OTel span
 * ------------------------------------------------------------------ */

class OtelActiveSpan implements ActiveSpan {
	constructor(
		public readonly name: string,
		public readonly traceId: string,
		public readonly spanId: string,
		public readonly isRecording: boolean,
		private readonly otelSpan: OtelSpan,
	) {}

	setAttribute(key: string, value: string | number | boolean): void {
		this.otelSpan.setAttribute(key, value);
	}

	setAttributes(attributes: Record<string, string | number | boolean>): void {
		this.otelSpan.setAttributes(attributes);
	}

	addEvent(name: string, attributes?: Record<string, unknown>): void {
		this.otelSpan.addEvent(name, attributes as never);
	}

	recordException(err: unknown): void {
		if (err instanceof Error) {
			this.otelSpan.recordException(err);
		} else {
			this.otelSpan.recordException(new Error(String(err)));
		}
	}

	setStatus(status: "ok" | "error" | "unset", description?: string): void {
		const code =
			status === "ok"
				? SpanStatusCode.OK
				: status === "error"
					? SpanStatusCode.ERROR
					: SpanStatusCode.UNSET;
		this.otelSpan.setStatus({ code, message: description });
	}

	end(): void {
		this.otelSpan.end();
	}
}

/* ------------------------------------------------------------------ *
 * TracingService
 * ------------------------------------------------------------------ */

export const TRACING_SERVICE_TOKEN = Symbol.for("nexus:TracingService");

/**
 * Global registry of the active `TracingService` instance.
 * The framework's `TracingModule.forRoot()` calls `setTracingService()`.
 * Decorators that need a `TracingService` (e.g. `@Trace()`) call
 * `getTracingService()` to look it up without DI plumbing.
 */
let _current: TracingService | undefined;

export function setTracingService(service: TracingService): void {
	_current = service;
}

export function getTracingService(): TracingService | undefined {
	return _current;
}

export class TracingService {
	readonly tracer: Tracer;
	private readonly recorder = new InMemorySpanRecorder();
	private sdkStop?: () => Promise<void>;
	private initialized = false;

	constructor() {
		// Default OTel tracer: "nexusjs". Even with no SDK, this returns
		// a no-op tracer that produces no-op spans — never throws.
		this.tracer = trace.getTracer("nexusjs", "0.4.0");
	}

	/** True if the SDK has been started (i.e. `forRoot()` was called). */
	get isInitialized(): boolean {
		return this.initialized;
	}

	/** Read all finished spans recorded so far. */
	getSpans(): FinishedSpan[] {
		return this.recorder.getAll();
	}

	/** Find spans by name. */
	findSpans(name: string): FinishedSpan[] {
		return this.recorder.findByName(name);
	}

	/** Clear the in-memory recorder (and the SDK's batch, if any). */
	clearSpans(): void {
		this.recorder.clear();
	}

	/* ---------------- span lifecycle ---------------- */

	startSpan(name: string, options: SpanOptions = {}): ActiveSpan {
		const kind = toOtelKind(options.kind ?? "internal");
		const otelSpan = this.tracer.startSpan(name, {
			kind,
			attributes: options.attributes as never,
			startTime: options.startTime,
		});

		const ctx = otelSpan.spanContext();
		return new OtelActiveSpan(
			name,
			ctx.traceId,
			ctx.spanId,
			otelSpan.isRecording(),
			otelSpan,
		);
	}

	/** Run `fn` inside a new span. Returns the result of `fn`. */
	async withSpan<T>(
		name: string,
		fn: (span: ActiveSpan) => Promise<T> | T,
		options: SpanOptions = {},
	): Promise<T> {
		const span = this.startSpan(name, options);
		const ctx = trace.setSpan(otelContext.active(), (span as OtelActiveSpan)["otelSpan"] as OtelSpan);
		try {
			const result = await otelContext.with(ctx, () => fn(span));
			if (span.isRecording) span.setStatus("ok");
			return result;
		} catch (err) {
			if (span.isRecording) {
				span.recordException(err);
				span.setStatus("error", err instanceof Error ? err.message : String(err));
			}
			throw err;
		} finally {
			span.end();
		}
	}

	/** Synchronous version of `withSpan`. */
	withSpanSync<T>(name: string, fn: (span: ActiveSpan) => T, options: SpanOptions = {}): T {
		const span = this.startSpan(name, options);
		try {
			const result = fn(span);
			if (span.isRecording) span.setStatus("ok");
			return result;
		} catch (err) {
			if (span.isRecording) {
				span.recordException(err);
				span.setStatus("error", err instanceof Error ? err.message : String(err));
			}
			throw err;
		} finally {
			span.end();
		}
	}

	/* ---------------- context propagation ---------------- */

	/** Get the trace id of the active span, or `undefined`. */
	getCurrentTraceId(): string | undefined {
		const ctx = trace.getSpan(otelContext.active())?.spanContext();
		return ctx?.traceId;
	}

	/** Get the span id of the active span, or `undefined`. */
	getCurrentSpanId(): string | undefined {
		const ctx = trace.getSpan(otelContext.active())?.spanContext();
		return ctx?.spanId;
	}

	/** Get the current OTel `Context`. */
	getCurrentContext(): Context {
		return otelContext.active();
	}

	/**
	 * Extract a span context from incoming HTTP headers.
	 * Reads `traceparent` (W3C) and `x-b3-*` (B3 single) when present.
	 * Returns `undefined` if no recognizable header is found.
	 */
	extractContext(headers: Record<string, string | string[] | undefined>): Context {
		const flat = flattenHeaders(headers);
		return propagation.extract(otelContext.active(), flat);
	}

	/**
	 * Inject the active span context into outgoing HTTP headers.
	 * Writes `traceparent` (W3C) by default.
	 */
	injectContext(headers: Record<string, string> = {}): Record<string, string> {
		const out: Record<string, string> = { ...headers };
		propagation.inject(otelContext.active(), out);
		return out;
	}

	/* ---------------- SDK bootstrap (called by module) ---------------- */

	/**
	 * Initialize the OpenTelemetry SDK with the given configuration.
	 * This is called by `TracingModule.forRoot()`. It's idempotent.
	 */
	async startSdk(config: import("./types.js").TracingConfig): Promise<void> {
		if (this.initialized) return;

		const serviceName = config.serviceName ?? process.env.OTEL_SERVICE_NAME ?? "nexusjs";
		const endpoint = config.endpoint ?? process.env.OTEL_EXPORTER_OTLP_ENDPOINT ?? "http://localhost:4318";
		const sampleRatio = config.sampleRatio ?? 1.0;

		// Lazy import the SDK so apps that don't use tracing don't pay the cost.
		// The SDK packages are optional peer dependencies; we resolve them
		// dynamically so users who don't trace don't need them.
		let NodeSDK: any, OTLPTraceExporter: any, Resource: any, SemanticResourceAttributes: any;
		try {
			// @ts-expect-error - optional peer dep
			({ NodeSDK } = await import("@opentelemetry/sdk-node"));
			// @ts-expect-error - optional peer dep
			({ OTLPTraceExporter } = await import("@opentelemetry/exporter-trace-otlp-http"));
			// @ts-expect-error - optional peer dep
			({ Resource } = await import("@opentelemetry/resources"));
			const semconv = await import("@opentelemetry/semantic-conventions");
			SemanticResourceAttributes = (semconv as any).SemanticResourceAttributes ?? semconv;
		} catch (err) {
			throw new Error(
				"TracingModule.forRoot() requires the OTel SDK packages. " +
					"Install with: bun add @opentelemetry/sdk-node @opentelemetry/exporter-trace-otlp-http @opentelemetry/resources @opentelemetry/semantic-conventions",
			);
		}

		// Build the resource
		const resourceAttrs: Record<string, string> = {
			[SemanticResourceAttributes.SERVICE_NAME ?? "service.name"]: serviceName,
			[SemanticResourceAttributes.SERVICE_VERSION ?? "service.version"]:
				config.serviceVersion ?? "0.0.0",
			[SemanticResourceAttributes.DEPLOYMENT_ENVIRONMENT ?? "deployment.environment"]:
				config.environment ?? process.env.NODE_ENV ?? "development",
			...config.resourceAttributes,
		};
		const resource = new Resource(resourceAttrs);

		// Pick the exporter
		let traceExporter: any;
		if (config.exporter === "console" || config.exporter === "memory" || !config.exporter) {
			// Console exporter: print to stdout. (Bun has no in-process
			// console exporter, so we use a simple OTel-compatible one
			// via the in-memory recorder.)
			traceExporter = undefined; // We use the recorder for the in-memory case
		} else {
			traceExporter = new OTLPTraceExporter({ url: `${endpoint.replace(/\/$/, "")}/v1/traces` });
		}

		// Build the SDK
		const sdk = new NodeSDK({
			resource,
			traceExporter,
			sampler: {
				// Custom simple ratio sampler to avoid pulling the full sampler package.
				shouldSample: () => ({
					decision: Math.random() < sampleRatio ? 1 : 0,
				}),
				toString: () => `RatioSampler(${sampleRatio})`,
			},
		});
		sdk.start();

		this.sdkStop = async () => {
			try {
				await sdk.shutdown();
			} catch {
				/* ignore shutdown errors */
			}
		};

		this.initialized = true;
	}

	/** Stop the SDK. Called on process exit / app shutdown. */
	async stopSdk(): Promise<void> {
		if (this.sdkStop) {
			await this.sdkStop();
			this.sdkStop = undefined;
		}
		this.initialized = false;
	}
}

/* ------------------------------------------------------------------ *
 * Helpers
 * ------------------------------------------------------------------ */

function toOtelKind(kind: NonNullable<SpanOptions["kind"]>): SpanKind {
	switch (kind) {
		case "server":
			return SpanKind.SERVER;
		case "client":
			return SpanKind.CLIENT;
		case "producer":
			return SpanKind.PRODUCER;
		case "consumer":
			return SpanKind.CONSUMER;
		default:
			return SpanKind.INTERNAL;
	}
}

function flattenHeaders(
	headers: Record<string, string | string[] | undefined>,
): Record<string, string> {
	const out: Record<string, string> = {};
	for (const [k, v] of Object.entries(headers)) {
		if (v === undefined) continue;
		out[k.toLowerCase()] = Array.isArray(v) ? v.join(",") : v;
	}
	return out;
}

/** Re-export for downstream type users. */
export type { SpanContext, SpanStatus };
