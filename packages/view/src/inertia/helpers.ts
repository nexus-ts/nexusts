/**
 * Inertia.js lazy-evaluation helpers.
 *
 * These wrap a callback so the framework can decide *when* to resolve
 * it:
 *
 * - `defer()`        → resolved on a follow-up partial reload only.
 * - `always()`       → included in every partial reload, never trimmed.
 * - `optional()`     → skipped on partial reloads when empty.
 * - `merge()`        → client merges new value with previous.
 * - `deepMerge()`    → client deep-merges new value with previous.
 * - `once()`         → included only on first page load.
 *
 * Each helper is a thin wrapper class with a discriminator tag. The
 * adapter inspects the tag to decide the correct serialization behaviour.
 */

/** Common shape for all Inertia helper wrappers. */
export interface InertiaHelper<T = any> {
	/** Discriminator tag — read by the adapter, never sent to the client. */
	readonly __inertiaKind: string;
	/** Resolve the wrapped callback. */
	resolve(): T | Promise<T>;
}

/**
 * Deferred prop. The client receives a `null` placeholder initially and
 * issues a follow-up request to fetch the real value. Use for expensive
 * data that shouldn't block the initial render.
 */
export class DeferredProp<T = any> implements InertiaHelper<T> {
	readonly __inertiaKind = "deferred";

	constructor(
		private readonly callback: () => T | Promise<T>,
		/** Group name. Props in the same group resolve in one request. */
		public readonly group: string = "default",
	) {}

	resolve(): T | Promise<T> {
		return this.callback();
	}
}

/** Build a deferred prop. */
export function defer<T>(
	callback: () => T | Promise<T>,
	group: string = "default",
): DeferredProp<T> {
	return new DeferredProp(callback, group);
}

/**
 * Always-on prop. Included in *every* partial reload, regardless of the
 * client's `only` / `except` filter. Useful for data that nearly every
 * page needs (e.g. notification counts, current user).
 */
export class AlwaysProp<T = any> implements InertiaHelper<T> {
	readonly __inertiaKind = "always";
	constructor(private readonly callback: () => T | Promise<T>) {}
	resolve(): T | Promise<T> {
		return this.callback();
	}
}

export function always<T>(callback: () => T | Promise<T>): AlwaysProp<T> {
	return new AlwaysProp(callback);
}

/**
 * Optional prop. On partial reloads, omitted when the resolved value is
 * an array shorter than or equal to `threshold` (default 0). Helps
 * reduce response size when the user is filtering down to zero results.
 */
export class OptionalProp<T = any> implements InertiaHelper<T> {
	readonly __inertiaKind = "optional";
	constructor(
		private readonly callback: () => T | Promise<T>,
		public readonly threshold: number = 0,
	) {}
	resolve(): T | Promise<T> {
		return this.callback();
	}
}

export function optional<T>(
	callback: () => T | Promise<T>,
	threshold: number = 0,
): OptionalProp<T> {
	return new OptionalProp(callback, threshold);
}

/**
 * Merge prop. The client merges the new value with its previous value,
 * which is essential for infinite-scroll pagination (append rather
 * than replace).
 */
export class MergeProp<T = any> implements InertiaHelper<T> {
	readonly __inertiaKind = "merge";
	/**
	 * When provided, the client uses these paths to identify matching
	 * items between the old and new arrays. Each inner array is a list of
	 * property names whose combined values are compared.
	 */
	public readonly matchPropsOn: string[][];

	constructor(callback: () => T | Promise<T>, matchPropsOn: string[][] = []) {
		this.matchPropsOn = matchPropsOn;
		this.callback = callback;
	}

	private callback: () => T | Promise<T>;
	resolve(): T | Promise<T> {
		return this.callback();
	}
}

export function merge<T>(
	callback: () => T | Promise<T>,
	matchPropsOn: string[][] = [],
): MergeProp<T> {
	return new MergeProp(callback, matchPropsOn);
}

/**
 * Deep-merge prop. Like `merge`, but the client performs a recursive
 * object merge instead of array deduplication.
 */
export class DeepMergeProp<T = any> implements InertiaHelper<T> {
	readonly __inertiaKind = "deepMerge";
	constructor(private readonly callback: () => T | Promise<T>) {}
	resolve(): T | Promise<T> {
		return this.callback();
	}
}

export function deepMerge<T>(callback: () => T | Promise<T>): DeepMergeProp<T> {
	return new DeepMergeProp(callback);
}

/**
 * Once prop. Resolved and included only on the very first page load;
 * subsequent partial reloads never include it.
 */
export class OnceProp<T = any> implements InertiaHelper<T> {
	readonly __inertiaKind = "once";
	constructor(private readonly callback: () => T | Promise<T>) {}
	resolve(): T | Promise<T> {
		return this.callback();
	}
}

export function once<T>(callback: () => T | Promise<T>): OnceProp<T> {
	return new OnceProp(callback);
}

/**
 * Lazy prop. Resolved on every response (just like a plain prop), but
 * with two important differences:
 *
 * 1. The factory is invoked only once per request — even if multiple
 *    keys point at the same factory or the same prop is referenced
 *    elsewhere on the page. The adapter keys the cache on
 *    `LazyProp.tag`, so two `lazy()` calls with the same tag share
 *    their resolved value.
 * 2. Resolutions run alongside other lazy props so independent work
 *    can overlap.
 *
 * Use this for any expensive computation you don't want to repeat
 * within a single request, but that should not be deferred to a
 * follow-up partial reload.
 */
export class LazyProp<T = any> implements InertiaHelper<T> {
	readonly __inertiaKind = "lazy";
	/** Cache key used by the adapter to deduplicate. */
	readonly tag: string;
	/** Increments on every resolve() — useful for tests / observability. */
	invocations = 0;

	constructor(
		private readonly callback: () => T | Promise<T>,
		tag?: string,
	) {
		this.tag = tag ?? `lazy:${Math.random().toString(36).slice(2)}`;
	}

	resolve(): T | Promise<T> {
		this.invocations++;
		return this.callback();
	}
}

/** Build a lazy prop. Two calls with the same `tag` share their value. */
export function lazy<T>(
	callback: () => T | Promise<T>,
	tag?: string,
): LazyProp<T> {
	return new LazyProp(callback, tag);
}

/**
 * Type guard: check whether a value is any Inertia helper wrapper.
 */
export function isInertiaHelper(value: unknown): value is InertiaHelper {
	return (
		value !== null &&
		typeof value === "object" &&
		typeof (value as any).__inertiaKind === "string" &&
		typeof (value as any).resolve === "function"
	);
}

/**
 * Strip helper wrappers from a props object, returning a plain
 * `{ [helperKind]: string[] }` map of which keys were wrapped and how.
 */
export interface PropAnnotation {
	/** Map of helperKind → array of prop keys. */
	byKind: Record<string, string[]>;
	/** Optional config extracted per prop (e.g. merge matchPropsOn). */
	configs: Record<string, InertiaHelper>;
}

export function annotateProps(props: Record<string, any>): PropAnnotation {
	const byKind: Record<string, string[]> = {};
	const configs: Record<string, InertiaHelper> = {};

	for (const [key, value] of Object.entries(props)) {
		if (isInertiaHelper(value)) {
			const kind = value.__inertiaKind;
			byKind[kind] ??= [];
			byKind[kind].push(key);
			configs[key] = value;
		}
	}

	return { byKind, configs };
}
