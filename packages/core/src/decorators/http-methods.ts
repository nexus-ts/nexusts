/**
 * HTTP method decorators — dual-mode (TC39 standard + legacy).
 *
 * `@Get`, `@Post`, `@Put`, `@Delete`, `@Patch`, `@Options`, `@Head` mark a
 * controller method as a route handler. The path argument is appended to
 * the controller's prefix.
 *
 * Standard mode (TC39):
 * ```ts
 * @Controller('/users')
 * class UserController {
 *   @Get('/')
 *   list(ctx: Context) {}
 * }
 * ```
 *
 * Legacy mode (experimentalDecorators: true) continues to work identically.
 */
import { safeGetMeta, safeDefineMeta, } from "../di/safe-reflect.js";
import { HTTP_METHODS, METADATA_KEY, type HttpMethod } from "../constants.js";
import type { RouteMetadata } from "../di/tokens.js";

function defineRoute(method: HttpMethod, path: string): any {
	return function (this: any, target: any, context?: any): void {
		const route: RouteMetadata = {
			method,
			path: normalizePath(path),
			propertyKey:
				context?.kind === "method"
					? context.name
					: (arguments[1] as string | symbol),
			handler: target as (...args: any[]) => any, // placeholder
		};

		// ── Standard decorator mode (TC39) ──
		if (context?.kind === "method" && context?.metadata) {
			// Note: in standard mode, `target` IS the method function,
			// NOT the prototype. (TC39: (value, context) signature).
			route.handler = target;

			const routes: RouteMetadata[] =
				(context.metadata[METADATA_KEY.ROUTES] as RouteMetadata[]) ?? [];
			routes.push(route);
			context.metadata[METADATA_KEY.ROUTES] = routes;
			return;
		}

		// ── Legacy decorator mode ──
		// In legacy mode, target is the prototype, and the actual handler
		// is in arguments[2]?.value (the MethodDecorator descriptor).
		route.handler = arguments[2]?.value ?? target;

		const routes: RouteMetadata[] =
			safeGetMeta(METADATA_KEY.ROUTES, target.constructor) ?? [];
		routes.push(route);
		safeDefineMeta(METADATA_KEY.ROUTES, routes, target.constructor);
	};
}

function normalizePath(path: string): string {
	if (!path || path === "/") return "/";
	return path.startsWith("/") ? path : `/${path}`;
}

export const Get = (path: string = "/") => defineRoute("GET", path);
export const Post = (path: string = "/") => defineRoute("POST", path);
export const Put = (path: string = "/") => defineRoute("PUT", path);
export const Delete = (path: string = "/") => defineRoute("DELETE", path);
export const Patch = (path: string = "/") => defineRoute("PATCH", path);
export const Options = (path: string = "/") => defineRoute("OPTIONS", path);
export const Head = (path: string = "/") => defineRoute("HEAD", path);

/**
 * Read routes from a controller class.
 * Checks both __nexus_meta__ (standard) and reflect-metadata (legacy).
 */
export function getRoutes(target: any): RouteMetadata[] {
	// Standard: __nexus_meta__
	if (typeof target === "function" && (target as any).__nexus_meta__) {
		const meta = (target as any).__nexus_meta__;
		const routes = meta[METADATA_KEY.ROUTES] as RouteMetadata[] | undefined;
		if (routes) return routes;
	}
	// Legacy: reflect-metadata
	return safeGetMeta(METADATA_KEY.ROUTES, target) ?? [];
}

export { HTTP_METHODS };
export type { RouteMetadata };