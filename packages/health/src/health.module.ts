/**
 * `HealthModule` — drop-in module for `/health/live`, `/health/ready`,
 * `/health/startup` endpoints.
 *
 * Usage:
 *   @Module({
 *     imports: [
 *       HealthModule.forRoot({
 *         builtIn: {
 *           memory: true,
 *           disk: { threshold: 0.1 },
 *           http: { url: 'https://api.stripe.com/v1/healthcheck' },
 *         },
 *       }),
 *     ],
 *   })
 *   export class AppModule {}
 *
 * Then `/health/live`, `/health/ready`, `/health/startup` respond
 * with a JSON body. Status 200 on `'up'`, 503 on `'down'`.
 */

import "reflect-metadata";
import { Module } from "@nexusts/core";
import { HealthController } from "./health.controller.js";
import { HealthCheckService } from "./health.service.js";
import type { HealthConfig } from "./types.js";

@Module({
	controllers: [HealthController],
	providers: [
		HealthCheckService,
		{ provide: HealthCheckService.TOKEN, useExisting: HealthCheckService },
	],
	exports: [HealthCheckService, HealthCheckService.TOKEN],
})
export class HealthModule {
	static forRoot(config: HealthConfig = {}) {
		@Module({
			controllers: [HealthController],
			providers: [
				HealthCheckService,
				{ provide: HealthCheckService.TOKEN, useExisting: HealthCheckService },
				{ provide: "HEALTH_CONFIG", useValue: config },
			],
			exports: [HealthCheckService, HealthCheckService.TOKEN],
		})
		class ConfiguredHealthModule {}

		Object.defineProperty(ConfiguredHealthModule, "name", {
			value: "ConfiguredHealthModule",
		});

		return ConfiguredHealthModule;
	}
}
