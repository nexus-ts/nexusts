/**
 * Universal Interceptors.
 *
 * Wrap handler execution to add cross-cutting behavior like logging,
 * timing, transformation, and error handling. Apply with `@UseInterceptors()`
 * on controllers or individual routes, or globally via `ApplicationOptions`.
 *
 * Execution order: middleware → guards → interceptors(handler) → response
 *
 * @example
 * ```ts
 * // Built-in logging interceptor
 * @Controller("/api")
 * @UseInterceptors(LoggingInterceptor)
 * class ApiController { ... }
 *
 * // Custom interceptor instance
 * @Get("/slow")
 * @UseInterceptors(new TimeoutInterceptor(5000))
 * slowRoute() { ... }
 * ```
 */
import "reflect-metadata";
import {
	CONTROLLER_INTERCEPTORS_METADATA,
	INTERCEPTORS_METADATA,
} from "../constants.js";

// ============================================================================
// Execution Context
// ============================================================================

/**
 * Interceptor execution context.
 * Provides access to the handler and request metadata.
 */
export interface ExecutionContext {
	readonly type: "http" | "ws" | "queue";
	getHandler(): string;
	getController(): string;
}

/**
 * HTTP-specific execution context.
 */
export interface HttpExecutionContext extends ExecutionContext {
	readonly type: "http";
	getRequest(): Request;
}

/**
 * WebSocket-specific execution context.
 */
export interface WsExecutionContext extends ExecutionContext {
	readonly type: "ws";
	getPattern(): string;
}

/**
 * Queue-specific execution context.
 */
export interface QueueExecutionContext extends ExecutionContext {
	readonly type: "queue";
	getPattern(): string;
}

export function isHttpContext(
	ctx: ExecutionContext,
): ctx is HttpExecutionContext {
	return ctx.type === "http";
}

export function isWsContext(
	ctx: ExecutionContext,
): ctx is WsExecutionContext {
	return ctx.type === "ws";
}

export function isQueueContext(
	ctx: ExecutionContext,
): ctx is QueueExecutionContext {
	return ctx.type === "queue";
}

// ============================================================================
// Interceptor Interface
// ============================================================================

/**
 * Interceptor interface.
 *
 * Implement `intercept(context, next)` to wrap handler execution.
 * Must call and return `await next()` to pass control to the next
 * interceptor or the actual handler.
 */
export interface Interceptor {
	intercept(
		context: ExecutionContext,
		next: () => Promise<unknown>,
	): Promise<unknown>;
}

/**
 * Resolved interceptor function type.
 * A resolved interceptor is ready to be composed without instantiation.
 */
export type ResolvedInterceptor = (
	context: ExecutionContext,
	next: () => Promise<unknown>,
) => Promise<unknown>;

// ============================================================================
// HTTP Execution Context Implementation
// ============================================================================

export class HttpExecutionContextImpl implements HttpExecutionContext {
	readonly type = "http" as const;

	constructor(
		private readonly request: Request,
		private readonly handlerName: string,
		private readonly controllerName: string,
	) {}

	getRequest(): Request {
		return this.request;
	}
	getHandler(): string {
		return this.handlerName;
	}
	getController(): string {
		return this.controllerName;
	}
}

// ============================================================================
// Interceptor Composition
// ============================================================================

/**
 * Compose interceptors into an onion chain around the handler.
 * First interceptor in the list wraps outermost.
 */
export function composeInterceptors(
	interceptors: ResolvedInterceptor[],
	context: ExecutionContext,
	handler: () => Promise<unknown>,
): () => Promise<unknown> {
	let current = handler;

	for (let i = interceptors.length - 1; i >= 0; i--) {
		const interceptor = interceptors[i];
		const next = current;
		current = () => interceptor(context, next);
	}

	return current;
}

// ============================================================================
// Factory
// ============================================================================

/**
 * Create a custom interceptor from a plain function.
 * Returns a class constructor compatible with `@UseInterceptors()`.
 *
 * @example
 * ```ts
 * const TimingInterceptor = createInterceptor(async (ctx, next) => {
 *   const start = Date.now();
 *   const result = await next();
 *   console.log(`Took ${Date.now() - start}ms`);
 *   return result;
 * });
 *
 * @UseInterceptors(TimingInterceptor)
 * @Get("/data")
 * getData() { ... }
 * ```
 */
export function createInterceptor(
	fn: (
		context: ExecutionContext,
		next: () => Promise<unknown>,
	) => Promise<unknown>,
): new () => Interceptor {
	return class implements Interceptor {
		async intercept(
			context: ExecutionContext,
			next: () => Promise<unknown>,
		): Promise<unknown> {
			return fn(context, next);
		}
	};
}

