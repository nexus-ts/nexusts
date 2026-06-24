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
import { Module, setControllerMethodHook } from "@nexusts/core";
import { ResilienceService } from "./resilience.service.js";
import {
	setResilienceService,
	getResilientMetadata,
	makeResilientWrapper,
} from "./decorators/index.js";
import { MemoryResilienceStore } from "./stores/memory.js";
import type { ResilienceConfig, ResilienceStore } from "./types.js";

@Module({
	providers: [
		ResilienceService,
		{ provide: ResilienceService.TOKEN, useExisting: ResilienceService },
	],
	exports: [ResilienceService, ResilienceService.TOKEN],
})
export class ResilienceModule {
	static forRoot(config: ResilienceConfig = {}) {
		// Eager-wrap: at controller-mount time, check each method for
		// @Retry / @CircuitBreaker / @Bulkhead / @Resilient metadata and
		// wrap it so the call goes through the resilience pipeline without
		// any explicit `svc.retry(...)` / `cb.execute(...)` boilerplate.
		// The service is resolved lazily at call time via getResilienceService().
		setControllerMethodHook((proto, propertyKey, handler) => {
			const meta = getResilientMetadata(proto, propertyKey);
			if (!meta.retry && !meta.circuit && !meta.bulkhead) return handler;
			return makeResilientWrapper(
				handler,
				() => getResilientMetadata(proto, propertyKey),
			);
		});

		@Module({
			providers: [
				{
					provide: ResilienceService.TOKEN,
					useFactory: () => {
						// Resolve the cross-pod store synchronously.
						// For Redis: pre-build the store and pass it as an instance:
						//   const store = new RedisResilienceStore(client);
						//   ResilienceModule.forRoot({ store });
						let store: ResilienceStore | undefined;
						if (config.store && config.store !== "memory" && config.store !== "redis") {
							store = config.store as ResilienceStore;
						} else {
							store = new MemoryResilienceStore();
						}

						const svc = new ResilienceService(config, store);
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
