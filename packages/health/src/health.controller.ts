/**
 * `HealthController` — built-in `/health/live`, `/health/ready`,
 * `/health/startup` endpoints.
 *
 * Mount `HealthModule.forRoot({...})` in your app module to get
 * these routes automatically. Override paths or add an auth token
 * via `HealthConfig`.
 *
 * Uses standard decorator patterns: field injection and `ctx.req.*`
 * methods instead of legacy `@Req()`/`@Res()` parameter decorators.
 */

import { Controller, Get, Inject } from "@nexusts/core";
import type { Context } from "hono";
import { HealthCheckService } from "./health.service.js";
import type { HealthCheckKind, } from "./types.js";

@Controller()
export class HealthController {
	@Inject(HealthCheckService.TOKEN) declare private readonly health: HealthCheckService;

	@Get("/health/live")
	async live(ctx: Context) {
		return this.respond(ctx, "liveness");
	}

	@Get("/health/ready")
	async ready(ctx: Context) {
		return this.respond(ctx, "readiness");
	}

	@Get("/health/startup")
	async startup(ctx: Context) {
		return this.respond(ctx, "startup");
	}

	private async respond(c: Context, kind: HealthCheckKind) {
		const result = await this.health.check(kind);
		const status = result.status === "up" ? 200 : 503;
		return c.json(result, status);
	}
}
