/**
 * @Resolver(typeName?) decorator.
 *
 * Marks a class as a GraphQL resolver. The optional `typeName` argument
 * declares the GraphQL type this class is responsible for. If
 * omitted, the type name defaults to the class name (e.g.
 * `UserResolver` → type `User`).
 *
 * The framework's GraphQL scanner picks up every class with this
 * decorator and reads the field methods off it (decorators from
 * `./query.js`, `./mutation.js`, `./subscription.js`).
 *
 *   @Resolver("User")
 *   class UserResolver {
 *     @Query()                                    me() { ... }
 *     @Mutation()                                  signup(@Arg("email") e: string) { ... }
 *     @Subscription()                              events() { ... }
 *   }
 */
import type { ResolverClassRecord } from "../types.js";
import { safeGetMeta, safeDefineMeta, safeHasMeta } from "@nexusts/core/di/safe-reflect";

const RESOLVER_KEY = Symbol.for("nexus:GraphQL:Resolver");
const FIELDS_KEY = Symbol.for("nexus:GraphQL:Fields");
const TYPENAME_KEY = Symbol.for("nexus:GraphQL:TypeName");

// Global registry of all @Resolver-decorated classes. Populated at
// decorator evaluation time so the SDL synthesiser can enumerate them
// without needing a separate scan pass.
const _resolverRegistry = new Set<Function>();

export function Resolver(typeName?: string): ClassDecorator {
	return (target: Function) => {
		const ctor = target as unknown as new (...args: any[]) => any;
		const inferred = typeName ?? ctor.name.replace(/Resolver$/, "");
		safeDefineMeta(RESOLVER_KEY, true, ctor);
		safeDefineMeta(TYPENAME_KEY, inferred, ctor);
		if (!safeHasMeta(FIELDS_KEY, ctor)) {
			safeDefineMeta(FIELDS_KEY, [], ctor);
		}
		_resolverRegistry.add(ctor);
	};
}

/** Return all classes decorated with `@Resolver`. */
export function getRegisteredResolvers(): Function[] {
	return [..._resolverRegistry];
}

/** Remove all entries from the registry. Intended for use in tests only. */
export function clearResolverRegistry(): void {
	_resolverRegistry.clear();
}

/** Read the type-name this resolver is for. */
export function getResolverTypeName(target: object): string | undefined {
	const t = (target as { prototype?: object }).prototype ?? target;
	const fromMeta = safeGetMeta(TYPENAME_KEY, t);
	if (fromMeta) return fromMeta as string;
	// Fallback: derive from the class name (drop "Resolver" suffix).
	const ctor = (t as { constructor?: { name: string } }).constructor;
	return ctor?.name.replace(/Resolver$/, "");
}

/** Append a field method to the resolver class's metadata. */
export function pushResolverField(
	target: object,
	field: ResolverClassRecord["fields"][number],
): void {
	const t = (target as { prototype?: object }).prototype ?? target;
	const list = (safeGetMeta(FIELDS_KEY, t) as ResolverClassRecord["fields"]) ?? [];
	list.push(field);
	safeDefineMeta(FIELDS_KEY, list, t);
}

/** Read the field metadata for a resolver class. */
export function getResolverFields(target: object): ResolverClassRecord["fields"] {
	const t = (target as { prototype?: object }).prototype ?? target;
	return (safeGetMeta(FIELDS_KEY, t) as ResolverClassRecord["fields"]) ?? [];
}

/** True if `target` was decorated with `@Resolver`. */
export function isResolverClass(target: object): boolean {
	const t = (target as { prototype?: object }).prototype ?? target;
	return safeGetMeta(RESOLVER_KEY, t) === true;
}
