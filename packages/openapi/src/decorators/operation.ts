/**
 * `@ApiOperation({ summary, description, operationId, tags, deprecated })`
 *
 * Decorate a controller method to describe the operation in the spec.
 */
import "reflect-metadata";
import { type ApiOperationOptions, OPENAPI_META } from "../types.js";

export function ApiOperation(options: ApiOperationOptions): MethodDecorator {
	return (target: object, propertyKey: string | symbol) => {
		Reflect.defineMetadata(OPENAPI_META.OPERATION, options, target.constructor, propertyKey);
	};
}