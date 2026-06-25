import "reflect-metadata";
/**
 * Safe reflect wrappers — allows code to work with or without
 * `reflect-metadata` being loaded.
 *
 * In standard decorator mode, the framework uses `context.metadata`
 * and `Symbol.metadata` (via `__nexus_meta__`) instead of
 * `Reflect.getMetadata` / `Reflect.defineMetadata`, so these
 * wrappers are only needed for the legacy fallback path.
 *
 * When reflect-metadata is NOT loaded, the legacy fallback is
 * silently skipped (no-op), which is correct: standard decorator
 * code paths handle everything.
 */

/** Safely read metadata. Returns undefined when reflect-metadata is absent. */
export function safeGetMeta(key: any, target: any, prop?: any): any {
	try {
		if (typeof Reflect.getMetadata === "function") {
			return prop !== undefined
				? Reflect.getMetadata(key, target, prop)
				: Reflect.getMetadata(key, target);
		}
	} catch {
		// reflect-metadata not loaded
	}
	return undefined;
}

/** Safely define metadata. No-op when reflect-metadata is absent. */
export function safeDefineMeta(key: any, value: any, target: any, prop?: any): void {
	try {
		if (typeof Reflect.defineMetadata === "function") {
			if (prop !== undefined) {
				Reflect.defineMetadata(key, value, target, prop);
			} else {
				Reflect.defineMetadata(key, value, target);
			}
		}
	} catch {
		// reflect-metadata not loaded
	}
}

/** Safely check metadata existence. Returns false when reflect-metadata is absent. */
export function safeHasMeta(key: any, target: any): boolean {
	try {
		if (typeof Reflect.hasMetadata === "function") {
			return Reflect.hasMetadata(key, target);
		}
	} catch {
		// reflect-metadata not loaded
	}
	return false;
}

/**
 * Get design:paramtypes from a class constructor.
 * Returns empty array when reflect-metadata is absent.
 */
export function safeParamTypes(target: any): any[] {
	try {
		if (typeof Reflect.getMetadata === "function") {
			return Reflect.getOwnMetadata("design:paramtypes", target) ?? [];
		}
	} catch {
		// reflect-metadata not loaded
	}
	return [];
}