/**
 * `@nexusts/ws` — Hono WebSocket integration.
 *
 * Provides a single API for WebSocket gateways that works on both
 * Bun (primary, via `hono/adapter/bun/websocket`) and Node (via
 * the `ws` package).
 *
 * Quick start:
 *
 *   @Injectable()
 *   @WebSocketGateway('/ws')
 *   class ChatGateway {
 *     @Inject(WEBSOCKET_SERVICE_TOKEN) declare private ws: WebSocketService;
 *
 *     @OnWebSocketOpen()
 *     onOpen(client: WebSocketClient) {
 *       this.ws.joinRoom(client, 'lobby');
 *     }
 *
 *     @OnWebSocketMessage()
 *     onMessage(client: WebSocketClient, data: any) {
 *       this.ws.broadcastToRoom('lobby', { user: client.id, text: data.text });
 *     }
 *
 *     @OnWebSocketClose()
 *     onClose(client: WebSocketClient) {
 *       this.ws.leaveAllRooms(client);
 *     }
 *   }
 *
 *   @Module({
 *     imports: [WebSocketModule.forRoot({ gateways: [ChatGateway] })],
 *   })
 *   class AppModule {}
 *
 * Runtime wiring:
 *
 *   // Bun
 *   const { websocket } = await bunWsAdapter.install(app, [ChatGateway]);
 *   Bun.serve({ port: 3000, fetch: app.fetch, websocket });
 *
 *   // Node
 *   const { handleUpgrade } = await nodeWsAdapter.bind([ChatGateway]);
 *   const wss = new WebSocketServer({ noServer: true });
 *   server.on('upgrade', (req, socket, head) => handleUpgrade(req, socket, head));
 */

export { WebSocketService, WEBSOCKET_SERVICE_TOKEN } from "./service.js";
export { WebSocketClientImpl } from "./client.js";
export { WebSocketModule } from "./module.js";
export { BunWsAdapter } from "./runtime/bun.js";
export { NodeWsAdapter } from "./runtime/node.js";
export type { NodeWsServer } from "./runtime/node.js";
export { detectRuntime, type WsRuntime } from "./runtime/index.js";
export {
	WebSocketGateway,
	OnWebSocketOpen,
	OnWebSocketMessage,
	OnWebSocketClose,
	OnWebSocketError,
	getGatewayPath,
	getLifecycleHandlers,
} from "./decorators.js";
export type {
	WebSocketClient,
	WebSocketConfig,
	WsClientData,
	WsLifecycle,
	WsLifecycleHandlers,
	WsMessage,
	WsReadyState,
	WsDecodeOptions,
} from "./types.js";
export type { WebSocketGatewayOptions, GatewayClass } from "./runtime/types.js";