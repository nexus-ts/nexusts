/**
 * @Injectable decorator.
 *
 * Marks a class as available for DI. The container uses reflect-metadata's
 * `design:paramtypes` to read constructor parameter types and resolve them
 * automatically.
 *
 * @example
 * ```ts
 * @Injectable()
 * class UserService {
 *   constructor(private repo: UserRepository) {}
 * }
 *
 * @Injectable({ scope: 'request' })
 * class RequestContext {
 *   @Inject(REQUEST) declare private req: any;
 * }
 * ```
 */
import { safeGetMeta, safeDefineMeta, safeHasMeta, } from "../di/safe-reflect.js";
import { METADATA_KEY } from "../constants.js";
import { FIELDS_KEY } from "../di/standard-inject.js";

export interface InjectableOptions {
	scope?: "singleton" | "request" | "transient";
}

export function Injectable(options: InjectableOptions = {}): ClassDecorator {
	return (target: object) => {
		safeDefineMeta(METADATA_KEY.INJECTABLE, true, target);
		if (options.scope) {
			safeDefineMeta(
				"nexus:di:scope",
				options.scope,
				target,
			);
		}
	};
}

export function isInjectable(target: any): boolean {
	return safeHasMeta(METADATA_KEY.INJECTABLE, target);
}

/**
 * Read the scope declared on a class via `@Injectable({ scope })`.
 * Returns undefined when no scope is declared (defaults to singleton).
 */
export function getScope(
	target: any,
): "singleton" | "request" | "transient" | undefined {
	return safeGetMeta("nexus:di:scope", target);
}

/**
 * Mark a parameter as resolved by a specific token instead of its declared
 * type. Useful for interfaces, abstract classes, or string tokens.
 *
 * Works as both a parameter decorator (constructor injection) and
 * a property decorator (field injection in standard mode).
 *
 * @example
 * ```ts
 * // Constructor parameter injection (legacy)
 * constructor(@Inject('CONFIG') private config: AppConfig) {}
 *
 * // Field injection (standard decorators, v0.9+)
 * @Inject('CONFIG') declare config: AppConfig;
 * ```
 */
export function Inject<_T = any>(token: any): any {
	return (
		target: object,
		propertyKey: string | symbol | undefined,
		parameterIndex?: number,
	) => {
		// Property decorator mode: @Inject(Token) on a class field
		// (parameterIndex is undefined, propertyKey is the field name)
		if (
			parameterIndex === undefined &&
			(typeof propertyKey === "string" || typeof propertyKey === "symbol")
		) {
			const cls =
				typeof target === "function" ? target : (target as any)?.constructor;
			if (cls) {
				const key =
					typeof propertyKey === "symbol"
						? propertyKey
						: String(propertyKey);
				const existing: Record<string | symbol, any> =
					safeGetMeta(FIELDS_KEY, cls) ?? {};
				existing[key] = token;
				safeDefineMeta(FIELDS_KEY, existing, cls);
			}
			return;
		}

		// Parameter decorator mode: constructor(@Inject(Token) private svc: T)
		const idx = parameterIndex as number;
		const existing: Map<number, any> =
			safeGetMeta(METADATA_KEY.INJECT, target) ?? new Map();
		existing.set(idx, token);
		safeDefineMeta(METADATA_KEY.INJECT, existing, target);
	};
}