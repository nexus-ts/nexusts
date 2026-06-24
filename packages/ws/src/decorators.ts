/**
 * WebSocket decorators.
 *
 * Two layers:
 * 1. `@WebSocketGateway(path)` — class-level. Marks the class as a
 *    WebSocket gateway. The framework scans for these and registers
 *    a Hono `upgradeWebSocket` handler at `<path>`.
 * 2. `@OnWebSocketOpen()`, `@OnWebSocketMessage()`, etc. —
 *    method-level. Wire lifecycle events to specific methods on
 *    the gateway class.
 *
 * Implementation note: lifecycle decorators store metadata on the
 * method function itself (via a `Symbol.for` key). The class-level
 * `@WebSocketGateway` walks the prototype to collect them. This
 * pattern is robust regardless of the target passed by the TS
 * decorator transform.
 */

import type { WsLifecycle } from "./types.js";

const GATEWAY_KEY = Symbol.for("nexus:ws:gateway");
const LIFECYCLE_KEY = Symbol.for("nexus:ws:lifecycle");

interface GatewayMetadata {
	path: string;
	handlers: Record<string, string>;
}

/**
 * Mark a class as a WebSocket gateway. `path` is the URL path the
 * gateway listens on (e.g. `/ws`, `/chat`).
 *
 *   @Injectable()
 *   @WebSocketGateway('/ws')
 *   class ChatGateway { ... }
 */
export function WebSocketGateway(path: string): ClassDecorator {
	return (target: Function) => {
		const ctor = target as unknown as { prototype: object };
		const proto = ctor.prototype ?? (target as unknown as object);
		// Collect lifecycle handlers from method-level decorators.
		const handlers: Record<string, string> = {};
		for (const name of Object.getOwnPropertyNames(proto)) {
			if (name === "constructor") continue;
			const m = (proto as any)[name];
			if (typeof m === "function" && (m as any)[LIFECYCLE_KEY]) {
				Object.assign(handlers, (m as any)[LIFECYCLE_KEY]);
			}
		}
		(proto as any)[GATEWAY_KEY] = { path, handlers } satisfies GatewayMetadata;
	};
}

/** Read the gateway path. Internal — used by the framework. */
export function getGatewayPath(target: object): string | undefined {
	const t = target as any;
	const meta: GatewayMetadata | undefined = t[GATEWAY_KEY];
	return meta?.path;
}

/* ------------------------------------------------------------------ *
 * Lifecycle method decorators
 * ------------------------------------------------------------------ */

function makeLifecycleDecorator(lifecycle: WsLifecycle) {
	return (
		_target: object,
		propertyKey: string | symbol,
		descriptor: PropertyDescriptor,
	) => {
		const fn = descriptor.value as Function & { [LIFECYCLE_KEY]?: Record<string, string> };
		if (typeof fn !== "function") return descriptor;
		fn[LIFECYCLE_KEY] = fn[LIFECYCLE_KEY] ?? {};
		fn[LIFECYCLE_KEY][lifecycle] = String(propertyKey);
		return descriptor;
	};
}

/** Method decorator factory: bind to `onOpen` lifecycle. */
export function OnWebSocketOpen(): MethodDecorator {
	return makeLifecycleDecorator("open");
}
/** Method decorator factory: bind to `onMessage` lifecycle. */
export function OnWebSocketMessage(): MethodDecorator {
	return makeLifecycleDecorator("message");
}
/** Method decorator factory: bind to `onClose` lifecycle. */
export function OnWebSocketClose(): MethodDecorator {
	return makeLifecycleDecorator("close");
}
/** Method decorator factory: bind to `onError` lifecycle. */
export function OnWebSocketError(): MethodDecorator {
	return makeLifecycleDecorator("error");
}

/** Read the bound lifecycle methods. Internal — used by the framework. */
export function getLifecycleHandlers(target: object): {
	open?: string;
	message?: string;
	close?: string;
	error?: string;
} {
	const t = target as any;
	// 1. Prefer the metadata stored by @WebSocketGateway.
	if (t[GATEWAY_KEY]?.handlers) return t[GATEWAY_KEY].handlers;
	// 2. Walk the prototype and collect from method functions.
	const out: Record<string, string> = {};
	const proto = t.prototype ?? t;
	for (const name of Object.getOwnPropertyNames(proto)) {
		if (name === "constructor") continue;
		const m = (proto as any)[name];
		if (typeof m === "function" && (m as any)[LIFECYCLE_KEY]) {
			Object.assign(out, (m as any)[LIFECYCLE_KEY]);
		}
	}
	return out;
}
