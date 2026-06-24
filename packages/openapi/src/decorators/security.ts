/**
 * `@ApiSecurity('bearerAuth', [])` — declare the security requirements
 * for an operation or controller.
 */
import "reflect-metadata";
import { type ApiSecurityOptions, OPENAPI_META } from "../types.js";

export function ApiSecurity(name: string, scopes: string[] = []): ClassDecorator & MethodDecorator {
	return (
		target: any,
		_propertyKey?: string | symbol,
		_descriptor?: PropertyDescriptor,
	) => {
		// Class or method — store the same way.
		const key = OPENAPI_META.SECURITY;
		const existing: ApiSecurityOptions[] =
			(typeof _propertyKey === "string" || typeof _propertyKey === "symbol")
				? Reflect.getMetadata(key, target.constructor, _propertyKey) ?? []
				: Reflect.getMetadata(key, target) ?? [];
		existing.push({ [name]: scopes });
		if (typeof _propertyKey === "string" || typeof _propertyKey === "symbol") {
			Reflect.defineMetadata(key, existing, target.constructor, _propertyKey);
		} else {
			Reflect.defineMetadata(key, existing, target);
		}
	};
}

/** `@ApiExclude()` — exclude a route from the spec. */
export function ApiExclude(): MethodDecorator {
	return (target: object, propertyKey: string | symbol) => {
		Reflect.defineMetadata(OPENAPI_META.EXCLUDE, true, target.constructor, propertyKey);
	};
}
