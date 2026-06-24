/**
 * `@ApiBody({ description, required, schema })` — document the request
 * body. Auto-derivation from `@Validate({ body })` runs first; explicit
 * `@ApiBody` decorators take precedence.
 */
import "reflect-metadata";
import { type ApiBodyOptions, OPENAPI_META } from "../types.js";

export function ApiBody(options: ApiBodyOptions): MethodDecorator {
	return (target: object, propertyKey: string | symbol) => {
		Reflect.defineMetadata(OPENAPI_META.BODY, options, target.constructor, propertyKey);
	};
}