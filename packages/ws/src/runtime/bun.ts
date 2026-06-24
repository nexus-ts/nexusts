/**
 * Bun runtime adapter for `nexusjs/ws`.
 *
 * Uses Hono's `createBunWebSocket` to bridge Hono's `WSEvents`
 * to Bun's native WebSocket API.
 *
 * The user wires the returned `websocket` config into
 * `Bun.serve({ websocket, fetch: app.fetch })`. The framework
 * also calls `Bun.serve` automatically if `serve` is provided
 * to `WebSocketModule.forRoot({ serve: { port: 3000 } })`.
 */

import type { Hono } from "hono";
import { WebSocketClientImpl } from "../client.js";
import { getGatewayPath, getLifecycleHandlers } from "../decorators.js";
import type { WebSocketService } from "../service.js";
import type { GatewayClass, WebSocketGatewayOptions } from "./types.js";

/** Adapter that wires `@WebSocketGateway` classes to Bun's WebSocket. */
export class BunWsAdapter {
	readonly service: WebSocketService;
	private readonly options: WebSocketGatewayOptions;

	constructor(service: WebSocketService, options: WebSocketGatewayOptions = {}) {
		this.service = service;
		this.options = options;
	}

	/**
	 * Returns the `websocket` config object that the user passes to
	 * `Bun.serve({ websocket, fetch: app.fetch })`.
	 *
	 * The `upgradeWebSocket` middleware is also installed on the
	 * Hono app at every registered gateway's path.
	 */
	async install(app: Hono, gateways: GatewayClass[]): Promise<{ websocket: BunWebSocketConfig }> {
		// Lazy-import Hono's Bun adapter to keep Node builds from breaking.
		const { createBunWebSocket } = await import("hono/bun");
		const { upgradeWebSocket, websocket } = createBunWebSocket();

		for (const Gateway of gateways) {
			const path = getGatewayPath(Gateway.prototype);
			if (!path) {
				throw new Error(
					`WebSocket gateway ${Gateway.name} is missing @WebSocketGateway(path)`,
				);
			}

			const handlers = getLifecycleHandlers(Gateway.prototype);
			const opts = this.options;

			app.get(
				path,
				upgradeWebSocket((_c: unknown) => {
					// Build the gateway instance per-connection. (DI happens
					// via the service — the gateway pulls dependencies from
					// the container through the service.)
					const gateway = new Gateway();
					// Inject the service if the gateway has a setter / field.
					if (gateway && "setService" in (gateway as any) && typeof (gateway as any).setService === "function") {
						(gateway as any).setService(this.service);
					}
					return {
						onOpen: (_evt: Event, ws: any) => {
							const client = new WebSocketClientImpl(ws);
							this.service.register(client);
							(opts.onOpen ?? this.defaultOnOpen)(client);
							if (handlers.open) {
								Promise.resolve((gateway as any)[handlers.open](client)).catch(
									(err) => opts.onError?.(client, err as Error),
								);
							}
						},
						onMessage: (evt: MessageEvent, ws: any) => {
							const id = (ws as any).__clientId as string | undefined;
							const client = id ? this.service.getConnection(id) as WebSocketClientImpl | undefined : undefined;
							if (!client) return;
							const raw = evt.data;
							const data = this.parseMessage(raw);
							if (handlers.message) {
								Promise.resolve((gateway as any)[handlers.message](client, data)).catch(
									(err) => opts.onError?.(client, err as Error),
								);
							}
						},
						onClose: (evt: CloseEvent, ws: any) => {
							const id = (ws as any).__clientId as string | undefined;
							const client = id ? this.service.getConnection(id) as WebSocketClientImpl | undefined : undefined;
							if (!client) return;
							this.service.unregister(client);
							(opts.onClose ?? this.defaultOnClose)(client, evt.code, evt.reason);
							if (handlers.close) {
								Promise.resolve((gateway as any)[handlers.close](client, evt.code, evt.reason)).catch(
									(err) => opts.onError?.(client, err as Error),
								);
							}
						},
						onError: (evt: Event, ws: any) => {
							const id = (ws as any).__clientId as string | undefined;
							const client = id ? this.service.getConnection(id) as WebSocketClientImpl | undefined : undefined;
							if (!client) return;
							const err = (evt as any).error ?? new Error("WebSocket error");
							if (handlers.error) {
								Promise.resolve((gateway as any)[handlers.error](client, err)).catch(() => {});
							} else {
								opts.onError?.(client, err);
							}
						},
					};
				}),
			);
		}

		return { websocket };
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
		return raw;
	}

	private defaultOnOpen(_client: any): void {}
	private defaultOnClose(_client: any, _code: number, _reason: string): void {}
}


/** Bun's `websocket` config shape (subset we use). */
export interface BunWebSocketConfig {
	open?: (ws: any) => void;
	message?: (ws: any, message: any) => void;
	close?: (ws: any, code: number, reason: string) => void;
	error?: (ws: any, error: Error) => void;
	// ... other Bun WS options
}
