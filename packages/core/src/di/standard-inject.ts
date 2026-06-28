/**
 * Standard decorators for DI — works with TC39 stage-3 decorators.
 *
 * These replace the legacy `@Injectable()` and `@Inject()` parameter
 * decorators that depend on `reflect-metadata` and `design:paramtypes`.
 *
 * ## Storage approach
 *
 * Bun 1.3.14+ passes `context.metadata` to standard decorators, but does
 * NOT assign it to `Class[Symbol.metadata]`. So we store a reference to
 * the metadata object on the constructor itself as `Class.__nexus_meta__`.
 *
 * DUAL-MODE: Detects the runtime decorator context type:
 * - **Standard mode** (context present, context.kind exists) → stores on
 *   `context.metadata` + copies to `target.__nexus_meta__`
 * - **Legacy mode** → falls back to `Reflect.defineMetadata`
 *
 * ## Usage
 *
 * ```ts
 * @Injectable()
 * class UserService {
 *   @Inject(DatabaseService) userService!: DatabaseService;
 * }
 * ```
 */
import { safeGetMeta, safeDefineMeta, safeHasMeta, } from "./safe-reflect.js";
import { METADATA_KEY } from "../constants.js";

// ---- Runtime metadata key (stored on constructor) ----

/**
 * Property name on the constructor that holds the metadata object.
 * We use a non-enumerable string property instead of Symbol.metadata
 * because Bun 1.3.x doesn't assign Symbol.metadata to classes.
 */
const META_PROP = "__nexus_meta__";

// ---- Well-known symbol keys inside the metadata object ----

/** Symbol key: marks a class as injectable. */
export const INJECTABLE_KEY = Symbol.for("nexus:injectable");

/** Symbol key: stores the DI scope (singleton/request/transient). */
export const SCOPE_KEY = Symbol.for("nexus:di:scope");

/** Symbol key: stores field injection map (fieldName → token). */
export const FIELDS_KEY = Symbol.for("nexus:inject:fields");

// ---- Types ----

export type InjectableScope = "singleton" | "request" | "transient";

export interface InjectableOptions {
	scope?: InjectableScope;
}

// ---- Internal helpers ----

/**
 * Given a class constructor, return the metadata object.
 * Checks: __nexus_meta__ > Symbol.metadata > empty object.
 */
function getMeta(target: any): Record<string | symbol, any> {
	// Our custom property
	if (target[META_PROP]) return target[META_PROP] as Record<string | symbol, any>;
	// Symbol.metadata (Bun may support it in the future)
	try {
		const sm = (Symbol as any).metadata as symbol;
		if (target[sm]) return target[sm] as Record<string | symbol, any>;
	} catch {
		// ignore
	}
	return {};
}

// ---- Injectable class decorator ----

/**
 * Standard `@Injectable()` decorator — dual-mode (legacy + standard).
 *
 * @example
 * ```ts
 * @Injectable()
 * class UserService {}
 *
 * @Injectable({ scope: 'request' })
 * class RequestContext {}
 * ```
 */
export function Injectable(options: InjectableOptions = {}): any {
	return function (this: any, target: any, context?: any): void {
		// ── Standard decorator mode (TC39) ──
		if (context?.metadata) {
			context.metadata[INJECTABLE_KEY] = true;
			if (options.scope) {
				context.metadata[SCOPE_KEY] = options.scope;
			}
			// Copy metadata to the constructor because Bun doesn't assign
			// Symbol.metadata to the class after decoration.
			if (typeof target === "function") {
				Object.defineProperty(target, META_PROP, {
					value: context.metadata,
					writable: true,
					configurable: true,
					enumerable: false,
				});
			}
			return;
		}

		// ── Legacy decorator mode: use reflect-metadata ──
		if (typeof target === "function") {
			safeDefineMeta(METADATA_KEY.INJECTABLE, true, target);
			if (options.scope) {
				safeDefineMeta("nexus:di:scope", options.scope, target);
			}
			return;
		}
	};
}

