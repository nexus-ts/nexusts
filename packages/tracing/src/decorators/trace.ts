/**
 * `@Trace()` — class-method decorator that wraps the call in a span.
 *
 * Usage:
 *   class UserService {
 *     @Trace()                  // span name = class.method
 *     async findById(id: string) { ... }
 *
 *     @Trace("user.lookup")     // explicit span name
 *     async lookup(name: string) { ... }
 *
 *     @Trace({ name: "user.cache.get", attributes: { cache: "lru" } })
 *     async getFromCache(key: string) { ... }
 *   }
 *
 * The decorator reads the `TracingService` from the global registry
 * (set by `TracingModule.forRoot()`). When no service is registered
 * the decorator is a pass-through.
 *
 * Sync methods stay sync; async methods stay async. The decorator
 * detects `AsyncFunction` and uses `withSpan` / `withSpanSync` accordingly.
 */

import { getTracingService } from "../service.js";
import type { ActiveSpan, SpanOptions } from "../types.js";

export type TraceOptions =
	| string
	| undefined
	| (SpanOptions & { name: string });

const TRACE_KEY = Symbol.for("nexus:trace:options");

/**
 * Method decorator: wrap a call in a span.
 *
 * The decorator works on both async and sync methods. The wrapped
 * function preserves `this` so decorators on classes still see the
 * right instance.
 */
export function Trace(opts?: TraceOptions) {
	return (target: object, propertyKey: string | symbol, descriptor: PropertyDescriptor) => {
		const original = descriptor.value as (...args: unknown[]) => unknown;
		if (typeof original !== "function") {
			throw new Error(`@Trace() can only be applied to methods, got ${typeof original}`);
		}

		const options = normalizeOptions(opts ?? {}, target, propertyKey);
		(target as any)[TRACE_KEY] = (target as any)[TRACE_KEY] ?? {};
		(target as any)[TRACE_KEY][String(propertyKey)] = options;

		const isAsync = (original as any).constructor?.name === "AsyncFunction";

		if (isAsync) {
			descriptor.value = async function wrapped(this: unknown, ...args: unknown[]) {
				const service = getTracingService();
				if (!service) return original.apply(this, args);
				return service.withSpan(
					options.name,
					async (span: ActiveSpan) => {
						if (options.attributes) span.setAttributes(options.attributes!);
						return original.apply(this, args);
					},
					{ kind: options.kind ?? "internal", attributes: options.attributes },
				);
			};
		} else {
			descriptor.value = function wrapped(this: unknown, ...args: unknown[]) {
				const service = getTracingService();
				if (!service) return original.apply(this, args);
				return service.withSpanSync(
					options.name,
					(span: ActiveSpan) => {
						if (options.attributes) span.setAttributes(options.attributes!);
						return original.apply(this, args);
					},
					{ kind: options.kind ?? "internal", attributes: options.attributes },
				);
			};
		}
		return descriptor;
	};
}

/** Read the @Trace options for a given method (used by OpenAPI integration). */
export function getTraceOptions(target: object, method: string): TraceOptions | undefined {
	return (target as any)[TRACE_KEY]?.[method];
}

function normalizeOptions(
	opts: TraceOptions | object,
	target: object,
	propertyKey: string | symbol,
): { name: string; kind: NonNullable<SpanOptions["kind"]>; attributes?: SpanOptions["attributes"] } {
	if (typeof opts === "string") {
		return { name: opts, kind: "internal" };
	}
	if (opts && typeof opts === "object" && "name" in opts && (opts as any).name) {
		const o = opts as { name: string; kind?: SpanOptions["kind"]; attributes?: SpanOptions["attributes"] };
		return {
			name: o.name,
			kind: o.kind ?? "internal",
			attributes: o.attributes,
		};
	}
	// Default: use "ClassName.methodName"
	const cls = (target as any)?.constructor?.name ?? "Anonymous";
	return {
		name: `${cls}.${String(propertyKey)}`,
		kind: "internal",
	};
}
