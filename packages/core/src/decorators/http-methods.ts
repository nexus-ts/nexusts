/**
 * HTTP method decorators.
 *
 * `@Get`, `@Post`, `@Put`, `@Delete`, `@Patch`, `@Options`, `@Head` mark a
 * controller method as a route handler. The path argument is appended to
 * the controller's prefix.
 *
 * @example
 * ```ts
 * @Controller('/users')
 * class UserController {
 *   @Get('/')
 *   list() {}
 *
 *   @Post('/')
 *   create(@Body() body: CreateUserDto) {}
 * }
 * ```
 */
import "reflect-metadata";
import { HTTP_METHODS, type HttpMethod, METADATA_KEY } from "../constants.js";
import type { RouteMetadata } from "../di/tokens.js";

function defineRoute(method: HttpMethod, path: string): MethodDecorator {
	return (
		target: object,
		propertyKey: string | symbol,
		descriptor: TypedPropertyDescriptor<any>,
	) => {
		const routes: RouteMetadata[] =
			Reflect.getMetadata(METADATA_KEY.ROUTES, target.constructor) ?? [];

		routes.push({
			method,
			path: normalizePath(path),
			propertyKey,
			handler: descriptor.value,
		});

		Reflect.defineMetadata(METADATA_KEY.ROUTES, routes, target.constructor);
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

export function getRoutes(target: any): RouteMetadata[] {
	return Reflect.getMetadata(METADATA_KEY.ROUTES, target) ?? [];
}

export type { RouteMetadata };
export { HTTP_METHODS };
