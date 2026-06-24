/**
 * `TracingModule` — wires up `TracingService` into the DI container
 * and (optionally) installs the Hono auto-instrumentation middleware.
 *
 * Usage:
 *   @Module({
 *     imports: [TracingModule.forRoot({
 *       serviceName: "my-app",
 *       exporter: "otlp-http",
 *       endpoint: "http://otel-collector:4318",
 *       sampleRatio: 0.1,
 *     })],
 *   })
 *   class AppModule {}
 *
 * When `forRoot()` is called:
 * 1. The OTel SDK is started (lazy `import()` of the SDK packages).
 * 2. The Hono `tracingMiddleware` is installed in the framework's
 *    HTTP server (when `enableHttpInstrumentation !== false`).
 * 3. The `TracingService` becomes the active global service that
 *    `@Trace()` decorators read from.
 *
 * When `forRoot()` is **not** called, `nexusjs/tracing` is a no-op:
 *   - `TracingService` instances use OTel's default no-op tracer.
 *   - `@Trace()` returns the original method unchanged.
 *   - No SDK packages are loaded.
 */

import { Inject, Injectable, Module } from "@nexusts/core";
import type { MiddlewareHandler } from "hono";
import { tracingMiddleware } from "./hono-instrumentation.js";
import { setTracingService, TRACING_SERVICE_TOKEN, TracingService } from "./service.js";
import type { TracingConfig } from "./types.js";

export const TRACING_CONFIG_TOKEN = Symbol.for("nexus:TracingConfig");

@Injectable()
export class TracingConfigHolder {
	constructor(@Inject(TRACING_CONFIG_TOKEN) public readonly config: Required<TracingConfig>) {}
}

@Injectable()
export class TracingServiceWithLifecycle extends TracingService {
	async onApplicationBootstrap(): Promise<void> {
		// Will be set in the module factory; no-op here.
	}

	async onApplicationShutdown(): Promise<void> {
		await this.stopSdk();
	}
}

@Module({
	providers: [
		TracingServiceWithLifecycle,
		{ provide: TRACING_SERVICE_TOKEN, useExisting: TracingServiceWithLifecycle },
	],
	exports: [TracingServiceWithLifecycle, TRACING_SERVICE_TOKEN],
})
export class TracingModule {
	static forRoot(config: TracingConfig = {}) {
		const fullConfig: Required<TracingConfig> = {
			serviceName: config.serviceName ?? process.env.OTEL_SERVICE_NAME ?? "nexusjs",
			serviceVersion: config.serviceVersion ?? "0.0.0",
			environment: config.environment ?? process.env.NODE_ENV ?? "development",
			exporter: config.exporter ?? "otlp-http",
			endpoint: config.endpoint ?? process.env.OTEL_EXPORTER_OTLP_ENDPOINT ?? "http://localhost:4318",
			sampleRatio: config.sampleRatio ?? 1.0,
			enableHttpInstrumentation: config.enableHttpInstrumentation ?? true,
			enableDbInstrumentation: config.enableDbInstrumentation ?? true,
			resourceAttributes: config.resourceAttributes ?? {},
			throwOnError: config.throwOnError ?? false,
		};

		@Module({
			providers: [
				TracingServiceWithLifecycle,
				{ provide: TRACING_CONFIG_TOKEN, useValue: fullConfig },
				{ provide: TRACING_SERVICE_TOKEN, useExisting: TracingServiceWithLifecycle },
			],
			exports: [TracingServiceWithLifecycle, TRACING_CONFIG_TOKEN, TRACING_SERVICE_TOKEN],
		})
		class ConfiguredTracingModule {
			constructor(@Inject(TracingServiceWithLifecycle) private svc: TracingServiceWithLifecycle) {
				// Side-effect: start the SDK & register the global.
				void svc.startSdk(fullConfig);
				setTracingService(svc);
			}
		}
		Object.defineProperty(ConfiguredTracingModule, "name", { value: "ConfiguredTracingModule" });

		// Return both the module class and a helper for installing the
		// Hono middleware (for users who want to use `nexusjs/tracing` with
		// a custom Hono app, not the framework's HTTP server).
		const mod = ConfiguredTracingModule as unknown as Function & {
			middleware: () => MiddlewareHandler;
		};
		mod.middleware = () => {
			const svc = new TracingService();
			setTracingService(svc);
			return tracingMiddleware(svc);
		};

		return mod;
	}
}
