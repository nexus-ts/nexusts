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
 *     constructor(@Inject(EventService.TOKEN) private events: EventService) {}
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

import "reflect-metadata";
import type { EventService } from "../event.service.js";
import type { EventListener, EventName, ListenerOptions } from "../types.js";

const ON_EVENT_META = "nexus:events:on-event";

interface StoredHook {
	method: string;
	pattern: EventName;
	options: ListenerOptions;
}

/**
 * Mark a method as an event listener.
 */
export function OnEvent(
	pattern: EventName,
	options: ListenerOptions = {},
): MethodDecorator {
	return (target, propertyKey, descriptor) => {
		if (!descriptor || typeof descriptor.value !== "function") {
			throw new Error("@OnEvent can only decorate methods.");
		}
		const ctor = target.constructor as object;
		const hooks: StoredHook[] =
			(Reflect.getMetadata(ON_EVENT_META, ctor) as StoredHook[] | undefined) ??
			[];
		hooks.push({ method: String(propertyKey), pattern, options });
		Reflect.defineMetadata(ON_EVENT_META, hooks, ctor);
	};
}

/** Get the on-event hooks declared on a class. */
export function getOnEventHooks(target: unknown): StoredHook[] {
	const ctor =
		(target as { constructor?: object }).constructor ?? (target as object);
	return (
		(Reflect.getMetadata(ON_EVENT_META, ctor) as StoredHook[] | undefined) ?? []
	);
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
