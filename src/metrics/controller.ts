/**
 * `MetricsController` — exposes `GET /metrics` for Prometheus
 * scrapers. Supports content negotiation: the response format is
 * `text/plain` (Prometheus 0.0.4) by default, or
 * `application/openmetrics-text` if the request asks for it.
 *
 * The controller is auto-mounted by `MetricsModule.forRoot()`. If
 * you want to mount it manually (e.g. on a different path), call
 * `MetricsController.handler(service)` and wire it up yourself.
 */

import type { Context } from "hono";
import type { MetricsService } from "./service.js";

export class MetricsController {
	static readonly PATH = "/metrics";

	/**
	 * Returns a Hono handler that serves the /metrics endpoint.
	 *
	 * @example
	 *   app.get("/metrics", MetricsController.handler(svc));
	 */
	static handler(service: MetricsService) {
		return (c: Context) => {
			const accept = c.req.header("accept") ?? "";
			const format = accept.includes("application/openmetrics-text") ? "openmetrics" : "prometheus";
			const { contentType, body } = service.expose(format);
			return c.body(body, 200, {
				"content-type": contentType,
				"cache-control": "no-store",
			});
		};
	}

	/** Mount the controller on the given Hono app at `path`. */
	static mount(app: { get: (path: string, ...handlers: unknown[]) => unknown }, service: MetricsService, path: string = MetricsController.PATH): void {
		app.get(path, MetricsController.handler(service));
	}
}