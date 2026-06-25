/**
 * `@ApiParam({ name, description, required, schema })` — document a
 * path parameter. The decorator is optional — the spec builder
 * auto-derives path params from the route pattern (`/users/:id` → `id`).
 * Use this when you want to override the schema or add a description.
 */
import { OPENAPI_META, type ApiParamOptions } from "../types.js";
import { safeGetMeta, safeDefineMeta, safeHasMeta } from "@nexusts/core/di/safe-reflect";

export function ApiParam(options: ApiParamOptions): MethodDecorator {
	return (target: object, propertyKey: string | symbol) => {
		const existing: ApiParamOptions[] =
			safeGetMeta(OPENAPI_META.PARAMS, target.constructor, propertyKey) ?? [];
		existing.push(options);
		safeDefineMeta(OPENAPI_META.PARAMS, existing, target.constructor, propertyKey);
	};
}

/**
 * `@ApiQuery({ name: 'q', description: '...', schema: z.string() })`
 *
 * Document a query parameter. Auto-derivation from `@Validate({ query })`
 * runs first; explicit `@ApiQuery` decorators take precedence.
 */
export function ApiQuery(options: ApiParamOptions): MethodDecorator {
	return (target: object, propertyKey: string | symbol) => {
		const existing: ApiParamOptions[] =
			safeGetMeta(OPENAPI_META.QUERIES, target.constructor, propertyKey) ?? [];
		existing.push(options);
		safeDefineMeta(OPENAPI_META.QUERIES, existing, target.constructor, propertyKey);
	};
}