// ---- Inject field decorator ----

/**
 * Standard `@Inject(token)` field decorator — dual-mode.
 *
 * Stores the injection token for the decorated field.
 * The DI container reads this after construction to set field values.
 *
 * In standard mode (TC39), detects field vs parameter by `context.kind`.
 * In legacy mode, falls back to ParameterDecorator behavior.
 *
 * @example
 * ```ts
 * class UserService {
 *   @Inject('CONFIG') config!: AppConfig;
 *   @Inject(DatabaseService) db!: DatabaseService;
 * }
 * ```
 */
export function Inject(token: any): any {
	return function (this: any, target: any, context?: any): void {
		// ── Standard decorator mode (TC39) ──
		if (context?.kind === "field" && context?.metadata) {
			const key =
				typeof context.name === "symbol"
					? context.name
					: String(context.name);
			const fields: Record<string | symbol, any> =
				(context.metadata[FIELDS_KEY] as Record<string | symbol, any>) ?? {};
			fields[key] = token;
			context.metadata[FIELDS_KEY] = fields;
			return;
		}

		// ── Legacy property decorator mode ──
		// (experimentalDecorators: true, @Inject on a field)
		// target = prototype, context = propertyKey (string | symbol)
		if (typeof context === "string" || typeof context === "symbol") {
			const cls = target?.constructor;
			if (cls) {
				const key =
					typeof context === "symbol"
						? context
						: String(context);
				const existing: Record<string | symbol, any> =
					safeGetMeta(FIELDS_KEY, cls) ?? {};
				existing[key] = token;
				safeDefineMeta(FIELDS_KEY, existing, cls);
			}
			return;
		}

		// ── Legacy mode: ParameterDecorator ──
		const parameterIndex = arguments[2] as number | undefined;
		if (parameterIndex === undefined) return;

		const key = target; // target is prototype (method) or class (constructor)

		const existing: Map<number, any> =
			safeGetMeta(METADATA_KEY.INJECT, key) ?? new Map();
		existing.set(parameterIndex, token);
		safeDefineMeta(METADATA_KEY.INJECT, existing, key);
		return;
	};
}

// ---- Helpers ----

/**
 * Check if a class is marked as @Injectable.
 * Checks __nexus_meta__, then Symbol.metadata, then reflect-metadata.
 */
export function isInjectableStandard(target: any): boolean {
	try {
		if (getMeta(target)[INJECTABLE_KEY]) return true;
	} catch {
		// ignore
	}
	try {
		if (safeHasMeta(METADATA_KEY.INJECTABLE, target)) return true;
	} catch {
		// reflect-metadata may not be loaded
	}
	return false;
}

/**
 * Get the DI scope from a class.
 */
export function getScope(target: any): InjectableScope | undefined {
	try {
		const s = getMeta(target)[SCOPE_KEY] as InjectableScope | undefined;
		if (s) return s;
	} catch {
		// ignore
	}
	try {
		const s = safeGetMeta("nexus:di:scope", target) as
			| InjectableScope
			| undefined;
		if (s) return s;
	} catch {
		// ignore
	}
	return undefined;
}

/**
 * Get the field injection map from a class.
 * Returns `{ [fieldName]: token }` or empty object.
 *
 * Reads from __nexus_meta__ (standard decorator) or Symbol.metadata.
 */
export function getFieldInjections(
	target: any,
): Record<string | symbol, any> {
	try {
		// Standard: __nexus_meta__ or Symbol.metadata
		const meta = getMeta(target);
		const fields = meta[FIELDS_KEY] as
			| Record<string | symbol, any>
			| undefined;
		if (fields && Object.keys(fields).length > 0) return fields;
	} catch {
		// ignore
	}
	try {
		// Legacy: reflect-metadata (stored by @Inject in legacy property decorator mode)
		const fields = safeGetMeta(FIELDS_KEY, target) as
			| Record<string | symbol, any>
			| undefined;
		if (fields) return fields;
	} catch {
		// ignore
	}
	return {};
}