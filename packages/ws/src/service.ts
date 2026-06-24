/**
 * `WebSocketService` — connection registry, rooms, broadcasting.
 *
 * The service is the central state for all open WebSocket
 * connections. It is registered in the DI container as a singleton
 * and consumed by `@WebSocketGateway` classes.
 *
 * Features:
 * - **Connection registry** — `getConnections()` returns all
 *   currently-open clients.
 * - **Per-connection lookup** — `getConnection(id)`.
 * - **Rooms** — `joinRoom`, `leaveRoom`, `broadcastToRoom`. Rooms
 *   are auto-cleaned when empty.
 * - **Broadcast** — `broadcast(data)` sends to all open clients.
 * - **Targeted send** — `sendTo(id, data)`.
 * - **Lifecycle tracking** — `onConnect` / `onDisconnect` callbacks
 *   for metrics, audit logging, etc.
 */

import type { WebSocketClientImpl } from "./client.js";
import type { WebSocketClient, WsClientData, WsMessage } from "./types.js";

export const WEBSOCKET_SERVICE_TOKEN = Symbol.for("nexus:WebSocketService");

export class WebSocketService {
	/** id -> client */
	private clients = new Map<string, WebSocketClientImpl>();
	/** room -> Set<id> */
	private rooms = new Map<string, Set<string>>();
	/** Lifecycle callbacks. */
	private onConnectListeners: Array<(c: WebSocketClient) => void> = [];
	private onDisconnectListeners: Array<(c: WebSocketClient) => void> = [];

	/* ---------------- registry ---------------- */

	/** Register a new client. Returns the framework id. */
	register(client: WebSocketClientImpl): string {
		this.clients.set(client.id, client);
		for (const cb of this.onConnectListeners) {
			try {
				cb(client);
			} catch {
				/* ignore listener errors */
			}
		}
		return client.id;
	}

	/** Remove a client from the registry. Auto-cleans empty rooms. */
	unregister(client: WebSocketClientImpl): void {
		this.clients.delete(client.id);
		for (const room of client.rooms) {
			const set = this.rooms.get(room);
			if (set) {
				set.delete(client.id);
				if (set.size === 0) this.rooms.delete(room);
			}
		}
		for (const cb of this.onDisconnectListeners) {
			try {
				cb(client);
			} catch {
				/* ignore listener errors */
			}
		}
	}

	/** Number of currently-open connections. */
	get size(): number {
		return this.clients.size;
	}

	/** Get all open connections. */
	getConnections(): WebSocketClient[] {
		return [...this.clients.values()];
	}

	/** Get a connection by id. */
	getConnection(id: string): WebSocketClient | undefined {
		return this.clients.get(id);
	}

	/* ---------------- rooms ---------------- */

	/** Join a room. */
	joinRoom(client: WebSocketClient, room: string): void {
		const impl = client as WebSocketClientImpl;
		impl.joinRoom(room);
		let set = this.rooms.get(room);
		if (!set) {
			set = new Set();
			this.rooms.set(room, set);
		}
		set.add(client.id);
	}

	/** Leave a room. */
	leaveRoom(client: WebSocketClient, room: string): void {
		const impl = client as WebSocketClientImpl;
		impl.leaveRoom(room);
		const set = this.rooms.get(room);
		if (set) {
			set.delete(client.id);
			if (set.size === 0) this.rooms.delete(room);
		}
	}

	/** Leave all rooms. */
	leaveAllRooms(client: WebSocketClient): void {
		const impl = client as WebSocketClientImpl;
		for (const room of impl.rooms) {
			const set = this.rooms.get(room);
			if (set) {
				set.delete(client.id);
				if (set.size === 0) this.rooms.delete(room);
			}
		}
		impl.rooms.clear();
	}

	/** All client ids in a room. */
	getRoomMembers(room: string): WebSocketClient[] {
		const ids = this.rooms.get(room);
		if (!ids) return [];
		const out: WebSocketClient[] = [];
		for (const id of ids) {
			const c = this.clients.get(id);
			if (c) out.push(c);
		}
		return out;
	}

	/** All room names currently in use. */
	getRooms(): string[] {
		return [...this.rooms.keys()];
	}

	/** Whether a room has any members. */
	hasRoom(room: string): boolean {
		const set = this.rooms.get(room);
		return !!set && set.size > 0;
	}

	/* ---------------- broadcast ---------------- */

	/** Send to all open clients. */
	broadcast(data: WsMessage, filter?: (client: WebSocketClient) => boolean): void {
		for (const client of this.clients.values()) {
			if (filter && !filter(client)) continue;
			try {
				client.send(data);
			} catch {
				/* ignore send errors */
			}
		}
	}

	/** Send to all clients in a room. */
	broadcastToRoom(room: string, data: WsMessage): void {
		const ids = this.rooms.get(room);
		if (!ids) return;
		for (const id of ids) {
			const client = this.clients.get(id);
			if (!client) continue;
			try {
				client.send(data);
			} catch {
				/* ignore send errors */
			}
		}
	}

	/** Send to a single client by id. */
	sendTo(id: string, data: WsMessage): boolean {
		const client = this.clients.get(id);
		if (!client) return false;
		try {
			client.send(data);
			return true;
		} catch {
			return false;
		}
	}

	/** Close all connections (graceful shutdown). */
	closeAll(code = 1001, reason = "Server shutting down"): void {
		for (const client of this.clients.values()) {
			try {
				client.close(code, reason);
			} catch {
				/* ignore */
			}
		}
	}

	/* ---------------- lifecycle listeners ---------------- */

	/** Register a callback for new connections. */
	onConnect(cb: (client: WebSocketClient) => void): void {
		this.onConnectListeners.push(cb);
	}

	/** Register a callback for closed connections. */
	onDisconnect(cb: (client: WebSocketClient) => void): void {
		this.onDisconnectListeners.push(cb);
	}
}
