/**
 * `@Cron(expression)` — schedule a method as a cron task.
 *
 * Mirrors `@nestjs/schedule`'s decorator. The decorated method runs
 * on the cron schedule; pair it with `ScheduleModule.scanForSchedulers`
 * to register at boot.
 *
 * Usage:
 *   @Injectable()
 *   class CleanupWorker {
 *     constructor(@Inject(ScheduleService.TOKEN) private schedule: ScheduleService) {}
 *
 *     @Cron('0 * * * *')                     // every hour
 *     async hourly() {
 *       // ...
 *     }
 *
 *     @Cron('@daily', { timezone: 'UTC' })
 *     async dailyDigest() {
 *       // ...
 *     }
 *   }
 *
 *   // src/app/main.ts
 *   const app = new Application(AppModule);
 *   const schedule = app.container.resolve(ScheduleService);
 *   for (const instance of getInjectables(app)) {
 *     await schedule.scanForSchedulers(instance);
 *   }
 *   schedule.start();
 */

import type { ScheduleService } from "../schedule.service.js";
import type { CronExpression, CronOptions, ScheduleHandler } from "../types.js";
import { safeGetMeta, safeDefineMeta, safeHasMeta } from "@nexusts/core/di/safe-reflect";

const CRON_META = "nexus:schedule:cron";
const INTERVAL_META = "nexus:schedule:interval";
const TIMEOUT_META = "nexus:schedule:timeout";

/**
 * Schedule the decorated method as a cron task.
 */
export function Cron(
	expression: CronExpression,
	options: CronOptions = {},
): MethodDecorator {
	return (target, propertyKey, descriptor) => {
		if (!descriptor || typeof descriptor.value !== "function") {
			throw new Error("@Cron can only decorate methods.");
		}
		const ctor = target.constructor as object;
		const hooks: Array<{
			method: string;
			expression: CronExpression;
			options: CronOptions;
		}> =
			(safeGetMeta(CRON_META, ctor) as
				| Array<{
						method: string;
						expression: CronExpression;
						options: CronOptions;
				  }>
				| undefined) ?? [];
		hooks.push({ method: String(propertyKey), expression, options });
		safeDefineMeta(CRON_META, hooks, ctor);
	};
}

/**
 * Schedule the decorated method to run every `milliseconds`.
 */
export function Interval(milliseconds: number, name?: string): MethodDecorator {
	return (target, propertyKey, descriptor) => {
		if (!descriptor || typeof descriptor.value !== "function") {
			throw new Error("@Interval can only decorate methods.");
		}
		const ctor = target.constructor as object;
		const hooks: Array<{
			method: string;
			milliseconds: number;
			name?: string;
		}> =
			(safeGetMeta(INTERVAL_META, ctor) as
				| Array<{ method: string; milliseconds: number; name?: string }>
				| undefined) ?? [];
		hooks.push({ method: String(propertyKey), milliseconds, name });
		safeDefineMeta(INTERVAL_META, hooks, ctor);
	};
}

/**
 * Schedule the decorated method to run once after `milliseconds`.
 */
export function Timeout(milliseconds: number, name?: string): MethodDecorator {
	return (target, propertyKey, descriptor) => {
		if (!descriptor || typeof descriptor.value !== "function") {
			throw new Error("@Timeout can only decorate methods.");
		}
		const ctor = target.constructor as object;
		const hooks: Array<{
			method: string;
			milliseconds: number;
			name?: string;
		}> =
			(safeGetMeta(TIMEOUT_META, ctor) as
				| Array<{ method: string; milliseconds: number; name?: string }>
				| undefined) ?? [];
		hooks.push({ method: String(propertyKey), milliseconds, name });
		safeDefineMeta(TIMEOUT_META, hooks, ctor);
	};
}

/**
 * Get the cron hooks declared on a class.
 */
export function getCronHooks(
	target: unknown,
): Array<{ method: string; expression: CronExpression; options: CronOptions }> {
	const ctor =
		(target as { constructor?: object }).constructor ?? (target as object);
	return (
		(safeGetMeta(CRON_META, ctor) as
			| Array<{
					method: string;
					expression: CronExpression;
					options: CronOptions;
			  }>
			| undefined) ?? []
	);
}

export function getIntervalHooks(
	target: unknown,
): Array<{ method: string; milliseconds: number; name?: string }> {
	const ctor =
		(target as { constructor?: object }).constructor ?? (target as object);
	return (
		(safeGetMeta(INTERVAL_META, ctor) as
			| Array<{ method: string; milliseconds: number; name?: string }>
			| undefined) ?? []
	);
}

export function getTimeoutHooks(
	target: unknown,
): Array<{ method: string; milliseconds: number; name?: string }> {
	const ctor =
		(target as { constructor?: object }).constructor ?? (target as object);
	return (
		(safeGetMeta(TIMEOUT_META, ctor) as
			| Array<{ method: string; milliseconds: number; name?: string }>
			| undefined) ?? []
	);
}

/**
 * Scan an instance for `@Cron` / `@Interval` / `@Timeout` hooks and
 * register them with the `ScheduleService`.
 */
export async function scanForSchedulers(
	instance: object,
	service: ScheduleService,
): Promise<string[]> {
	const ids: string[] = [];

	for (const h of getCronHooks(instance)) {
		const fn = (instance as Record<string, unknown>)[h.method] as
			| ScheduleHandler
			| undefined;
		if (typeof fn !== "function") continue;
		const id = service.addCron(h.expression, fn.bind(instance), {
			...h.options,
			name: h.options.name ?? `${instance.constructor.name}.${h.method}`,
		});
		ids.push(id);
	}

	for (const h of getIntervalHooks(instance)) {
		const fn = (instance as Record<string, unknown>)[h.method] as
			| ScheduleHandler
			| undefined;
		if (typeof fn !== "function") continue;
		const id = service.addInterval(
			h.milliseconds,
			fn.bind(instance),
			h.name ?? `${instance.constructor.name}.${h.method}`,
		);
		ids.push(id);
	}

	for (const h of getTimeoutHooks(instance)) {
		const fn = (instance as Record<string, unknown>)[h.method] as
			| ScheduleHandler
			| undefined;
		if (typeof fn !== "function") continue;
		const id = service.addTimeout(
			h.milliseconds,
			fn.bind(instance),
			h.name ?? `${instance.constructor.name}.${h.method}`,
		);
		ids.push(id);
	}

	return ids;
}

// Re-export for convenience.
export type { ScheduleService };
