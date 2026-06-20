/**
 * Parameter decorators.
 *
 * These mark a controller method argument as a source of request data:
 *   - `@Req()`        → Hono context
 *   - `@Res()`        → Response helper
 *   - `@Next()`       → next() callback (for middleware-style handlers)
 *   - `@Body()`       → request body (parsed)
 *   - `@Query('key')` → a single query param, or full query object
 *   - `@Param('key')` → a single path param, or full params object
 *   - `@Headers('k')` → a single header, or full headers object
 *   - `@Ctx()`        → Hono context (alias for @Req)
 *   - `@User()`       → authenticated user (resolved via auth provider)
 *
 * The metadata is read by the router at mount time to build the
 * handler invocation list.
 */
import "reflect-metadata";
import { METADATA_KEY, PARAM_TYPES } from "../constants.js";
import type { ParamMetadata } from "../di/tokens.js";

export function createParamDecorator(
	type: number,
	data?: string | object,
): ParameterDecorator {
	return (
		target: object,
		propertyKey: string | symbol | undefined,
		parameterIndex: number,
	) => {
		// Method parameter: target is the prototype, propertyKey is the method name.
		// Constructor parameter: target is the class, propertyKey is undefined.
		if (propertyKey !== undefined) {
			const params: ParamMetadata[] =
				Reflect.getMetadata(METADATA_KEY.PARAMS, target, propertyKey) ?? [];
			params.push({
				index: parameterIndex,
				type,
				name: typeof data === "string" ? data : undefined,
				data: typeof data === "object" ? data : undefined,
			});
			Reflect.defineMetadata(METADATA_KEY.PARAMS, params, target, propertyKey);
		} else {
			const params: ParamMetadata[] =
				Reflect.getMetadata(METADATA_KEY.PARAMS, target) ?? [];
			params.push({
				index: parameterIndex,
				type,
				name: typeof data === "string" ? data : undefined,
				data: typeof data === "object" ? data : undefined,
			});
			Reflect.defineMetadata(METADATA_KEY.PARAMS, params, target);
		}
	};
}

export const Req = () => createParamDecorator(PARAM_TYPES.REQUEST);
export const Res = () => createParamDecorator(PARAM_TYPES.RESPONSE);
export const Next = () => createParamDecorator(PARAM_TYPES.NEXT);
export const Body = (key?: string) =>
	createParamDecorator(PARAM_TYPES.BODY, key);
export const Query = (key?: string) =>
	createParamDecorator(PARAM_TYPES.QUERY, key);
export const Param = (key?: string) =>
	createParamDecorator(PARAM_TYPES.PARAM, key);
export const Headers = (key?: string) =>
	createParamDecorator(PARAM_TYPES.HEADERS, key);
export const Ctx = () => createParamDecorator(PARAM_TYPES.CTX);
export const User = () => createParamDecorator(PARAM_TYPES.USER);

export function getParamMetadata(
	target: any,
	propertyKey: string | symbol,
): ParamMetadata[] {
	return Reflect.getMetadata(METADATA_KEY.PARAMS, target, propertyKey) ?? [];
}

export { PARAM_TYPES };
