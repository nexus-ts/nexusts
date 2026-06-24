/**
 * `WebSocketClient` — the framework's per-connection wrapper.
 *
 * Hono's `WSContext` is a thin wrapper over the underlying
 * WebSocket. `WebSocketClient` adds:
 * - A unique connection id (UUID-ish).
 * - Room membership tracking.
 * - User-attached data (auth userId, custom keys).
 * - A stable `send()` API that JSON-encodes objects.
 *
 * Constructed by the runtime adapter (`runtime/bun.ts` or
 * `runtime/node.ts`) and passed to the gateway's lifecycle hooks.
 */

import { randomUUID } from "node:crypto";
import type { WsClientData, WsMessage, WsReadyState } from "./types.js";

/** Minimal interface that the wrapper needs from the underlying WSContext. */
export interface UnderlyingWs {
	send(data: string | ArrayBuffer | Uint8Array, options?: { compress?: boolean }): void;
	close(code?: number, reason?: string): void;
	readonly readyState: number;
	readonly url: string | null;
	readonly protocol: string | null;
}

export class WebSocketClientImpl {
	readonly id: string;
	readonly rooms: Set<string> = new Set();
	data: WsClientData = {};
	private _underlying: UnderlyingWs;

	constructor(underlying: UnderlyingWs, id?: string) {
		this.id = id ?? randomUUID();
		this._underlying = underlying;
	}

	get url(): string | null {
		return this._underlying.url;
	}

	get protocol(): string | null {
		return this._underlying.protocol;
	}

	get readyState(): WsReadyState {
		return this._underlying.readyState as WsReadyState;
	}

	send(data: WsMessage): void {
		if (typeof data === "object" && !(data instanceof ArrayBuffer) && !(data instanceof Uint8Array)) {
			this._underlying.send(JSON.stringify(data));
		} else {
			this._underlying.send(data as string | ArrayBuffer | Uint8Array);
		}
	}

	close(code?: number, reason?: string): void {
		this._underlying.close(code, reason);
	}

	setData(data: Partial<WsClientData>): void {
		Object.assign(this.data, data);
	}

	joinRoom(room: string): void {
		this.rooms.add(room);
	}

	leaveRoom(room: string): void {
		this.rooms.delete(room);
	}

	/** Internal: get the underlying WSContext (for the runtime layer). */
	raw(): UnderlyingWs {
		return this._underlying;
	}
}
