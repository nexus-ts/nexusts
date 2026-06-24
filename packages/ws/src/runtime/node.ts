/**
 * Node runtime adapter for `nexusjs/ws`.
 *
 * Uses the `ws` package directly. The user provides a
 * `WebSocketServer` (or one is created automatically) and the
 * framework wires connection events to the gateway's lifecycle
 * handlers.
 *
 * The `ws` package is an optional peer dependency. Apps targeting
 * Bun don't need to install it.
 *
 * Usage (with auto-server):
 *
 *   const mod = WebSocketModule.forRoot({ path: '/ws' });
 *   const { app, wsServer } = await mod.mountNode(gateways);
 *   const server = createServer(app.fetch);
 *   server.listen(3000);
 *   wsServer.emit('connection', ws, req);  // via the framework
 *
 * Usage (with existing `http.Server`):
 *
 *   const server = http.createServer(app.fetch);
 *   const wss = new WebSocketServer({ server });
 *   mod.bindNode(wss, gateways);
 *   server.listen(3000);
 */

import type { Hono } from "hono";
import { WebSocketClientImpl } from "../client.js";
import { getGatewayPath, getLifecycleHandlers } from "../decorators.js";
import type { WebSocketService } from "../service.js";
import type { GatewayClass, WebSocketGatewayOptions } from "./types.js";

/** Adapter that wires `@WebSocketGateway` classes to a `ws.WebSocketServer`. */
export class NodeWsAdapter {
	readonly service: WebSocketService;
	private readonly options: WebSocketGatewayOptions;

	constructor(service: WebSocketService, options: WebSocketGatewayOptions = {}) {
		this.service = service;
		this.options = options;
	}

	/**
	 * Create a `WebSocketServer` that upgrades at the given gateway
	 * paths. The user is responsible for binding it to an HTTP
	 * server.
	 */
	async bind(gateways: GatewayClass[]): Promise<NodeWsServer> {
		// Lazy-import `ws` to keep Bun builds clean.
		let WS: typeof import("ws");
		try {
			WS = (await import("ws")).default ? await import("ws") : (await import("ws"));
			const WebSocketServer = (WS as any).WebSocketServer ?? (WS as any).Server ?? (WS as any).default?.WebSocketServer;
			if (!WebSocketServer) throw new Error("no WebSocketServer export");
		} catch (err) {
			throw new Error(
				"WebSocketModule.forRoot() on Node requires the `ws` package. " +
					"Install with: bun add ws",
			);
		}

		// Build the per-path upgrade handlers map.
		const handlers = new Map<string, (req: any) => boolean>();
		const gatewayInstances = new Map<string, GatewayClass>();
		for (const Gateway of gateways) {
			const path = getGatewayPath(Gateway.prototype);
			if (!path) continue;
			gatewayInstances.set(path, Gateway);
			handlers.set(path, (req: any) => {
				const url = new URL(req.url ?? "/", "http://localhost");
				return url.pathname === path;
			});
		}

		const wss = new (WS as any).WebSocketServer({ noServer: true });
		const opts = this.options;
		const service = this.service;

		wss.on("connection", (ws: any, req: any) => {
			const url = new URL(req.url ?? "/", "http://localhost");
			const path = url.pathname;
			const Gateway = gatewayInstances.get(path);
			if (!Gateway) {
				ws.close(1008, "Unknown path");
				return;
			}

			const gateway = new Gateway();
			if (gateway && "setService" in (gateway as any) && typeof (gateway as any).setService === "function") {
				(gateway as any).setService(service);
			}
			const client = new WebSocketClientImpl(adaptUnderlying(ws, req));
			service.register(client);
			(opts.onOpen ?? (() => {}))(client);

			const handlers = getLifecycleHandlers(Gateway.prototype);

			ws.on("message", (data: any) => {
				const parsed = this.parseMessage(data);
				if (handlers.message) {
					Promise.resolve((gateway as any)[handlers.message](client, parsed)).catch(
						(err) => opts.onError?.(client, err as Error),
					);
				}
			});

			ws.on("close", (code: number, reasonBuf: any) => {
				const reason = reasonBuf?.toString?.() ?? "";
				service.unregister(client);
				(opts.onClose ?? (() => {}))(client, code, reason);
				if (handlers.close) {
					Promise.resolve((gateway as any)[handlers.close](client, code, reason)).catch(
						(err) => opts.onError?.(client, err as Error),
					);
				}
			});

			ws.on("error", (err: Error) => {
				if (handlers.error) {
					Promise.resolve((gateway as any)[handlers.error](client, err)).catch(() => {});
				} else {
					opts.onError?.(client, err);
				}
			});
		});

		return {
			handleUpgrade(req: any, socket: any, head: any, callback?: (ws: any) => void) {
				const url = new URL(req.url ?? "/", "http://localhost");
				const handler = handlers.get(url.pathname);
				if (!handler || !handler(req)) {
					socket.write("HTTP/1.1 404 Not Found\r\n\r\n");
					socket.destroy();
					return;
				}
				wss.handleUpgrade(req, socket, head, callback ?? (() => {}));
			},
		};
	}

	private parseMessage(raw: unknown): unknown {
		if (this.options.json === false) return raw;
		if (typeof raw === "string") {
			try {
				return JSON.parse(raw);
			} catch {
				return raw;
			}
		}
		if (raw && typeof raw === "object" && "toString" in raw) {
			// ws sometimes gives Buffer
			const s = (raw as any).toString();
			try {
				return JSON.parse(s);
			} catch {
				return s;
			}
		}
		return raw;
	}
}

/** Adapts a `ws.WebSocket` to the `UnderlyingWs` interface. */
function adaptUnderlying(ws: any, req: any) {
	return {
		send(data: string | ArrayBuffer | Uint8Array, _options?: { compress?: boolean }) {
			// ws accepts string | Buffer | ArrayBuffer | Buffer[]
			ws.send(data as any);
		},
		close(code?: number, reason?: string) {
			ws.close(code, reason);
		},
		get readyState() {
			return ws.readyState;
		},
		get url() {
			return req.url ?? null;
		},
		get protocol() {
			return ws.protocol ?? null;
		},
	};
}

/** A handle to attach the WS upgrade to a Node HTTP server. */
export interface NodeWsServer {
	handleUpgrade(req: any, socket: any, head: any, callback?: (ws: any) => void): void;
}
