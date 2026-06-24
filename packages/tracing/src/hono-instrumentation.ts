/**
 * Hono auto-instrumentation for `nexusjs/tracing`.
 *
 * Returns a Hono middleware that:
 * 1. Extracts the incoming trace context (W3C `traceparent`).
 * 2. Starts a `SERVER` span with HTTP method, route, target, etc.
 * 3. Records the response status, body size, and any thrown error.
 *
 * The middleware is a no-op when the SDK is not configured: the
 * OTel API returns a no-op span that immediately ends, but the
 * `traceparent` is still parsed for the response.
 */

import { type Context, SpanKind, SpanStatusCode, trace } from "@opentelemetry/api";
import type { MiddlewareHandler } from "hono";
import type { TracingService } from "./service.js";

export function tracingMiddleware(service: TracingService): MiddlewareHandler {
	return async (c, next) => {
		const incoming = c.req.raw.headers;
		const flat: Record<string, string> = {};
		incoming.forEach((v, k) => { flat[k] = v; });
		const extractedCtx: Context = service.extractContext(flat);

		const method = c.req.method;
		const path = c.req.path;
		const route = c.req.routePath ?? path;
		const userAgent = c.req.header("user-agent") ?? "";
		const url = new URL(c.req.url);
		const clientIp = c.req.header("x-forwarded-for") ?? c.req.header("x-real-ip") ?? "";

		const span = service.tracer.startSpan(
			`HTTP ${method} ${route}`,
			{
				kind: SpanKind.SERVER,
				attributes: {
					"http.method": method,
					"http.target": path,
					"http.route": route,
					"http.scheme": url.protocol.replace(":", ""),
					"http.host": url.host,
					"http.user_agent": userAgent,
					"http.client_ip": clientIp,
					"url.path": path,
				},
			},
			extractedCtx,
		);

		const ctxWithSpan = trace.setSpan(extractedCtx, span);
		const result = await service.tracer.startActiveSpan(
			`HTTP ${method} ${route} handler`,
			{ kind: SpanKind.SERVER },
			ctxWithSpan,
			async () => {
				try {
					await next();
					const status = c.res.status;
					span.setAttribute("http.status_code", status);
					if (status >= 500) {
						span.setStatus({ code: SpanStatusCode.ERROR });
					} else {
						span.setStatus({ code: SpanStatusCode.OK });
					}
				} catch (err) {
					span.recordException(err as Error);
					span.setStatus({ code: SpanStatusCode.ERROR, message: (err as Error).message });
					span.setAttribute("http.status_code", 500);
					throw err;
				} finally {
					span.end();
				}
			},
		);
		return result as never;
	};
}

/**
 * Inject the active trace context into an outgoing fetch / response.
 * Use in fetch() calls so downstream services pick up the trace.
 */
export function injectOutgoingTraceparent(
	service: TracingService,
	headers: Record<string, string> = {},
): Record<string, string> {
	return service.injectContext(headers);
}
