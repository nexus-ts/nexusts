/**
 * `ResilienceAdminModule` — opt-in HTTP endpoints for inspecting and
 * controlling circuit breakers and bulkheads at runtime.
 *
 * Usage:
 *
 *   @Module({
 *     imports: [
 *       ResilienceModule.forRoot({ threshold: 0.5 }),
 *       ResilienceAdminModule.forRoot({ prefix: '/admin/resilience' }),
 *     ],
 *   })
 *   class AppModule {}
 *
 * Endpoints (relative to `prefix`, default `/resilience`):
 *   GET  /resilience/circuits              — list all circuits
 *   GET  /resilience/bulkheads             — list all bulkheads
 *   POST /resilience/circuits/:name/force-open
 *   POST /resilience/circuits/:name/force-close
 *   POST /resilience/circuits/:name/reset
 *
 * Requires `ResilienceModule.forRoot()` to also be imported — the admin
 * module resolves `ResilienceService.TOKEN` through the shared DI parent
 * container that both modules register into.
 */
import { Controller, Get, Inject, Module, Param, Post } from "@nexusts/core";
import { ResilienceService } from "./resilience.service.js";

export interface ResilienceAdminConfig {
	/** Route prefix. Default: `"/resilience"`. */
	prefix?: string;
}

export class ResilienceAdminModule {
	static forRoot(config: ResilienceAdminConfig = {}) {
		const prefix = config.prefix ?? "/resilience";

		@Controller(prefix)
		class ResilienceAdminController {
			_svc: ResilienceService;
			constructor(@Inject(ResilienceService.TOKEN) svc: ResilienceService) {
				this._svc = svc;
			}

			@Get("/circuits")
			listCircuits() {
				return this._svc.listCircuits();
			}

			@Get("/bulkheads")
			listBulkheads() {
				return this._svc.listBulkheads();
			}

			@Post("/circuits/:name/force-open")
			forceOpen(@Param("name") name: string) {
				const cb = this._svc.getCircuit(name);
				if (!cb) {
					return { status: 404, body: { error: `Circuit "${name}" not found` } };
				}
				cb.forceOpen();
				return { name, state: "open" };
			}

			@Post("/circuits/:name/force-close")
			forceClose(@Param("name") name: string) {
				const cb = this._svc.getCircuit(name);
				if (!cb) {
					return { status: 404, body: { error: `Circuit "${name}" not found` } };
				}
				cb.forceClose();
				return { name, state: "closed" };
			}

			@Post("/circuits/:name/reset")
			reset(@Param("name") name: string) {
				const cb = this._svc.getCircuit(name);
				if (!cb) {
					return { status: 404, body: { error: `Circuit "${name}" not found` } };
				}
				cb.reset();
				return { name, state: "closed" };
			}
		}

		Object.defineProperty(ResilienceAdminController, "name", {
			value: "ResilienceAdminController",
		});

		@Module({
			controllers: [ResilienceAdminController],
		})
		class ConfiguredResilienceAdminModule {}

		Object.defineProperty(ConfiguredResilienceAdminModule, "name", {
			value: "ConfiguredResilienceAdminModule",
		});

		return ConfiguredResilienceAdminModule;
	}
}
