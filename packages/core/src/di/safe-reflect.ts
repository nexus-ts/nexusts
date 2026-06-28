/**
 * Safe reflect wrappers — provides a lightweight inline polyfill for
 * the Reflect Metadata API. No external `reflect-metadata` package
 * needed.
 *
 * In standard decorator mode (v0.9+), the framework uses
 * `context.metadata` (via `__nexus_meta__`) instead of Reflect.
 * These wrappers are only needed for the legacy fallback path.
 *
 * The inline polyfill covers the subset of Reflect Metadata that
 * TypeScript's `__metadata` helper and the framework's legacy paths
 * actually use. It is ~2KB gzipped vs ~16KB for the full npm package.
 */

// ── Inline Reflect Metadata polyfill ─────────────────────────────
// Provides the methods that TypeScript's `__metadata` helper and
// legacy decorator code expect on the global `Reflect` object.
// No external package needed.

if (typeof Reflect !== "undefined" && typeof (Reflect as any).metadata !== "function") {
	// Use a fallbackId-based Map instead of WeakMap because Bun's WeakMap
	// restricts keys to objects-only (primitives crash). Classes and
	// prototypes may be represented as numeric IDs.
	const metadataStore = new Map<string, any>();
	let metaId = 0;

	function targetId(target: any): string {
		if (target === null || target === undefined) return "__null__";
		if (typeof target === "object" || typeof target === "function") {
			return (target as any).__nexus_reflect_id ?? (() => {
				const id = `__r${++metaId}__`;
				Object.defineProperty(target, "__nexus_reflect_id", {
					value: id, writable: false, configurable: false, enumerable: false,
				});
				return id;
			})();
		}
		return `__${typeof target}:${String(target)}__`;
	}

	function metaKey(key: any, target: any, prop?: any): string {
		return `${String(key)}|${targetId(target)}|${prop !== undefined ? String(prop) : ""}`;
	}

	(Reflect as any).defineMetadata = (key: any, value: any, target: any, prop?: any): void => {
		metadataStore.set(metaKey(key, target, prop), value);
	};

	(Reflect as any).getMetadata = (key: any, target: any, prop?: any): any => metadataStore.get(metaKey(key, target, prop));

	(Reflect as any).getOwnMetadata = (key: any, target: any, prop?: any): any => (Reflect as any).getMetadata(key, target, prop);

	(Reflect as any).hasMetadata = (key: any, target: any, prop?: any): boolean => metadataStore.has(metaKey(key, target, prop));

	(Reflect as any).deleteMetadata = (key: any, target: any, prop?: any): boolean => metadataStore.delete(metaKey(key, target, prop));

	(Reflect as any).metadata = (key: any, value: any): Function => (target: any, prop?: any): void => {
			(Reflect as any).defineMetadata(key, value, target, prop);
		};
}

// Type declarations so TypeScript doesn't error.
declare namespace Reflect {
	function getMetadata(key: any, target: any, propertyKey?: string | symbol): any;
	function defineMetadata(key: any, value: any, target: any, propertyKey?: string | symbol): void;
	function hasMetadata(key: any, target: any, propertyKey?: string | symbol): boolean;
	function getOwnMetadata(key: any, target: any, propertyKey?: string | symbol): any;
	function deleteMetadata(key: any, target: any, propertyKey?: string | symbol): boolean;
	function decorate(decorators: any[], target: any, key?: any, desc?: any): any;
	function metadata(key: any, value: any): (target: any, propertyKey?: string | symbol) => void;
}

/**
 * Synchronous fallback: a Map-based metadata store (legacy path).
 */
const fallbackStore = new Map<string, any>();
let fallbackId = 0;

function keyId(key: any, target: any, prop?: any): string {
	if (target === null || target === undefined) {
		return `${String(key)}|__null__|${prop !== undefined ? String(prop) : ""}`;
	}
	const tid = (target as any)?.__fallback_id ?? (() => {
		const id = ++fallbackId;
		Object.defineProperty(target, "__fallback_id", {
			value: id,
			writable: false,
			configurable: false,
			enumerable: false,
		});
		return id;
	})();
	return `${String(key)}|${tid}|${prop !== undefined ? String(prop) : ""}`;
}

/** Safely read metadata. */
export function safeGetMeta(key: any, target: any, prop?: any): any {
	// Check fallback Map first (legacy cross-bundle bridge).
	const mapVal = fallbackStore.get(keyId(key, target, prop));
	if (mapVal !== undefined) return mapVal;
	const val = prop !== undefined
		? Reflect.getMetadata(key, target, prop)
		: Reflect.getMetadata(key, target);
	if (val !== undefined) return val;
	// Fallback: check __nexus_meta__ on the class (shared across bundles)
	if (typeof target === "function") {
		const clsMeta = (target as any).__nexus_meta__;
		if (clsMeta && key in clsMeta) {
			const val = clsMeta[key];
			if (prop !== undefined && val && typeof val === "object") {
				return (val as any)[prop];
			}
			return val;
		}
	}
	return undefined;
}

/** Safely define metadata. */
export function safeDefineMeta(key: any, value: any, target: any, prop?: any): void {
	// Store in fallback Map for legacy readers.
	fallbackStore.set(keyId(key, target, prop), value);
	// Store on __nexus_meta__ for cross-bundle consistency.
	if (typeof target === "function") {
		let meta = (target as any).__nexus_meta__;
		if (!meta) {
			meta = {};
			Object.defineProperty(target, "__nexus_meta__", {
				value: meta, writable: true, configurable: true, enumerable: false,
			});
		}
		if (prop !== undefined) {
			if (!meta[key]) meta[key] = {};
			meta[key][prop] = value;
		} else {
			meta[key] = value;
		}
	}
	// Store on Reflect (inline polyfill is always available).
	if (prop !== undefined) {
		Reflect.defineMetadata(key, value, target, prop);
	} else {
		Reflect.defineMetadata(key, value, target);
	}
}

/** Safely check metadata existence. */
export function safeHasMeta(key: any, target: any): boolean {
	if (fallbackStore.has(keyId(key, target))) return true;
	return Reflect.hasMetadata(key, target);
}

/**
 * Get design:paramtypes from a class constructor.
 */
export function safeParamTypes(target: any): any[] {
	return Reflect.getOwnMetadata("design:paramtypes", target) ?? [];
}
