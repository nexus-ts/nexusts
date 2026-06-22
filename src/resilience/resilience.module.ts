/**
 * `ResilienceModule` — drop-in DI for the resilience primitives.
 *
 *   @Module({
 *     imports: [
 *       ResilienceModule.forRoot({
 *         retry: { attempts: 3, backoff: "exponential-jitter" },
 *         circuit: { threshold: 0.5, timeout: 30_000 },
 *       }),
 *     ],
 *   })
 *   class AppModule {}
 *
 * After boot, the service is available as `@Inject(ResilienceService.TOKEN)`
 * — controllers can call `svc.getOrCreateCircuit("stripe")` to share
 * a circuit breaker with the rest of the app.
 *
 * The decorators (`@Retry`, `@CircuitBreaker`, `@Bulkhead`,
 * `@Resilient`) work without the module — they pick up the
 * service from the DI container at controller-mount time.
 */
import { Module } from "../core/decorators/module.js";
import { ResilienceService } from "./resilience.service.js";
import { setResilienceService } from "./decorators/index.js";
import type { ResilienceConfig } from "./types.js";

@Module({
	providers: [
		ResilienceService,
		{ provide: ResilienceService.TOKEN, useExisting: ResilienceService },
	],
	exports: [ResilienceService, ResilienceService.TOKEN],
})
export class ResilienceModule {
	static forRoot(config: ResilienceConfig = {}) {
		@Module({
			providers: [
				{
					provide: ResilienceService.TOKEN,
					useFactory: () => {
						const svc = new ResilienceService(config);
						// Register globally so the eager-decorator path
						// (in `decorators/index.ts`) can find us without
						// needing each controller method to carry an
						// `@Inject(ResilienceService.TOKEN)` argument.
						setResilienceService(svc);
						return svc;
					},
				},
				{
					provide: "RESILIENCE_CONFIG",
					useValue: config,
				},
			],
			exports: [ResilienceService.TOKEN, "RESILIENCE_CONFIG"],
		})
		class ConfiguredResilienceModule {}
		Object.defineProperty(ConfiguredResilienceModule, "name", {
			value: "ConfiguredResilienceModule",
		});
		return ConfiguredResilienceModule;
	}
}
