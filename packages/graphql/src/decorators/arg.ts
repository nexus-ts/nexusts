
import { safeGetMeta, safeDefineMeta, } from "@nexusts/core/di/safe-reflect";

const ARGS_KEY = Symbol.for("nexus:GraphQL:MethodArgs");

export function Arg(name: string, type: string = "String"): any {
	return (...args: any[]): void => {
		// Standard decorator mode: parameter decorators don't exist in TC39 stage-3.
		// @Arg is a no-op in standard mode; argument metadata should be provided
		// via @Query/@Mutation options or explicit SDL syntax.
		if (args.length >= 2 && (args[1]?.kind === "parameter" || args[1]?.kind === "method")) {
			return;
		}
		// Legacy decorator mode (experimentalDecorators)
		const target = args[0] as object;
		const propertyKey = args[1] as string | symbol | undefined;
		const parameterIndex = args[2] as number;
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
