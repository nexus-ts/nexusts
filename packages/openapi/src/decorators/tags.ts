/**
 * `@ApiTags('Users', 'Admin')` — group operations under one or more
 * tags in the OpenAPI spec.
 */
import { safeGetMeta, safeDefineMeta } from "@nexusts/core/di/safe-reflect";
import { OPENAPI_META } from "../types.js";

export function ApiTags(...tags: string[]): ClassDecorator {
	return (target: any) => {
		const existing: string[] = safeGetMeta(OPENAPI_META.TAGS, target) ?? [];
		safeDefineMeta(OPENAPI_META.TAGS, [...existing, ...tags], target);
	};
}
