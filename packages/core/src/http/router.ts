/**
 * Router.
 *
 * The router is responsible for translating the framework's declarative
 * metadata (controllers + @Get/@Post + param decorators + validation)
 * into Hono route handlers.
 *
 * It supports three registration styles:
 * 1. **Nest style**  — class decorators (@Controller, @Get, ...)
 * 2. **Adonis style** — `router.get('/users', UserController, 'list')`
 * 3. **Functional style** — `app.get('/users', async (c) => ...)`
 *
 * The router does NOT own the Hono instance; it just adds routes to
 * the Hono app passed to `Router.create(app, container)`.
 */
import "reflect-metadata";
import type { Hono } from "hono";
import { PARAM_TYPES } from "../constants.js";
import {
	getControllerMetadata,
	isController,
} from "../decorators/controller.js";
import { getRoutes } from "../decorators/http-methods.js";
import { getParamMetadata } from "../decorators/params.js";
import { getValidationMetadata } from "../decorators/validate.js";
import type { ApplicationContainer, DIContainer } from "../di/container.js";
import type { HttpMethod, RouteMetadata, Type } from "../di/tokens.js";
import {
	executeExceptionFilters,
	type HttpExecutionContext as FilterContext,
	HttpExecutionContextImpl as FilterContextImpl,
	getControllerExceptionFilters,
	getRouteExceptionFilters,
} from "../exception-filters/index.js";

// Guard, interceptor, and filter integration
import {
	executeHttpGuards,
	type HttpExecutionContext as GuardContext,
	HttpExecutionContextImpl as GuardExecutionContextImpl,
	getControllerGuards,
	getRouteGuards,
	type HttpGuard,
} from "../guards/index.js";

import {
	composeInterceptors,
	type ExecutionContext,
	getControllerInterceptors,
	getRouteInterceptors,
	type Interceptor,
	HttpExecutionContextImpl as InterceptorContextImpl,
	type ResolvedInterceptor,
} from "../interceptors/index.js";
import {
	validateRequest,
} from "../validation/validator.js";

export interface NexusRouter {
	/** Register a controller class (Nest style). */
	registerController(controller: Type<any>, container?: DIContainer): void;
	/** Register a method handler in Adonis style. */
	add(
		method: HttpMethod,
		path: string,
		handler: any,
		methodName?: string,
		container?: DIContainer,
	): void;
	/** Register a raw Hono-compatible handler. */
	raw(method: HttpMethod, path: string, handler: HonoHandler): void;
	/** Return the underlying Hono instance. */
	getHono(): Hono;
	/** Return all registered routes (for OpenAPI spec generation). */
	getRoutes(): Array<{
		method: string;
		path: string;
		target: any;
		propertyKey: string | symbol;
		validation?: {
			body?: unknown;
			query?: unknown;
			params?: unknown;
			headers?: unknown;
		};
	}>;
}

export type HonoHandler = (c: any, next?: any) => any | Promise<any>;

const HTTP_METHOD_TO_HONO: Record<
	HttpMethod,
	"get" | "post" | "put" | "delete" | "patch" | "options" | "head"
> = {
	GET: "get",
	POST: "post",
	PUT: "put",
	DELETE: "delete",
	PATCH: "patch",
	OPTIONS: "options",
	HEAD: "head",
};

/**
 * Optional hook invoked once per controller method at mount time.
 * If set, the return value replaces `route.handler` for that method.
 * External packages (e.g. `@nexusts/resilience`) register here to
 * eagerly wrap decorated methods without coupling core to them.
 */
type ControllerMethodHook = (
	proto: object,
	propertyKey: string,
	handler: Function,
) => Function;

let _controllerMethodHook: ControllerMethodHook | null = null;

/**
 * Register a global controller-method hook. Called once per method
 * when `registerController()` processes a route.
 *
 * @internal — used by `@nexusts/resilience` and similar packages.
 */
