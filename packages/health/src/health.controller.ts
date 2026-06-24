/**
 * `HealthController` — built-in `/health/live`, `/health/ready`,
 * `/health/startup` endpoints.
 *
 * Mount `HealthModule.forRoot({...})` in your app module to get
 * these routes automatically. Override paths or add an auth token
 * via `HealthConfig`.
 */

import { Controller, Get, Inject, Req, Res } from "@nexusts/core";
import type { Context } from "hono";
import { HealthCheckService } from "./health.service.js";
import type { HealthCheckKind, HealthConfig } from "./types.js";

@Controller()
export class HealthController {
	constructor(@Inject(HealthCheckService.TOKEN) private readonly health: HealthCheckService) {}

	@Get("/health/live")
	async live(@Req() c: Context, @Res() _res: Response) {
		return this.respond(c, "liveness", this.health.config.livenessPath ?? "/health/live");
	}

	@Get("/health/ready")
	async ready(@Req() c: Context, @Res() _res: Response) {
		return this.respond(c, "readiness", this.health.config.readinessPath ?? "/health/ready");
	}

	@Get("/health/startup")
	async startup(@Req() c: Context, @Res() _res: Response) {
		return this.respond(c, "startup", this.health.config.startupPath ?? "/health/startup");
	}

	private async respond(c: Context, kind: HealthCheckKind, _configuredPath: string) {
		const result = await this.health.check(kind);
		const status = result.status === "up" ? 200 : 503;
		return c.json(result, status);
	}
}

// Augment HealthCheckService to expose config (used by the controller).
declare module "./health.service.js" {
	interface HealthCheckService {
		config: HealthConfig;
	}
}