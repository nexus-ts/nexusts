/**
 * `@ApiOperation({ summary, description, operationId, tags, deprecated })`
 *
 * Decorate a controller method to describe the operation in the spec.
 */
import { OPENAPI_META, type ApiOperationOptions } from "../types.js";
import { safeGetMeta, safeDefineMeta, safeHasMeta } from "@nexusts/core/di/safe-reflect";

export function ApiOperation(options: ApiOperationOptions): MethodDecorator {
	return (target: object, propertyKey: string | symbol) => {
		safeDefineMeta(OPENAPI_META.OPERATION, options, target.constructor, propertyKey);
	};
}