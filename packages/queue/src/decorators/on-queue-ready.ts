/**
 * `@OnQueueReady()` — lifecycle hook that runs once when the
 * application has booted and the queue service is ready.
 *
 * Use this to register workers without coupling to the `Application`
 * lifecycle directly.
 *
 * Usage:
 *   class EmailWorker {
 *     constructor(@Inject(QueueService.TOKEN) private queue: QueueService) {}
 *
 *     @OnQueueReady()
 *     async register() {
 *       await this.queue.process('send-email', this.handle);
 *     }
 *
 *     handle = async (data: { to: string }) => { ... };
 *   }
 *
 *   @Module({
 *     providers: [EmailWorker],
 *   })
 *   class WorkerModule {}
 */

import type { QueueService } from "../queue.service.js";
import { safeGetMeta, safeDefineMeta, safeHasMeta } from "@nexusts/core/di/safe-reflect";

/**
 * Method decorator. The decorated method is invoked once with no
 * arguments after the application has booted. Pair it with
 * `QueueService.start()` — typically called by `Application.bootstrap`.
 */
export function OnQueueReady(): MethodDecorator {
	return (target, propertyKey, descriptor) => {
		if (!descriptor || typeof descriptor.value !== "function") {
			throw new Error("@OnQueueReady can only decorate methods.");
		}
		// Register the hook in a per-class metadata slot. The bootstrap
		// code reads METADATA_KEY.QUEUE_READY_HOOKS and calls each.
		const ctor = target.constructor as object;
		const hooks: Array<string | symbol> =
			(safeGetMeta("nexus:queue:ready-hooks", ctor) as
				| Array<string | symbol>
				| undefined) ?? [];
		hooks.push(propertyKey!);
		safeDefineMeta("nexus:queue:ready-hooks", hooks, ctor);
	};
}

/**
 * Get the queue-ready hooks declared on a class.
 */
export function getQueueReadyHooks(target: unknown): Array<string | symbol> {
	const ctor =
		(target as { constructor?: object }).constructor ?? (target as object);
	return (
		(safeGetMeta("nexus:queue:ready-hooks", ctor) as
			| Array<string | symbol>
			| undefined) ?? []
	);
}

/**
 * Helper — invoke all `@OnQueueReady` hooks on an instance.
 * Pair this with `QueueService.start()` for a complete bootstrap.
 */
export async function invokeQueueReadyHooks(instance: object): Promise<void> {
	const hooks = getQueueReadyHooks(instance);
	for (const key of hooks) {
		const fn = (instance as Record<string | symbol, unknown>)[key] as
			| ((...args: unknown[]) => Promise<void> | void)
			| undefined;
		if (typeof fn === "function") {
			await fn.call(instance);
		}
	}
}

// Re-export for convenience.
export type { QueueService };
