/**
 * `@ApiResponse(200, { description: 'OK', schema: UserSchema })`
 *
 * Decorate a controller method to describe one of its responses.
 * Multiple `@ApiResponse` calls accumulate.
 */
import "reflect-metadata";
import { type ApiResponseOptions, OPENAPI_META } from "../types.js";

export function ApiResponse(
	status: number | string,
	options: ApiResponseOptions,
): MethodDecorator {
	return (target: object, propertyKey: string | symbol) => {
		const existing: Array<[string, ApiResponseOptions]> =
			Reflect.getMetadata(OPENAPI_META.RESPONSES, target.constructor, propertyKey) ?? [];
		existing.push([String(status), options]);
		Reflect.defineMetadata(OPENAPI_META.RESPONSES, existing, target.constructor, propertyKey);
	};
}