export function setControllerMethodHook(fn: ControllerMethodHook | null): void {
	_controllerMethodHook = fn;
}

class NexusRouterImpl implements NexusRouter {
	private hono: Hono;
	private root: ApplicationContainer;
	/** Stored route metadata for OpenAPI spec generation. */
	#routeList: Array<{
		method: string;
		path: string;
		target: any;
		propertyKey: string | symbol;
		validation?: {
			body?: unknown;
			query?: unknown;
			params?: unknown;
			headers?: unknown;
		};
	}> = [];

	constructor(hono: Hono, root: ApplicationContainer) {
		this.hono = hono;
		this.root = root;
	}

	getHono(): Hono {
		return this.hono;
	}

	/** Return all registered routes (for OpenAPI spec generation). */
	getRoutes(): Array<{
		method: string;
		path: string;
		target: any;
		propertyKey: string | symbol;
		validation?: {
			body?: unknown;
			query?: unknown;
			params?: unknown;
			headers?: unknown;
		};
	}> {
		return this.#routeList;
	}

	registerController(controller: Type<any>, container?: DIContainer): void {
		if (!isController(controller)) {
			throw new Error(
				`Class "${controller.name}" is missing the @Controller() decorator.`,
			);
		}

		const { prefix } = getControllerMetadata(controller);
		const routes = getRoutes(controller);
		const resolvedContainer =
			container ?? this.resolveControllerContainer(controller);

		if (routes.length === 0) {
			// Warn rather than silently skip — the most common cause is defining
			// multiple @Controller classes in the same file, which causes Bun's
			// TypeScript transformer to mis-order decorator execution so that
			// @Get/@Post metadata is never stored on the class.
			console.warn(
				`[nexus] Controller "${controller.name}" has no registered routes. ` +
					`If this is unexpected, ensure each @Controller class is defined ` +
					`in its own file (Bun may mis-order decorators when multiple ` +
					`@Controller classes share a single module file).`,
			);
			return;
		}

		for (const route of routes) {
			const fullPath = this.joinPaths(prefix, route.path);
			this.mountRoute(controller, route, fullPath, resolvedContainer);
		}
	}

	add(
		method: HttpMethod,
		path: string,
		handler: any,
		methodName?: string,
		container?: DIContainer,
	): void {
		// Two forms:
		//   add('GET', '/users', handlerFn)             → functional style
		//   add('GET', '/users', UserController, 'list') → Adonis style
		if (
			typeof handler === "function" &&
			methodName &&
			handler.prototype &&
			isController(handler)
		) {
			const controllerInstance = (container ?? this.root).resolve(handler);
			const handlerFn = controllerInstance[methodName];
			const fullPath = this.joinPaths(
				getControllerMetadata(handler).prefix,
				path,
			);
			const routes = getRoutes(handler);
			const route = routes.find((r) => r.propertyKey === methodName);
			if (!route) {
				// The route metadata wasn't found because we passed a free path
				// (not declared with @Get). Fall back to invoking the raw method.
				this.raw(method, fullPath, async (c) =>
					handlerFn.call(controllerInstance, c),
				);
				return;
			}
			this.mountRoute(
				handler,
				{ ...route, handler: handlerFn },
				fullPath,
				container ?? this.root,
			);
			return;
		}

		// Functional style: handler is already a Hono-compatible function.
		this.raw(method, path, handler);
	}

	raw(method: HttpMethod, path: string, handler: HonoHandler): void {
		const fn = HTTP_METHOD_TO_HONO[method];
		// Hono doesn't expose a `head` method; fall back to `on` for HEAD.
		if (method === "HEAD") {
			(this.hono as any).on("HEAD", path, handler as any);
			return;
		}
		(this.hono as any)[fn](path, handler as any);
	}

	/**
	 * Mount a single @Route-decorated method to Hono, including validation,
	 * param resolution, DI lookup, guards, interceptors, and exception filters.
	 *
	 * Execution order:
	 *   middleware → guards → interceptors(handler) → response
	 *   errors → exception filters
	 */
	private mountRoute(
		controller: Type<any>,
		route: RouteMetadata,
		fullPath: string,
		container: DIContainer,
	): void {
		const validation = getValidationMetadata(controller, route.propertyKey);
		const paramMeta = getParamMetadata(controller.prototype, route.propertyKey);

		// Read guard metadata (controller-level + route-level).
		// Controller guards run first, then route guards.
		const controllerGuards = getControllerGuards(controller);
		const routeGuards = getRouteGuards(
			controller.prototype,
			route.propertyKey,
		);

		// Read interceptor metadata (controller-level + route-level).
		// Controller interceptors wrap outermost.
		const controllerInterceptors = getControllerInterceptors(controller);
		const routeInterceptors = getRouteInterceptors(
			controller.prototype,
			route.propertyKey,
		);

		// Read exception filter metadata (controller-level + route-level).
		// Route filters have highest priority (tried first).
		const controllerFilters = getControllerExceptionFilters(controller);
		const routeFilters = getRouteExceptionFilters(
			controller.prototype,
			route.propertyKey,
		);

		// Store for OpenAPI spec generation.
		this.#routeList.push({
			method: route.method,
			path: fullPath,
			target: controller,
			propertyKey: route.propertyKey,
			validation: validation ?? undefined,
		});

		// Pre-resolve guard instances that are class constructors (no DI).
		// Instance guards are reused directly.
		const resolvedGuards: HttpGuard[] = [];
		for (const g of [...controllerGuards, ...routeGuards]) {
			if (typeof g === "function") {
				resolvedGuards.push(new (g as new () => HttpGuard)());
			} else {
				resolvedGuards.push(g);
			}
		}

		// Pre-resolve interceptors: function/class constructors → ResolvedInterceptor.
		const resolvedInterceptors: ResolvedInterceptor[] = [];
		const allInterceptorClasses = [
			...controllerInterceptors,
			...routeInterceptors,
		];
		for (const ic of allInterceptorClasses) {
			if (typeof ic === "function") {
				// Class constructor — instantiate once (no DI for now).
				const instance = new (ic as new () => Interceptor)();
				const fn = instance.intercept.bind(instance);
				resolvedInterceptors.push(fn);
			} else {
				// Instance with intercept() method.
				const fn = ic.intercept.bind(ic);
				resolvedInterceptors.push(fn);
			}
		}

		const handlerName = String(route.propertyKey);
		const controllerName = controller.name;

		// Allow external packages to eagerly wrap the method (e.g. resilience).
		const finalHandler = _controllerMethodHook
			? _controllerMethodHook(
					controller.prototype,
					handlerName,
					route.handler,
				)
			: route.handler;

		const honoHandler = async (c: any) => {
			// Build execution context for guards/interceptors/filters.
			const req = c.req.raw ?? c.req;
			const guardCtx: GuardContext = new GuardExecutionContextImpl(
				req,
				handlerName,
				controllerName,
			);
			const interceptorCtx: ExecutionContext = new InterceptorContextImpl(
				req,
				handlerName,
				controllerName,
			);
			const filterCtx: FilterContext = new FilterContextImpl(
				req,
				handlerName,
				controllerName,
			);

			// 1. Execute guards (if any).
			if (resolvedGuards.length > 0) {
				const allowed = await executeHttpGuards(resolvedGuards, guardCtx);
				if (!allowed) {
					return c.json({ error: "Forbidden", statusCode: 403 }, 403);
				}
			}

			// 2. Build the core handler invocation.
			const coreHandler = async (): Promise<any> => {
				try {
					// Lazy: resolve the controller from the container for each request.
					// This is important for transient/request-scoped controllers.
					const instance = container.resolve(controller);
					const args = await this.buildArgs(c, paramMeta, validation);

					const result = await Promise.resolve(
						finalHandler.call(instance, ...args),
					);

					return await this.serialize(c, result);
				} catch (err) {
					// 4. Exception filters catch errors from the handler.
					const mergedFilters = [...routeFilters, ...controllerFilters];
					return executeExceptionFilters(mergedFilters, err, filterCtx);
				}
			};

			// 3. Compose interceptors around the core handler.
			let handlerWrapper: () => Promise<any>;
			if (resolvedInterceptors.length > 0) {
				handlerWrapper = composeInterceptors(
					resolvedInterceptors,
					interceptorCtx,
					coreHandler,
				);
			} else {
				handlerWrapper = coreHandler;
			}

			return handlerWrapper();
		};

		const fn = HTTP_METHOD_TO_HONO[route.method];
		if (route.method === "HEAD") {
			(this.hono as any).on("HEAD", fullPath, honoHandler);
			return;
		}
		(this.hono as any)[fn](fullPath, honoHandler);
	}

	/**
	 * Build the argument list for a controller method invocation based on
	 * the parameter decorator metadata.
	 */
	private async buildArgs(
		c: any,
		params: ReturnType<typeof getParamMetadata>,
		validation: any,
	) {
		// Run validation once; pass parsed values into @Body/@Query/@Param/@Headers.
		let parsed: any;
		const needsValidation =
			validation &&
			(validation.body ||
				validation.query ||
				validation.params ||
				validation.headers);

		// We also need the raw body when *any* parameter uses `@Body()`,
		// even without a `@Validate` schema. Without this a controller
		// like `@Post('/store') async store(@Body() input) { ... }`
		// would receive an empty body in vitest (and any environment
		// where the framework's parser isn't called eagerly).
		const hasBodyParam = params.some((p: any) => p.type === PARAM_TYPES.BODY);

		if (needsValidation || hasBodyParam) {
			const bodyPromise =
				needsValidation && validation.body
					? safeReadBody(c)
					: hasBodyParam
						? safeReadBody(c)
						: Promise.resolve(undefined);
			const [body] = await Promise.all([bodyPromise]);
			parsed = validateRequest(validation ?? {}, {
				body,
				query: c.req.query(),
				params: c.req.param(),
				headers: c.req.header(),
			});
		}

		const positional: any[] = [];
		for (const param of params) {
			positional[param.index] = this.resolveParam(c, param, parsed);
		}
		return positional;
	}

	private resolveParam(c: any, param: any, parsed: any) {
		switch (param.type) {
			case PARAM_TYPES.REQUEST:
			case PARAM_TYPES.CTX:
				return c;
			case PARAM_TYPES.RESPONSE:
				return c.res;
			case PARAM_TYPES.NEXT:
				return async () => {};
			case PARAM_TYPES.BODY:
				if (parsed) {
					if (param.name) return (parsed.body as any)?.[param.name];
					return parsed.body;
				}
				// Fallback when no @Validate is used: read body and extract field.
				// Note: safeReadBody is async, so this returns a Promise that must be awaited.
				// When any @Body() param exists, the body IS fetched above (hasBodyParam path),
				// so this fallback only runs when NO @Body() params exist — practically unreachable.
				return param.name
					? (safeReadBody(c) as any)?.[param.name]
					: safeReadBody(c);
			case PARAM_TYPES.QUERY:
				if (parsed) {
					if (param.name) return (parsed.query as any)?.[param.name];
					return parsed.query;
				}
				return param.name ? c.req.query(param.name) : c.req.query();
			case PARAM_TYPES.PARAM:
				if (parsed) {
					if (param.name) return (parsed.params as any)?.[param.name];
					return parsed.params;
				}
				return param.name ? c.req.param(param.name) : c.req.param();
			case PARAM_TYPES.HEADERS:
				if (parsed) {
					if (param.name)
						return (
							(parsed.headers as any)?.[param.name] ?? c.req.header(param.name)
						);
					return parsed.headers ?? c.req.header();
				}
				return param.name ? c.req.header(param.name) : c.req.header();
			case PARAM_TYPES.USER:
				return (c as any).var?.nexus?.user;
			default:
				return undefined;
		}
	}

	/**
	 * Serialize a controller return value into a Hono response. Supports:
	 * - `Response` / `Response`-like objects
	 * - `InertiaResponse` — serializes per the Inertia protocol
	 * - `{ view: 'name', data }` for templates
	 * - `{ redirect: '/path', status: 302 }` for redirects
	 * - Plain objects → JSON
	 * - Strings → text/html
	 */
	private async serialize(c: any, value: any): Promise<any> {
		if (value === undefined || value === null) {
			return c.body(null, 204);
		}
		if (value instanceof Response) {
			// Pass through to Hono by wrapping into the context. Going through
			// `c.body` ensures Hono correctly forwards the status, headers,
			// and body even when the response was created outside the
			// request-scoped Hono instance (e.g. from the Inertia adapter's
			// redirect/redirect-back helpers).
			const headers: Record<string, string> = {};
			value.headers.forEach((v, k) => {
				headers[k] = v;
			});
			const text = await value.text();
			return c.body(text, value.status as any, headers);
		}
		// Inertia responses carry a discriminator tag — route them through
		// the dedicated serializer (handles JSON vs HTML, asset-version
		// mismatch, partial reloads, deferred props, etc.).
		if (this.isInertiaResponse(value)) {
			return this.serializeInertia(c, value);
		}
		if (typeof value === "object") {
			if ("view" in value) {
				// Lazy import to avoid circular dependency.
				return renderViewResponse(c, value);
			}
			if ("redirect" in value) {
				return c.redirect(value.redirect, value.status ?? 302);
			}
			if ("status" in value && "body" in value) {
				return c.json(value.body, value.status);
			}
			return c.json(value);
		}
		if (typeof value === "string") {
			return c.html(value);
		}
		return c.json(value);
	}

	/**
	 * Type guard for InertiaResponse — uses the discriminator tag set in
	 * the constructor. We avoid `instanceof` so user code can subclass.
	 */
	private isInertiaResponse(value: any): boolean {
		return (
			value !== null &&
			typeof value === "object" &&
			value["__nexus_inertia_response__"] === true &&
			typeof value.toResponse === "function"
		);
	}

	/**
	 * Serialize an InertiaResponse. Detects XHR vs HTML and emits the
	 * correct shape. The response itself owns the version check and partial
	 * reload logic.
	 */
	private async serializeInertia(c: any, value: any): Promise<Response> {
		return await value.toResponse(c);
	}

	private resolveControllerContainer(controller: Type<any>): DIContainer {
		// Walk the module tree looking for the container that owns this class.
		for (const [, container] of (this.root as any).moduleContainers ??
			new Map()) {
			if ((container as any).has?.(controller)) return container;
		}
		// Fallback to root.
		return this.root;
	}

	private joinPaths(prefix: string, path: string): string {
		if (!prefix || prefix === "/") return path || "/";
		if (!path || path === "/") return prefix;
		if (prefix.endsWith("/")) return `${prefix}${path}`;
		return `${prefix}${path}`;
	}
}

async function renderViewResponse(c: any, value: any): Promise<Response> {
	const { renderView } = await import("@nexusts/view");
	const html = await renderView(value.view, value.data ?? {});
	return c.html(html, value.status ?? 200);
}

async function safeReadBody(c: any): Promise<any> {
	try {
		const ct = c.req.header("content-type") ?? "";
		if (ct.includes("application/json")) {
			return await c.req.json();
		}
		if (
			ct.includes("application/x-www-form-urlencoded") ||
			ct.includes("multipart/form-data")
		) {
			return await c.req.parseBody();
		}
		return await c.req.text();
	} catch {
		return undefined;
	}
}

/** Factory: build a router wrapping a Hono instance + container. */
export function createRouter(
	hono: Hono,
	container: ApplicationContainer,
): NexusRouter {
	return new NexusRouterImpl(hono, container);
}
