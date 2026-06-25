/**
 * `OpenAPIModule` — drop-in OpenAPI 3.1 + Scalar UI.
 *
 *   @Module({
 *     imports: [
 *       OpenAPIModule.forRoot({
 *         info: { title: 'My API', version: '1.0.0' },
 *         servers: [{ url: 'http://localhost:3000' }],
 *       }),
 *     ],
 *   })
 *   export class AppModule {}
 *
 * After boot, the framework exposes:
 *
 *   GET /openapi.json   — the OpenAPI 3.1 spec
 *   GET /docs           — the Scalar UI
 *
 * To feed routes to the spec, the application must call
 * `OpenAPIService.setRoutes(...)` after the router is built. The
 * recommended way is to read routes from the `NexusServer` instance
 * inside the module's onModuleInit hook (see the helper below).
 */
import { Module } from "@nexusts/core";
import { OpenAPIService } from "./openapi.service.js";
import type { OpenAPIConfig } from "./types.js";
import { safeGetMeta, safeDefineMeta, safeHasMeta } from "@nexusts/core/di/safe-reflect";

@Module({
	providers: [
		OpenAPIService,
		{ provide: OpenAPIService.TOKEN, useExisting: OpenAPIService },
	],
	exports: [OpenAPIService, OpenAPIService.TOKEN],
})
export class OpenAPIModule {
	static forRoot(config: OpenAPIConfig) {
		@Module({
			providers: [
				OpenAPIService,
				{ provide: OpenAPIService.TOKEN, useExisting: OpenAPIService },
				{ provide: "OPENAPI_CONFIG", useValue: config },
			],
			exports: [OpenAPIService, OpenAPIService.TOKEN],
		})
		class ConfiguredOpenAPIModule {}
		Object.defineProperty(ConfiguredOpenAPIModule, "name", {
			value: "ConfiguredOpenAPIModule",
		});
		return ConfiguredOpenAPIModule;
	}

	/**
	 * Mount the spec + Scalar UI on an existing Hono app. The user
	 * calls this once, after the framework's router is built, passing
	 * the route list.
	 *
	 *   import { mountOpenAPI } from 'nexusjs/openapi';
	 *   const openapi = new OpenAPIService(config);
	 *   openapi.setRoutes(routes);
	 *   mountOpenAPI(app, openapi, config);
	 */
	static mount(
		app: { use: (path: string, ...handlers: any[]) => any; get: (path: string, ...handlers: any[]) => any },
		svc: OpenAPIService,
		config: OpenAPIConfig,
	): void {
		const specPath = config.specPath ?? "/openapi.json";
		const docsPath = config.path ?? "/docs";
		// The route handlers are evaluated lazily at request time.
		app.get(specPath, (c: any) => c.json(svc.getSpec(), 200, { "Content-Type": "application/json" }));
		app.get(docsPath, (c: any) => {
			// We import lazily to avoid a circular dep.
			const { scalarHtml } = require("./scalar.js") as typeof import("./scalar.js");
			const html = scalarHtml({
				title: config.info.title,
				specUrl: specPath,
			});
			return c.html(html, 200, { "Content-Type": "text/html; charset=utf-8" });
		});
	}
}