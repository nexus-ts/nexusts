/**
 * `@Query(name?)` / `@Mutation(name?)` / `@Subscription(name?)`
 *
 * Method decorators that mark a resolver method as a GraphQL operation.
 * The optional `name` argument overrides the field name in the schema
 * (defaults to the method name).
 *
 * In standard decorator mode (TC39), argument types are provided via
 * `opts.args` instead of `@Arg()` parameter decorators:
 *
 *   @Resolver()
 *   class UserResolver {
 *     @Query("hello", { returns: "String!", args: { name: "String!" } })
 *     hello(name: string): string { ... }
 *   }
 *
 * In legacy mode, `@Arg()` parameter decorator continues to work.
 */
import { pushResolverField } from "./resolver.js";
import { getMethodArgs } from "./arg.js";
import type { ResolverClassRecord } from "../types.js";

type OperationKind = "query" | "mutation" | "subscription";

export interface OperationOptions {
	returns?: string;
	args?: Record<string, string>;
}

/** Build args array from legacy @Arg metadata or opts.args. */
function buildArgs(
	argsMeta: Array<{ name: string; type: string; index: number }>,
	optsArgs?: Record<string, string>,
): Array<{ name: string; type: string }> {
	if (argsMeta.length > 0) {
		return argsMeta.sort((a, b) => a.index - b.index).map((a) => ({ name: a.name, type: a.type }));
	}
	if (optsArgs) {
		return Object.entries(optsArgs).map(([n, t]) => ({ name: n, type: t }));
	}
	return [];
}

function makeOperationDecorator(kind: OperationKind) {
	return (name?: string, opts?: OperationOptions) => (...args: any[]): void => {
			// ── Standard decorator mode (TC39) ──
			if (args.length >= 2 && args[1]?.kind === "method") {
				const [_target, context] = args as [object, DecoratorContext];
				const methodName = context.name as string;
				const meta = context.metadata as Record<string, any>;
				const key = "nexus:GraphQL:Fields";
				const arr: ResolverClassRecord["fields"] = meta[key] ?? [];
				arr.push({
					propertyKey: methodName,
					kind,
					name: name ?? methodName,
					returnTypeName: opts?.returns ?? "JSON",
					args: buildArgs([], opts?.args),
				});
				meta[key] = arr;
				return;
			}
			// ── Legacy decorator mode (experimentalDecorators) ──
			const target = args[0] as object;
			const propertyKey = args[1] as string | symbol;
			const argsMeta = getMethodArgs(target, propertyKey);
			pushResolverField(target, {
				propertyKey: String(propertyKey),
				kind,
				name: name ?? String(propertyKey),
				returnTypeName: opts?.returns ?? "JSON",
				args: buildArgs(argsMeta, opts?.args),
			});
		};
}

export const Query = makeOperationDecorator("query");
export const Mutation = makeOperationDecorator("mutation");
export const Subscription = makeOperationDecorator("subscription");

/** Public helper for the scanner. */
export type AnyField = ResolverClassRecord["fields"][number];
