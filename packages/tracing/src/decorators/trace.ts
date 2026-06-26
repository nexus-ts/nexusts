/**
 * `@Trace(name)` — wraps a method in an OpenTelemetry span.
 *
 * Dual-mode: supports TC39 standard ES decorators + legacy.
 */
import { getTracingService } from "../service.js";

export interface TraceOptions {
	/** Span name. Defaults to the method name. */
	name?: string;
	/** Span kind: "internal" | "server" | "client" | "producer" | "consumer". */
	kind?: "internal" | "server" | "client" | "producer" | "consumer";
	/** Attributes to attach to the span. */
	attributes?: Record<string, string | number | boolean>;
}

function makeTraceWrapper(original: (...args: unknown[]) => unknown, spanName: string, opts: TraceOptions = {}) {
	const isAsync = (original as any).constructor?.name === "AsyncFunction";
	if (isAsync) {
		return async function wrapped(this: unknown, ...args: unknown[]) {
			const svc = getTracingService();
			if (!svc) return original.apply(this, args);
			return svc.withSpan(spanName, (span) => {
				const { kind, attributes } = opts;
				if (kind) span.setAttribute("span.kind", kind);
				if (attributes) span.setAttributes(attributes);
				return original.apply(this, args);
			}, { kind: opts.kind, attributes: opts.attributes });
		};
	}
	return function wrapped(this: unknown, ...args: unknown[]) {
		const svc = getTracingService();
		if (!svc) return original.apply(this, args);
		return svc.withSpanSync(spanName, (span) => {
			const { kind, attributes } = opts;
			if (kind) span.setAttribute("span.kind", kind);
			if (attributes) span.setAttributes(attributes);
			return original.apply(this, args);
		}, { kind: opts.kind, attributes: opts.attributes });
	};
}

export function Trace(opts?: TraceOptions): any {
	const spanName = opts?.name;
	return function (this: any, targetOrFn: any, contextOrKey?: any): any {
		// Standard (TC39) decorator mode
		if (contextOrKey?.kind === "method") {
			const fn = targetOrFn;
			const name = spanName ?? contextOrKey.name;
			return makeTraceWrapper(fn, name, opts);
		}
		// Legacy (experimentalDecorators) mode
		const descriptor = contextOrKey as unknown as PropertyDescriptor;
		const original = descriptor.value as (...args: unknown[]) => unknown;
		const name = spanName ?? (typeof contextOrKey === "string" ? contextOrKey : "anonymous");
		descriptor.value = makeTraceWrapper(original, name, opts);
		return descriptor;
	};
}

/**
 * Read trace options for a method (legacy path).
 */
export function getTraceOptions(_target: any): TraceOptions | undefined {
	return undefined;
}