// ============================================================================
// @UseInterceptors decorator
// ============================================================================

/**
 * Interceptors decorator — can be applied to both controllers (class)
 * and individual routes (method).
 *
 * Pass interceptor **class constructors** (resolved via DI at startup)
 * or **instances** (used as-is, e.g. `new TimeoutInterceptor(5000)`).
 *
 * Interceptors wrap the handler in onion order: global → controller → route.
 * The first interceptor in the list wraps outermost.
 *
 * @example Class-level (all routes)
 * ```ts
 * @Controller("/api")
 * @UseInterceptors(LoggingInterceptor)
 * class ApiController { ... }
 * ```
 *
 * @example Method-level (single route)
 * ```ts
 * @Get("/slow")
 * @UseInterceptors(new TimeoutInterceptor(5000))
 * slowRoute() { ... }
 * ```
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function UseInterceptors(...interceptors: (Function | Interceptor)[]): any {
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	return function useInterceptorsDecorator(...args: any[]): any {
		// ---- Class decorator ----
		if (args.length === 1 && typeof args[0] === "function") {
			const target = args[0] as Function;
			const existing: (Function | Interceptor)[] =
				Reflect.getMetadata(CONTROLLER_INTERCEPTORS_METADATA, target) ?? [];
			Reflect.defineMetadata(
				CONTROLLER_INTERCEPTORS_METADATA,
				[...existing, ...interceptors],
				target,
			);
			return target;
		}

		// ---- Method decorator ----
		const [target, propertyKey] = args as [object, string | symbol, PropertyDescriptor];
		const existingInterceptors: (Function | Interceptor)[] =
			Reflect.getMetadata(INTERCEPTORS_METADATA, target, propertyKey) ?? [];
		Reflect.defineMetadata(
			INTERCEPTORS_METADATA,
			[...existingInterceptors, ...interceptors],
			target,
			propertyKey,
		);
		return args[2];
	};
}

// ============================================================================
// Metadata accessors
// ============================================================================

/** Get controller-level interceptor classes/instances. */
export function getControllerInterceptors(
	target: Function,
): (Function | Interceptor)[] {
	return (
		Reflect.getMetadata(CONTROLLER_INTERCEPTORS_METADATA, target) ?? []
	);
}

/** Get route-level interceptor classes/instances. */
export function getRouteInterceptors(
	target: object,
	propertyKey: string | symbol,
): (Function | Interceptor)[] {
	return (
		Reflect.getMetadata(INTERCEPTORS_METADATA, target, propertyKey) ?? []
	);
}

// ============================================================================
// Built-in Interceptors
// ============================================================================

/**
 * Interceptor that logs incoming requests and responses with timing.
 *
 * @example
 * ```ts
 * @UseInterceptors(LoggingInterceptor)
 * @Controller("/api")
 * class ApiController { ... }
 * ```
 */
export class LoggingInterceptor implements Interceptor {
	async intercept(
		context: ExecutionContext,
		next: () => Promise<unknown>,
	): Promise<unknown> {
		const label = isHttpContext(context)
			? `${context.getRequest().method} ${new URL(context.getRequest().url).pathname}`
			: `${context.getController()}.${context.getHandler()}`;

		const start = performance.now();
		console.log(`[nexus] Incoming ${label}`);

		try {
			const result = await next();
			const duration = Math.round(performance.now() - start);
			if (result instanceof Response) {
				console.log(
					`[nexus] Completed ${label} ${result.status} ${duration}ms`,
				);
			} else {
				console.log(`[nexus] Completed ${label} ${duration}ms`);
			}
			return result;
		} catch (error) {
			const duration = Math.round(performance.now() - start);
			console.error(
				`[nexus] Failed ${label} ${duration}ms`,
				error instanceof Error ? error.message : String(error),
			);
			throw error;
		}
	}
}

/**
 * Interceptor that aborts handler execution after a specified timeout.
 * Pass as an **instance** since it requires a constructor argument.
 *
 * @example
 * ```ts
 * @Get("/slow")
 * @UseInterceptors(new TimeoutInterceptor(5000))
 * slowRoute() { ... }
 * ```
 */
export class TimeoutInterceptor implements Interceptor {
	private readonly timeoutMs: number;

	constructor(timeoutMs: number) {
		this.timeoutMs = timeoutMs;
	}

	async intercept(
		context: ExecutionContext,
		next: () => Promise<unknown>,
	): Promise<unknown> {
		return Promise.race([
			next(),
			new Promise<never>((_, reject) => {
				setTimeout(() => {
					reject(
						new Error(
							`Request timed out after ${this.timeoutMs}ms (${context.getController()}.${context.getHandler()})`,
						),
					);
				}, this.timeoutMs);
			}),
		]);
	}
}
