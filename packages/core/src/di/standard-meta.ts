/**
 * Standard metadata helpers — dual-mode (TC39 + legacy) metadata storage.
 *
 * The TC39 standard decorator API provides `context.metadata`, a shared
 * object across all decorators on a class. However, Bun 1.3.x doesn't
 * assign it to `Class[Symbol.metadata]`, so class decorators store a
 * reference on the constructor as `Class.__nexus_meta__`.
 *
 * These helpers abstract the storage/retrieval so decorator files don't
 * duplicate the dual-mode logic.
 */
import { safeGetMeta, safeHasMeta, } from "./safe-reflect.js";

/** Property name on the constructor that holds the metadata object. */
export const META_PROP = "__nexus_meta__";

// ---- Storage helpers for decorators ----

/**
 * Initialize `__nexus_meta__` on a class constructor with the shared
 * metadata object. Safe to call multiple times (no-op after first).
 *
 * Should be called by class-level decorators (`@Controller`, `@Module`,
 * `@Injectable`) in standard mode.
 */
export function initNexusMeta(cls: Function, meta: object): void {
	if ((cls as any)[META_PROP]) return;
	Object.defineProperty(cls, META_PROP, {
		value: meta,
		writable: true,
		configurable: true,
		enumerable: false,
	});
}

// ---- Retrieval helpers for the framework ----

/**
 * Read metadata stored by a decorator. Checks (in order):
 * 1. `Class.__nexus_meta__` (standard decorator)
 * 2. `Reflect.getMetadata` (legacy decorator)
 */
export function getMeta(target: any, key: string | symbol): any {
	// Standard: __nexus_meta__
	if (typeof target === "function" && (target as any)[META_PROP]) {
		const meta = (target as any)[META_PROP];
		if (key in meta) return meta[key];
	}
	// Legacy: reflect-metadata
	return safeGetMeta(key, target);
}

/**
 * Check if metadata exists for a key.
 */
export function hasMeta(target: any, key: string | symbol): boolean {
	if (typeof target === "function" && (target as any)[META_PROP]) {
		if (key in (target as any)[META_PROP]) return true;
	}
	return safeHasMeta(key, target);
}