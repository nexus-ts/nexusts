/**
 * Exception Filters.
 *
 * Intercept and transform errors thrown by route handlers before they
 * become HTTP responses. Apply with `@UseFilters()` on controllers or
 * individual routes, or globally via `ApplicationOptions.filters`.
 *
 * Execution order (highest priority last): global → controller → route.
 *
 * @example
 * ```ts
 * class NotFoundFilter implements ExceptionFilter {
 *   catch(error: unknown, ctx: HttpExecutionContext): Response {
 *     if (error instanceof HttpException && error.statusCode === 404) {
 *       return new Response(JSON.stringify({ message: error.message }), {
 *         status: 404,
 *         headers: { "Content-Type": "application/json" },
 *       });
 *     }
 *     throw error; // re-throw for the next filter
 *   }
 * }
 *
 * @Controller("/api")
 * @UseFilters(NotFoundFilter)
 * class ApiController { ... }
 * ```
 */
import "reflect-metadata";
import {
	CONTROLLER_EXCEPTION_FILTERS_METADATA,
	EXCEPTION_FILTERS_METADATA,
} from "../constants.js";
import { HttpException } from "./http-exception.js";

// Re-export HttpException so consumers get it from the barrel.
export { HttpException };

// ============================================================================
// Interfaces
// ============================================================================

/**
 * Execution context passed to exception filters.
 * Provides access to the request that caused the error.
 */
export interface HttpExecutionContext {
	readonly type: "http";
	getRequest(): Request;
	getHandler(): string;
	getController(): string;
}

/**
 * ExceptionFilter interface.
 *
 * Implement `catch(error, context)` to handle errors thrown by route handlers.
 * Return a `Response` to short-circuit the error. Throw/re-throw to let the
 * next filter in the chain handle it.
 */
export interface ExceptionFilter {
	catch(
		error: unknown,
		context: HttpExecutionContext,
	): Response | Promise<Response>;
}

// ============================================================================
// Execution Context Implementation
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
// Factory
// ============================================================================

/**
 * Create a custom exception filter from a plain function.
 *
 * @example
 * ```ts
 * const logFilter = createExceptionFilter((error, ctx) => {
 *   console.error(`[${ctx.getController()}]`, error);
 *   return new Response("Internal Error", { status: 500 });
 * });
 * ```
 */
export function createExceptionFilter(
	fn: (
		error: unknown,
		context: HttpExecutionContext,
	) => Response | Promise<Response>,
): ExceptionFilter {
	return { catch: fn };
}

// ============================================================================
// Default filter
// ============================================================================

/**
 * Create the default exception filter.
 * Handles HttpException with its status code, and wraps all other errors
 * as 500 Internal Server Error.
 */
export function createDefaultExceptionFilter(): ExceptionFilter {
	return {
		catch(error: unknown): Response {
			if (error instanceof HttpException) {
				return new Response(JSON.stringify(error.toJSON()), {
					status: error.statusCode,
					headers: { "Content-Type": "application/json" },
				});
			}

			const message =
				error instanceof Error ? error.message : "Internal Server Error";
			const stack = error instanceof Error ? error.stack : undefined;

			return new Response(
				JSON.stringify({
					error: message,
					statusCode: 500,
					...(process.env["NODE_ENV"] !== "production" && stack
						? { stack }
						: {}),
				}),
				{
					status: 500,
					headers: { "Content-Type": "application/json" },
				},
			);
		},
	};
}

/** Default exception filter instance. */
export const defaultExceptionFilter: ExceptionFilter =
	createDefaultExceptionFilter();

// ============================================================================
// Execute filters chain
// ============================================================================

/**
 * Execute a chain of exception filters against an error.
 * Filters are tried in order; the first that returns a Response wins.
 * If no filter handles the error, the default filter is used.
 */
export async function executeExceptionFilters(
	filters: ExceptionFilter[],
	error: unknown,
	context: HttpExecutionContext,
): Promise<Response> {
	for (const filter of filters) {
		try {
			const result = await filter.catch(error, context);
			if (result instanceof Response) return result;
		} catch {
			// Filter itself threw — continue to the next filter
		}
	}
	// Fallback to default
	return defaultExceptionFilter.catch(error, context);
}

// ============================================================================
// @UseFilters decorator
// ============================================================================

/**
 * Exception Filters decorator — can be applied to both controllers (class)
 * and individual routes (method).
 *
 * Pass filter **instances** (from `createExceptionFilter()` or implementing
 * `ExceptionFilter`). Route-level filters are tried before controller-level
 * filters (higher specificity wins first).
 *
 * @example Class-level (all routes)
 * ```ts
 * @Controller("/api")
 * @UseFilters(new NotFoundFilter())
 * class ApiController { ... }
 * ```
 *
 * @example Method-level (single route)
 * ```ts
 * @Get("/risky")
 * @UseFilters(createExceptionFilter((err) => new Response("Custom", { status: 500 })))
 * riskyRoute() { ... }
 * ```
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function UseFilters(...filters: ExceptionFilter[]): any {
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	return function useFiltersDecorator(...args: any[]): any {
		// ---- Class decorator ----
		if (args.length === 1 && typeof args[0] === "function") {
			const target = args[0] as Function;
			const existing: ExceptionFilter[] =
				Reflect.getMetadata(CONTROLLER_EXCEPTION_FILTERS_METADATA, target) ?? [];
			Reflect.defineMetadata(
				CONTROLLER_EXCEPTION_FILTERS_METADATA,
				[...existing, ...filters],
				target,
			);
			return target;
		}

		// ---- Method decorator ----
		const [target, propertyKey] = args as [object, string | symbol, PropertyDescriptor];
		const existingFilters: ExceptionFilter[] =
			Reflect.getMetadata(EXCEPTION_FILTERS_METADATA, target, propertyKey) ?? [];
		Reflect.defineMetadata(
			EXCEPTION_FILTERS_METADATA,
			[...existingFilters, ...filters],
			target,
			propertyKey,
		);
		return args[2];
	};
}

// ============================================================================
// Metadata accessors
// ============================================================================

/** Get controller-level exception filters for a controller class. */
export function getControllerExceptionFilters(
	target: Function,
): ExceptionFilter[] {
	return (
		Reflect.getMetadata(CONTROLLER_EXCEPTION_FILTERS_METADATA, target) ?? []
	);
}

/** Get route-level exception filters for a method. */
export function getRouteExceptionFilters(
	target: object,
	propertyKey: string | symbol,
): ExceptionFilter[] {
	return (
		Reflect.getMetadata(EXCEPTION_FILTERS_METADATA, target, propertyKey) ?? []
	);
}
