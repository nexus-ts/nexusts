/**
 * `@ApiParam({ name, description, required, schema })` — document a
 * path parameter. The decorator is optional — the spec builder
 * auto-derives path params from the route pattern (`/users/:id` → `id`).
 * Use this when you want to override the schema or add a description.
 */
import "reflect-metadata";
import { type ApiParamOptions, OPENAPI_META } from "../types.js";

export function ApiParam(options: ApiParamOptions): MethodDecorator {
	return (target: object, propertyKey: string | symbol) => {
		const existing: ApiParamOptions[] =
			Reflect.getMetadata(OPENAPI_META.PARAMS, target.constructor, propertyKey) ?? [];
		existing.push(options);
		Reflect.defineMetadata(OPENAPI_META.PARAMS, existing, target.constructor, propertyKey);
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
			Reflect.getMetadata(OPENAPI_META.QUERIES, target.constructor, propertyKey) ?? [];
		existing.push(options);
		Reflect.defineMetadata(OPENAPI_META.QUERIES, existing, target.constructor, propertyKey);
	};
}