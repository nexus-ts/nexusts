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
 *
 * Dual-mode: supports both TC39 standard (stage-3) and legacy
 * (experimentalDecorators) decorator modes.
 */

import type { WsLifecycle } from "./types.js";
import { safeDefineMeta, safeGetMeta } from "@nexusts/core/di/safe-reflect";

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
	return (target: any, context?: any): void => {
		// Standard decorator mode (TC39 stage-3)
		if (context?.kind === "class") {
			const proto = target.prototype;
			const handlers: Record<string, string> = {};
			for (const name of Object.getOwnPropertyNames(proto)) {
				if (name === "constructor") continue;
				const meta = safeGetMeta(LIFECYCLE_KEY, proto, name) as Record<string, string> | undefined;
				if (meta) Object.assign(handlers, meta);
			}
			proto[GATEWAY_KEY] = { path, handlers } satisfies GatewayMetadata;
			return;
		}
		// Legacy decorator mode (experimentalDecorators)
		const ctor = target as unknown as { prototype: object };
		const proto = ctor.prototype ?? (target as unknown as object);
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
	const meta: GatewayMetadata | undefined = t[GATEWAY_KEY] ?? t.prototype?.[GATEWAY_KEY];
	return meta?.path;
}

/* ------------------------------------------------------------------ *
 * Lifecycle method decorators
 * ------------------------------------------------------------------ */

function makeLifecycleDecorator(lifecycle: WsLifecycle) {
	return (
		_target: object,
		propertyKey: string | symbol,
		descriptorOrContext?: PropertyDescriptor | any,
	): any => {
		// Standard decorator mode (TC39 stage-3) — context is second arg
		if (propertyKey && typeof propertyKey === "object" && (propertyKey as any)?.kind === "method") {
			const ctx = propertyKey as any;
			const fn = _target;
			const meta: Record<string, string> = safeGetMeta(LIFECYCLE_KEY, fn, ctx.name) ?? {};
			meta[lifecycle] = String(ctx.name);
			safeDefineMeta(LIFECYCLE_KEY, meta, fn, ctx.name);
			if (!(fn as any)[LIFECYCLE_KEY]) (fn as any)[LIFECYCLE_KEY] = {};
			(fn as any)[LIFECYCLE_KEY][lifecycle] = String(ctx.name);
			return;
		}
		// Legacy decorator mode (experimentalDecorators)
		const descriptor = descriptorOrContext as PropertyDescriptor;
		const fn = descriptor?.value as Function & { [LIFECYCLE_KEY]?: Record<string, string> };
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
	// 1. Prefer the metadata stored by @WebSocketGateway (if non-empty).
	const meta: GatewayMetadata | undefined = t[GATEWAY_KEY] ?? t.prototype?.[GATEWAY_KEY];
	if (meta?.handlers && Object.keys(meta.handlers).length > 0) return meta.handlers;
	// 2. Walk the prototype and collect from method functions.
	const out: Record<string, string> = {};
	const proto = t.prototype ?? t;
	for (const name of Object.getOwnPropertyNames(proto)) {
		if (name === "constructor") continue;
		const m = (proto as any)[name];
		if (typeof m === "function") {
			// Check LIFECYCLE_KEY (stashed by decorator in both modes)
			if ((m as any)[LIFECYCLE_KEY]) {
				Object.assign(out, (m as any)[LIFECYCLE_KEY]);
			}
			// Also check safeGetMeta (standard mode)
			const fromMeta = safeGetMeta(LIFECYCLE_KEY, m, name) as Record<string, string> | undefined;
			if (fromMeta) Object.assign(out, fromMeta);
		}
	}
	return out;
}
