/**
 * `@Arg(name, type?)` parameter decorator.
 *
 * Declares a method parameter as a GraphQL field argument. Used on
 * resolver methods marked with `@Query`/`@Mutation`/`@Subscription`.
 *
 *   @Mutation()
 *   updateProfile(
 *     @Arg("name") name: string,
 *     @Arg("email", "String!") email: string,
 *   ) { ... }
 *
 * The optional `type` argument is the SDL type (e.g. `"String!"`,
 * `"Int"`, `"[User!]!"`). When omitted, the framework uses `"String"`
 * as a safe default — explicit is better than implicit.
 */
import { pushResolverField, getResolverTypeName } from "./resolver.js";
import { safeGetMeta, safeDefineMeta, safeHasMeta } from "@nexusts/core/di/safe-reflect";

const ARGS_KEY = Symbol.for("nexus:GraphQL:MethodArgs");

export function Arg(name: string, type: string = "String"): ParameterDecorator {
	return (
		target: object,
		propertyKey: string | symbol | undefined,
		parameterIndex: number,
	) => {
		if (propertyKey === undefined) {
			throw new Error(
				"@Arg() can only decorate method parameters, not constructor parameters.",
			);
		}
		const list = (safeGetMeta(ARGS_KEY, target, propertyKey) as
			| Array<{ name: string; type: string; index: number }>
			| undefined) ?? [];
		list.push({ name, type, index: parameterIndex });
		safeDefineMeta(ARGS_KEY, list, target, propertyKey);
	};
}

/** Read `@Arg` metadata for a specific method. */
export function getMethodArgs(
	target: object,
	propertyKey: string | symbol,
): Array<{ name: string; type: string; index: number }> {
	return (safeGetMeta(ARGS_KEY, target, propertyKey) as
		| Array<{ name: string; type: string; index: number }>
		| undefined) ?? [];
}
