/**
 * Public types for `nexusjs/ws`.
 *
 * `nexusjs/ws` is a thin abstraction over Hono's runtime-specific
 * WebSocket support. The same `@WebSocketGateway` / `@OnWebSocketMessage`
 * pattern works on Bun (via `hono/adapter/bun/websocket`) and Node
 * (via the `ws` package).
 *
 * Cloudflare Workers WebSockets require a Durable Objects context
 * and are out of scope for v0.5 — see `docs/user-guide/ws.md` for
 * the integration recipe.
 */

/* ------------------------------------------------------------------ *
 * WebSocket readiness states
 * ------------------------------------------------------------------ */

/** Mirrors the standard `WebSocket.readyState` enum. */
export enum WsReadyState {
	CONNECTING = 0,
	OPEN = 1,
	CLOSING = 2,
	CLOSED = 3,
}

/* ------------------------------------------------------------------ *
 * Message types
 * ------------------------------------------------------------------ */

/** A message that can be sent or received. */
export type WsMessage = string | ArrayBuffer | Uint8Array | object;

/** Decode options. */
export interface WsDecodeOptions {
	/** Parse JSON strings automatically. Default: true. */
	json?: boolean;
}

/* ------------------------------------------------------------------ *
 * Per-connection client wrapper
 * ------------------------------------------------------------------ */

/** User-attached arbitrary data on a connection. */
export interface WsClientData {
	/** Optional authenticated user id. */
	userId?: string | number;
	/** Free-form key-value bag for app use. */
	[key: string]: unknown;
}

/** A wrapper around the underlying WebSocket that adds identity, rooms, and data. */
export interface WebSocketClient {
	/** Unique connection id (assigned by the framework). */
	readonly id: string;
	/** Rooms this client has joined. */
	readonly rooms: ReadonlySet<string>;
	/** User-attached data. */
	readonly data: WsClientData;
	/** The Hono URL the client connected to. */
	readonly url: string | null;
	/** Optional sub-protocol negotiated. */
	readonly protocol: string | null;
	/** Current readyState. */
	readonly readyState: WsReadyState;

	/** Send a message. Plain objects are JSON-encoded. */
	send(data: WsMessage): void;
	/** Close the connection. */
	close(code?: number, reason?: string): void;
	/** Attach arbitrary data to the client (mutation is reflected on `client.data`). */
	setData(data: Partial<WsClientData>): void;
	/** Join a room. */
	joinRoom(room: string): void;
	/** Leave a room. */
	leaveRoom(room: string): void;
}

/* ------------------------------------------------------------------ *
 * Service configuration
 * ------------------------------------------------------------------ */

export interface WebSocketConfig {
	/** Default mount path prefix. Default: "/ws". */
	path?: string;
	/** Whether to auto-parse JSON messages. Default: true. */
	json?: boolean;
	/** Heartbeat interval in seconds. 0 = disabled. Default: 30. */
	heartbeatSeconds?: number;
	/** How to handle unknown runtimes. Default: "throw". */
	onUnknownRuntime?: "throw" | "noop";
}

/* ------------------------------------------------------------------ *
 * Gateway metadata
 * ------------------------------------------------------------------ */

export type WsLifecycle = "open" | "message" | "close" | "error";

/** The method handlers on a gateway. */
export interface WsLifecycleHandlers {
	open?: (client: WebSocketClient) => void | Promise<void>;
	message?: (client: WebSocketClient, data: unknown) => void | Promise<void>;
	close?: (client: WebSocketClient, code: number, reason: string) => void | Promise<void>;
	error?: (client: WebSocketClient, error: Error) => void | Promise<void>;
}
