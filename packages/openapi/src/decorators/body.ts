/**
 * `@ApiBody({ description, required, schema })` — document the request
 * body. Auto-derivation from `@Validate({ body })` runs first; explicit
 * `@ApiBody` decorators take precedence.
 */
import { OPENAPI_META, type ApiBodyOptions } from "../types.js";
import { safeGetMeta, safeDefineMeta, safeHasMeta } from "@nexusts/core/di/safe-reflect";

export function ApiBody(options: ApiBodyOptions): MethodDecorator {
	return (target: object, propertyKey: string | symbol) => {
		safeDefineMeta(OPENAPI_META.BODY, options, target.constructor, propertyKey);
	};
}