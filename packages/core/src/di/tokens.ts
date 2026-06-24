/**
 * DI Token system.
 *
 * A token identifies a provider that can be injected. Tokens are either:
 * - A class (constructor function)
 * - A string (string token, for non-class providers like config values)
 * - A Symbol
 *
 * Classes are the most common form: they identify both the implementation
 * (instantiated by the container) and the abstract type to request.
 */
import type { HttpMethod } from "../constants.js";

export type { HttpMethod } from "../constants.js";

export type InjectionToken<T = unknown> =
	| (abstract new (
			...args: any[]
	  ) => T)
	| (new (
			...args: any[]
	  ) => T)
	| string
	| symbol;

export interface Type<T = any> {
	new (...args: any[]): T;
}

export interface AbstractType<T = any> {
	prototype: T;
}

/** Narrow token type for runtime use. */
export type ProviderToken<T = unknown> = InjectionToken<T>;

/** Optional injection token; undefined means "no token provided". */
export type OptionalFactoryDependency = {
	token: InjectionToken<any>;
	optional: boolean;
};

/**
 * Provider definitions. A provider tells the container how to build
 * an instance for a given token.
 */
export interface ClassProvider<T = any> {
	provide: InjectionToken<T>;
	useClass: Type<T>;
	scope?: ProviderScope;
}

export interface ValueProvider<T = any> {
	provide: InjectionToken<T>;
	useValue: T;
	scope?: ProviderScope;
}

export interface FactoryProvider<T = any> {
	provide: InjectionToken<T>;
	useFactory: (...args: any[]) => T | Promise<T>;
	inject?: Array<InjectionToken<any> | OptionalFactoryDependency>;
	scope?: ProviderScope;
}

export interface ExistingProvider<T = any> {
	provide: InjectionToken<T>;
	useExisting: InjectionToken<any>;
	scope?: ProviderScope;
}

export type Provider<T = any> =
	| Type<T>
	| ClassProvider<T>
	| ValueProvider<T>
	| FactoryProvider<T>
	| ExistingProvider<T>;

/**
 * Provider lifecycle scope.
 * - singleton: one instance per container (default).
 * - request: a new instance per HTTP request.
 * - transient: a new instance on every injection.
 */
export type ProviderScope = "singleton" | "request" | "transient";

/** Module configuration options. */
export interface ModuleOptions {
	controllers?: Type[];
	providers?: Provider[];
	imports?: Type[];
	exports?: InjectionToken[];
}

/** Decorator metadata shape for @Module. */
export interface ModuleMetadata extends ModuleOptions {}

/** Decorator metadata shape for @Controller. */
export interface ControllerMetadata {
	prefix: string;
}

/** Parameter descriptor produced by parameter decorators. */
export interface ParamMetadata {
	index: number;
	type: number;
	name?: string;
	data?: Record<string, any>;
}

/** Validation metadata for a route handler. */
export interface ValidationMetadata {
	body?: any;
	query?: any;
	params?: any;
	headers?: any;
}

/** Route handler metadata. */
export interface RouteMetadata {
	method: HttpMethod;
	path: string;
	propertyKey: string | symbol;
	handler: (...args: any[]) => any;
	validation?: ValidationMetadata;
	middlewares?: Array<(c: any, next: any) => Promise<any> | any>;
}
