/**
 * `GrpcModule` — wires `GrpcService` into the DI container.
 *
 *   @Module({
 *     imports: [
 *       GrpcModule.forRoot({
 *         protoPath: "./proto/user.proto",
 *         services: [UserServiceImpl],
 *         port: 50051,
 *       }),
 *     ],
 *   })
 *   class AppModule {}
 *
 * After boot, the user resolves `GrpcService` from the
 * container and calls `start()` / `stop()` to control the
 * gRPC server's lifecycle:
 *
 *   const grpc = container.resolve(GrpcService);
 *   await grpc.start();
 *   // ...
 *   await grpc.stop();
 *
 * The framework also auto-registers the service impl classes
 * as DI providers, so their `@Inject()`-decorated dependencies
 * are wired up automatically.
 */

import { Module } from "@nexusts/core";
import { GrpcService, GRPC_SERVICE_TOKEN } from "./service.js";
import type { GrpcConfig } from "./types.js";

@Module({
	providers: [GrpcService, { provide: GRPC_SERVICE_TOKEN, useExisting: GrpcService }],
	exports: [GrpcService, GRPC_SERVICE_TOKEN],
})
export class GrpcModule {
	static forRoot(config: GrpcConfig) {
		@Module({
			providers: [
				{ provide: "GRPC_CONFIG", useValue: config },
				// Service impl classes must be registered as providers so
				// the DI container can instantiate them.
				...config.services,
				{
					provide: GrpcService,
					useFactory: () => {
						const svc = new GrpcService(config);
						// Resolve service impls from the global DI container
						// (stashed by Application during bootstrap).
						const container = (globalThis as any).__nexus_container;
						if (container) {
							svc.setResolver((t) => container.resolve(t));
						}
						return svc;
					},
				},
				{ provide: GRPC_SERVICE_TOKEN, useExisting: GrpcService },
			],
			exports: [GrpcService, GRPC_SERVICE_TOKEN, "GRPC_CONFIG", ...config.services],
		})
		class ConfiguredGrpcModule {}
		Object.defineProperty(ConfiguredGrpcModule, "name", {
			value: "ConfiguredGrpcModule",
		});
		return ConfiguredGrpcModule as unknown as typeof GrpcModule;
	}
}
