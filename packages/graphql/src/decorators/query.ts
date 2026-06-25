/**
 * `@Query(name?)` / `@Mutation(name?)` / `@Subscription(name?)`
 *
 * Method decorators that mark a resolver method as a GraphQL operation.
 * The optional `name` argument overrides the field name in the schema
 * (defaults to the method name).
 *
 *   @Resolver("User")
 *   class UserResolver {
 *     @Query("currentUser")
 *     me() { return ctx.state.user; }
 *
 *     @Mutation()
 *     updateProfile(@Arg("name") name: string) { ... }
 *
 *     @Subscription()
 *     events() { return pubsub.asyncIterator("EVENTS"); }
 *   }
 */
import { pushResolverField } from "./resolver.js";
import { getMethodArgs } from "./arg.js";
import type { ResolverClassRecord } from "../types.js";
import { safeGetMeta, safeDefineMeta, safeHasMeta } from "@nexusts/core/di/safe-reflect";

type OperationKind = "query" | "mutation" | "subscription";

/**
 * Common implementation. `decorator` is a factory the user calls as
 * `@Query(name?, opts?)` / `@Mutation(name?, opts?)` etc.
 *
 * `opts.returns` — explicit GraphQL return type string, e.g. `"String!"`.
 * Defaults to `"JSON"` when omitted (safe fallback; set explicitly for
 * code-first schemas that use `autoSchema: true`).
 */
function makeOperationDecorator(kind: OperationKind) {
	return function (name?: string, opts?: { returns?: string }) {
		return (
			target: object,
			propertyKey: string | symbol,
			_descriptor: TypedPropertyDescriptor<any>,
		): void => {
			const argsMeta = getMethodArgs(target, propertyKey);
			pushResolverField(target, {
				propertyKey: String(propertyKey),
				kind,
				name: name ?? String(propertyKey),
				returnTypeName: opts?.returns ?? "JSON",
				args: argsMeta
					.sort((a, b) => a.index - b.index)
					.map((a) => ({ name: a.name, type: a.type })),
			});
		};
	};
}

export const Query = makeOperationDecorator("query");
export const Mutation = makeOperationDecorator("mutation");
export const Subscription = makeOperationDecorator("subscription");

/** Public helper for the scanner. */
export type AnyField = ResolverClassRecord["fields"][number];
