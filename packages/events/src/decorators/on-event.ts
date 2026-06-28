/**
 * `@OnEvent(pattern)` — register a method as an event listener.
 *
 * Mirrors `@nestjs/event-emitter`. Pair with
 * `EventModule.scanForListeners(instance, service)` at boot to wire
 * up all decorated methods.
 *
 * Usage:
 *   @Injectable()
 *   class UserListeners {
 *     @Inject(EventService.TOKEN) declare private events: EventService;
 *
 *     @OnEvent('user.created')
 *     async onUserCreated(payload: { userId: string; email: string }) {
 *       await this.sendWelcome(payload.email);
 *     }
 *
 *     @OnEvent('user.*', { priority: 1 })
 *     async onAnyUser(payload: any) {
 *       // logger
 *     }
 *
 *     @OnEvent('order.shipped', { once: true })
 *     async onFirstShip(payload: any) {
 *       // ...
 *     }
 *   }
 */

import type { EventService } from "../event.service.js";
import type { EventName, ListenerOptions, EventListener } from "../types.js";
import { safeGetMeta, safeDefineMeta } from "@nexusts/core/di/safe-reflect";

const ON_EVENT_META = "nexus:events:on-event";

interface StoredHook {
	method: string;
	pattern: EventName;
	options: ListenerOptions;
}

// ── Standard-mode helper ──────────────────────────────────────────
// In TC39 standard decorator mode (Bun 1.3+ default), `fn.constructor`
// is `Function`, not the class. To bridge metadata we store it directly
// on the prototype function using a Symbol key.
// ───────────────────────────────────────────────────────────────────

/** Symbol key used to stash StoredHook on the decorated function. */
const FN_HOOK_KEY = Symbol.for("nexus:events:fn:hook");

/** Collect hooks stored on prototype methods (standard mode path). */
function collectFnHooks(target: unknown): StoredHook[] {
	const cls = typeof target === "function" ? target : (target as any)?.constructor;
	if (!cls?.prototype) return [];
	const result: StoredHook[] = [];
	for (const name of Object.getOwnPropertyNames(cls.prototype)) {
		const fn = cls.prototype[name];
		if (typeof fn !== "function") continue;
		const hook = (fn as any)[FN_HOOK_KEY] as StoredHook | undefined;
		if (hook) result.push(hook);
	}
	return result;
}

/**
 * Mark a method as an event listener.
 *
 * Dual-mode: supports both TC39 standard ES decorators (Bun 1.3+ default)
 * and legacy experimentalDecorators.
 */
export function OnEvent(
	pattern: EventName,
	options: ListenerOptions = {},
): any {
	return function (this: any, targetOrFn: any, contextOrKey: any): void {
		// Standard (TC39) decorator mode
		if (contextOrKey?.kind === "method") {
			const fn = targetOrFn;
			const { name, metadata } = contextOrKey;

			const hooks: StoredHook[] = metadata[ON_EVENT_META] ?? [];
			hooks.push({ method: name, pattern, options });
			metadata[ON_EVENT_META] = hooks;

			// Stash the hook on the function itself so getOnEventHooks
			// can find it without going through the class constructor.
			(fn as any)[FN_HOOK_KEY] = { method: name, pattern, options };
			return;
		}

		// Legacy (experimentalDecorators) mode
		const target = targetOrFn;
		const propertyKey = contextOrKey;
		const descriptor = arguments[2];

		if (!descriptor || typeof descriptor.value !== "function") {
			throw new Error("@OnEvent can only decorate methods.");
		}
		const ctor = target.constructor as object;
		const hooks: StoredHook[] =
			(safeGetMeta(ON_EVENT_META, ctor) as StoredHook[] | undefined) ??
			[];
		hooks.push({ method: String(propertyKey), pattern, options });
		safeDefineMeta(ON_EVENT_META, hooks, ctor);
	};
}

/** Get the on-event hooks declared on a class. */
export function getOnEventHooks(target: unknown): StoredHook[] {
	// Standard mode: hooks are stashed on prototype functions.
	const fromFn = collectFnHooks(target);
	if (fromFn.length > 0) return fromFn;
	// Legacy mode: stored via safeDefineMeta on the constructor.
	const ctor =
		(target as { constructor?: object }).constructor ?? (target as object);
	return (safeGetMeta(ON_EVENT_META, ctor) as StoredHook[] | undefined) ?? [];
}

/**
 * Scan an instance for `@OnEvent` hooks and register them with the
 * `EventService`. Returns the assigned listener ids.
 */
export function scanForListeners(
	instance: object,
	service: EventService,
): string[] {
	const ids: string[] = [];
	for (const h of getOnEventHooks(instance)) {
		const fn = (instance as Record<string, unknown>)[h.method] as
			| EventListener
			| undefined;
		if (typeof fn !== "function") continue;
		const id = service.on(h.pattern, fn.bind(instance), {
			priority: h.options.priority,
			once: h.options.once,
			if: h.options.if as
				| ((payload: any) => boolean | Promise<boolean>)
				| undefined,
		});
		ids.push(id);
	}
	return ids;
}

// Re-export.
export type { EventService };
