/**
 * `@ApiResponse(200, { description: 'OK', schema: UserSchema })`
 *
 * Decorate a controller method to describe one of its responses.
 * Multiple `@ApiResponse` calls accumulate.
 */
import { OPENAPI_META, type ApiResponseOptions } from "../types.js";
import { safeGetMeta, safeDefineMeta, safeHasMeta } from "@nexusts/core/di/safe-reflect";

export function ApiResponse(
	status: number | string,
	options: ApiResponseOptions,
): MethodDecorator {
	return (target: object, propertyKey: string | symbol) => {
		const existing: Array<[string, ApiResponseOptions]> =
			safeGetMeta(OPENAPI_META.RESPONSES, target.constructor, propertyKey) ?? [];
		existing.push([String(status), options]);
		safeDefineMeta(OPENAPI_META.RESPONSES, existing, target.constructor, propertyKey);
	};
}