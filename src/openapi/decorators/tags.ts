/**
 * `@ApiTags('Users', 'Admin')` — group operations under one or more
 * tags in the OpenAPI spec.
 */
import { OPENAPI_META } from "../types.js";

export function ApiTags(...tags: string[]): ClassDecorator {
	return (target: any) => {
		const existing: string[] = Reflect.getMetadata(OPENAPI_META.TAGS, target) ?? [];
		Reflect.defineMetadata(OPENAPI_META.TAGS, [...existing, ...tags], target);
	};
}
