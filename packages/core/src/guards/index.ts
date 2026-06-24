/**
 * HTTP Guards.
 *
 * Guards for authorizing HTTP requests before they reach the route handler.
 * Apply with `@UseGuards()` on controllers or individual routes.
 *
 * Guards run after the middleware chain but before the route handler.
 * If any guard returns false, the request is rejected with a 403 Forbidden response.
 *
 * Execution order: middleware → guards → interceptors(handler) → response
 *
 * @example
 * ```ts
 * @Controller("/admin")
 * @UseGuards(AuthGuard)
 * class AdminController { ... }
 * ```
 */
import "reflect-metadata";
import {
	CONTROLLER_GUARDS_METADATA,
	HTTP_GUARDS_METADATA,
} from "../constants.js";

// ============================================================================
// Interfaces
// ============================================================================

/**
 * HTTP guard execution context.
 */
export interface HttpExecutionContext {
	readonly type: "http";
	getRequest(): Request;
	getHandler(): string;
	getController(): string;
}

/**
 * HttpGuard interface.
 *
 * Implement `canActivate(context)` to authorize a request.
 * Return true to allow, false to deny (→ 403 Forbidden).
 */
export interface HttpGuard {
	canActivate(context: HttpExecutionContext): boolean | Promise<boolean>;
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
// Guard Execution
// ============================================================================

/**
 * Execute a list of HTTP guards sequentially.
 * Returns false as soon as any guard denies access (short-circuit).
 */
export async function executeHttpGuards(
	guards: (Function | HttpGuard)[],
	context: HttpExecutionContext,
): Promise<boolean> {
	for (const guard of guards) {
		let guardInstance: HttpGuard;

		if (typeof guard === "function") {
			guardInstance = new (guard as new () => HttpGuard)();
		} else {
			guardInstance = guard;
		}

		const result = await guardInstance.canActivate(context);
		if (!result) return false;
	}

	return true;
}

// ============================================================================
// Factory
// ============================================================================

/**
 * Create a custom HTTP guard from a plain function.
 * Returns a class constructor compatible with `@UseGuards()`.
 *
 * @example
 * ```ts
 * const ApiKeyGuard = createHttpGuard((ctx) => {
 *   return ctx.getRequest().headers.get("x-api-key") === process.env.API_KEY;
 * });
 *
 * @UseGuards(ApiKeyGuard)
 * @Get("/protected")
 * getData() { ... }
 * ```
 */
export function createHttpGuard(
	fn: (context: HttpExecutionContext) => boolean | Promise<boolean>,
): new () => HttpGuard {
	return class implements HttpGuard {
		canActivate(context: HttpExecutionContext): boolean | Promise<boolean> {
			return fn(context);
		}
	};
}

// ============================================================================
// @UseGuards decorator
// ============================================================================

/**
 * Guards decorator — can be applied to both controllers (class) and
 * individual routes (method).
 *
 * Pass guard **class constructors** or **instances**. Class constructors
 * are instantiated per-check; instances are reused.
 *
 * If any guard returns false, the request gets a 403 Forbidden response.
 *
 * @example Class-level (all routes)
 * ```ts
 * @Controller("/admin")
 * @UseGuards(AuthGuard)
 * class AdminController { ... }
 * ```
 *
 * @example Method-level (single route)
 * ```ts
 * @Get("/dashboard")
 * @UseGuards(new RolesGuard(["admin"]))
 * getDashboard() { ... }
 * ```
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function UseGuards(...guards: (Function | HttpGuard)[]): any {
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	return function useGuardsDecorator(...args: any[]): any {
		// ---- Class decorator ----
		if (args.length === 1 && typeof args[0] === "function") {
			const target = args[0] as Function;
			const existing: (Function | HttpGuard)[] =
				Reflect.getMetadata(CONTROLLER_GUARDS_METADATA, target) ?? [];
			Reflect.defineMetadata(
				CONTROLLER_GUARDS_METADATA,
				[...existing, ...guards],
				target,
			);
			return target;
		}

		// ---- Method decorator ----
		const [target, propertyKey] = args as [object, string | symbol, PropertyDescriptor];
		const existingGuards: (Function | HttpGuard)[] =
			Reflect.getMetadata(HTTP_GUARDS_METADATA, target, propertyKey) ?? [];
		Reflect.defineMetadata(
			HTTP_GUARDS_METADATA,
			[...existingGuards, ...guards],
			target,
			propertyKey,
		);
		return args[2];
	};
}

// ============================================================================
// Metadata accessors
// ============================================================================

/** Get controller-level guards for a controller class. */
export function getControllerGuards(
	target: Function,
): (Function | HttpGuard)[] {
	return Reflect.getMetadata(CONTROLLER_GUARDS_METADATA, target) ?? [];
}

/** Get route-level guards for a method. */
export function getRouteGuards(
	target: object,
	propertyKey: string | symbol,
): (Function | HttpGuard)[] {
	return Reflect.getMetadata(HTTP_GUARDS_METADATA, target, propertyKey) ?? [];
}

// ============================================================================
// Built-in Guards
// ============================================================================

/**
 * Guard that requires a valid Bearer token in the Authorization header.
 * Does NOT validate the token — only checks that the header is present.
 * Combine with a custom middleware or guard to validate the token itself.
 *
 * @example
 * ```ts
 * @UseGuards(AuthGuard)
 * @Get("/profile")
 * getProfile() { ... }
 * ```
 */
export class AuthGuard implements HttpGuard {
	canActivate(context: HttpExecutionContext): boolean {
		const auth = context.getRequest().headers.get("authorization");
		return auth !== null && auth.startsWith("Bearer ");
	}
}

/**
 * Default roles extractor — reads comma-separated roles from the
 * `x-user-roles` header. Set this header from your auth middleware
 * after validating the token.
 */
function defaultRolesExtractor(ctx: HttpExecutionContext): string[] {
	const rolesHeader = ctx.getRequest().headers.get("x-user-roles");
	return rolesHeader ? rolesHeader.split(",").map((r) => r.trim()) : [];
}

/**
 * Guard that requires all specified roles to be present on the request.
 * By default reads roles from the `x-user-roles` header (comma-separated).
 * Provide a custom `rolesExtractor` to read roles from a different source.
 *
 * @example
 * ```ts
 * @UseGuards(new RolesGuard(["admin", "moderator"]))
 * @Delete("/users/:id")
 * deleteUser() { ... }
 * ```
 */
export class RolesGuard implements HttpGuard {
	private readonly roles: string[];
	private readonly rolesExtractor: (ctx: HttpExecutionContext) => string[];

	constructor(
		roles: string[],
		rolesExtractor: (ctx: HttpExecutionContext) => string[] = defaultRolesExtractor,
	) {
		this.roles = roles;
		this.rolesExtractor = rolesExtractor;
	}

	canActivate(context: HttpExecutionContext): boolean {
		const userRoles = this.rolesExtractor(context);
		return this.roles.every((role) => userRoles.includes(role));
	}
}
