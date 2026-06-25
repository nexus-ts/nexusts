/**
 * `@ApiSecurity('bearerAuth', [])` — declare the security requirements
 * for an operation or controller.
 */
import { OPENAPI_META, type ApiSecurityOptions } from "../types.js";
import { safeGetMeta, safeDefineMeta, safeHasMeta } from "@nexusts/core/di/safe-reflect";

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
				? safeGetMeta(key, target.constructor, _propertyKey) ?? []
				: safeGetMeta(key, target) ?? [];
		existing.push({ [name]: scopes });
		if (typeof _propertyKey === "string" || typeof _propertyKey === "symbol") {
			safeDefineMeta(key, existing, target.constructor, _propertyKey);
		} else {
			safeDefineMeta(key, existing, target);
		}
	};
}

/** `@ApiExclude()` — exclude a route from the spec. */
export function ApiExclude(): MethodDecorator {
	return (target: object, propertyKey: string | symbol) => {
		safeDefineMeta(OPENAPI_META.EXCLUDE, true, target.constructor, propertyKey);
	};
}
