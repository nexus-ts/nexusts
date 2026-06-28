/**
 * @Validate decorator.
 *
 * Attaches Zod schemas (or class validators) to a route handler. Each
 * schema is run against the corresponding request part before the handler
 * executes; failed validation throws or returns a 400 response.
 *
 * @example
 * ```ts
 * const UserSchema = z.object({ name: z.string(), email: z.email() });
 *
 * @Post('/')
 * @Validate({ body: UserSchema })
 * create(@Body() body: z.infer<typeof UserSchema>) { ... }
 * ```
 */
import { safeGetMeta, safeDefineMeta, } from "../di/safe-reflect.js";
import { METADATA_KEY } from "../constants.js";
import type { ValidationMetadata } from "../di/tokens.js";

export function Validate(options: ValidationMetadata): any {
	return (...args: any[]): void => {
		// Standard decorator mode (TC39): args = (target, context)
		if (args.length >= 2 && typeof args[1] === "object" && args[1]?.kind === "method") {
			const [, context] = args as [object, DecoratorContext];
			const target = args[0];
			const ctor = typeof target === "function"
				? (target.prototype?.constructor ?? target)
				: (target as any)?.constructor;
			if (ctor) {
				safeDefineMeta(METADATA_KEY.VALIDATE, options, ctor, context.name as string);
			}
			return;
		}
		// Legacy decorator mode (experimentalDecorators): args = (target, propertyKey, descriptor)
		const target = args[0] as object;
		const propertyKey = args[1] as string | symbol;
		safeDefineMeta(
			METADATA_KEY.VALIDATE,
			options,
			(target as any)?.constructor ?? target,
			propertyKey,
		);
	};
}

export function getValidationMetadata(
	target: any,
	propertyKey: string | symbol,
): ValidationMetadata | undefined {
	return safeGetMeta(METADATA_KEY.VALIDATE, target, propertyKey);
}
