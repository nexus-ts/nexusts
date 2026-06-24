/**
 * `WebSocketModule` — wires `WebSocketService` into the DI container
 * and provides runtime-specific helpers for the application.
 *
 * Usage (Bun):
 *
 *   @Module({
 *     imports: [
 *       WebSocketModule.forRoot({
 *         gateways: [ChatGateway],
 *         path: '/ws',
 *       }),
 *     ],
 *   })
 *   class AppModule {}
 *
 *   const app = new Application(AppModule);
 *   const { websocket } = await app.wireWebSocket();
 *   Bun.serve({
 *     port: 3000,
 *     fetch: app.fetch,
 *     websocket,
 *   });
 *
 * Usage (Node):
 *
 *   const app = new Application(AppModule);
 *   const { server, wss } = await app.serveNodeWebSocket(3000);
 */

import { Inject, Module } from "@nexusts/core";
import { detectRuntime } from "./runtime/index.js";
import type { GatewayClass } from "./runtime/types.js";
import { WEBSOCKET_SERVICE_TOKEN, WebSocketService } from "./service.js";
import type { WebSocketConfig } from "./types.js";

@Module({
	providers: [
		WebSocketService,
		{ provide: WEBSOCKET_SERVICE_TOKEN, useExisting: WebSocketService },
	],
	exports: [WebSocketService, WEBSOCKET_SERVICE_TOKEN],
})
export class WebSocketModule {
	static forRoot(config: WebSocketConfig & { gateways?: GatewayClass[] } = {}) {
		const fullConfig: Required<WebSocketConfig> & { gateways: GatewayClass[] } = {
			path: config.path ?? "/ws",
			json: config.json ?? true,
			heartbeatSeconds: config.heartbeatSeconds ?? 30,
			onUnknownRuntime: config.onUnknownRuntime ?? "throw",
			gateways: config.gateways ?? [],
		};

		@Module({
			providers: [
				WebSocketService,
				{ provide: WEBSOCKET_SERVICE_TOKEN, useExisting: WebSocketService },
				{ provide: "WS_CONFIG", useValue: fullConfig },
			],
			exports: [WebSocketService, WEBSOCKET_SERVICE_TOKEN, "WS_CONFIG"],
		})
		class ConfiguredWebSocketModule {
			constructor(@Inject(WEBSOCKET_SERVICE_TOKEN) readonly service: WebSocketService) {}

			/** Detect the runtime at boot time. */
			detectRuntime() {
				return detectRuntime();
			}
		}
		Object.defineProperty(ConfiguredWebSocketModule, "name", {
			value: "ConfiguredWebSocketModule",
		});

		return ConfiguredWebSocketModule as unknown as typeof ConfiguredWebSocketModule & {
			readonly config: typeof fullConfig;
		};
	}
}
