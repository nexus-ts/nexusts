/**
 * `nexusjs/cache` — application-level caching.
 *
 * Two backends ship out of the box:
 *   - `MemoryStore`  — single-process LRU with TTL eviction
 *   - `RedisStore`   — multi-pod via ioredis (peer dep, optional)
 *
 *   const cache = new CacheService({ store: new MemoryStore({ max: 10_000 }) });
 *   await cache.set('user:42', user, 60);     // 60-second TTL
 *   const u = await cache.get<User>('user:42');
 *
 * Decorators are also provided for service methods:
 *
 *   @Cacheable('user', (id: string) => id, 60)
 *   async findById(id: string) { ... }
 */

import { METADATA_KEY } from "@nexusts/core";
import { safeGetMeta, safeDefineMeta, safeHasMeta } from "@nexusts/core/di/safe-reflect";

/** A single cache entry. */
export interface CacheEntry<T = unknown> {
	value: T;
	/** Unix-ms timestamp when this entry expires. 0 = never. */
	expiresAt: number;
	/** Stash tags for invalidation. */
	tags?: string[];
}

/** Storage backend for cache entries. */
export interface CacheStore {
	readonly kind: string;
	/** Get a value. Returns `undefined` if missing or expired. */
	get<T = unknown>(key: string): Promise<T | undefined>;
	/** Set a value with optional TTL (seconds) and tags. */
	set<T = unknown>(
		key: string,
		value: T,
		opts?: CacheSetOptions,
	): Promise<void>;
	/** Delete a single key. */
	delete(key: string): Promise<boolean>;
	/** Delete every key matching `pattern` (glob: `*`, `**`). */
	clear(pattern?: string): Promise<number>;
	/** Wrap a function with cache-or-compute semantics. */
	wrap<T>(key: string, fn: () => Promise<T>, ttl?: number): Promise<T>;
	/**
	 * Remove every entry tagged with `tag`. Backends without a tag
	 * index (e.g. MemoryStore) return 0.
	 */
	invalidateByTag?(tag: string): Promise<number>;
	/** Sweep expired entries. Backends without a sweep loop return 0. */
	gc?(): Promise<number>;
	/** Optional: free resources. */
	close?(): Promise<void>;
}

/** Options for `set()`. */
export interface CacheSetOptions {
	/** Time-to-live in seconds. 0 = forever. */
	ttl?: number;
	/** Tags for grouped invalidation. */
	tags?: string[];
}

export interface CacheConfig {
	/**
	 * Shorthand backend selector. When set, an appropriate store is
	 * created automatically — no need to pass `store` explicitly.
	 *   - `'memory'` (default) — in-process LRU
	 *   - `'redis'` — requires `redis` config field
	 */
	backend?: "memory" | "redis";
	/**
	 * Redis connection options — used when `backend: 'redis'`.
	 * Passed directly to `createRedisClient()` from `@nexusts/redis`.
	 */
	redis?: {
		url?: string;
		host?: string;
		port?: number;
		password?: string;
		db?: number;
		/** Key prefix for the underlying RedisCacheStore. Default: "cache:". */
		keyPrefix?: string;
	};
	/** Explicit store instance. Overrides `backend` when provided. */
	store?: CacheStore;
	/** Default TTL in seconds when none is provided. Default: 60. */
	defaultTtl?: number;
	/** Prefix prepended to all keys. Default: 'nexusjs'. */
	prefix?: string;
}

/** Internal metadata key. */
export const CACHEABLE_META = "nexus:cache:cacheable";
export const CACHE_INVALIDATE_META = "nexus:cache:invalidate";

/** @Cacheable decorator. Caches the result of a method. */
export function Cacheable(
	prefix: string,
	keyFn: (...args: any[]) => string,
	ttlSeconds = 60,
): MethodDecorator {
	return (
		target: any,
		propertyKey: string | symbol,
		descriptor: PropertyDescriptor,
	) => {
		const existing: CacheableSpec[] =
			safeGetMeta(CACHEABLE_META, target.constructor) ?? [];
		existing.push({
			prefix,
			keyFn,
			ttl: ttlSeconds,
			propertyKey,
			original: descriptor.value,
		});
		safeDefineMeta(CACHEABLE_META, existing, target.constructor);
	};
}

/** @CacheInvalidate decorator. Removes matching keys after a method runs. */
export function CacheInvalidate(
	prefix: string,
	keyFn: (...args: any[]) => string,
): MethodDecorator {
	return (
		target: any,
		propertyKey: string | symbol,
		descriptor: PropertyDescriptor,
	) => {
		const existing: CacheInvalidateSpec[] =
			safeGetMeta(CACHE_INVALIDATE_META, target.constructor) ?? [];
		existing.push({ prefix, keyFn, propertyKey, original: descriptor.value });
		safeDefineMeta(CACHE_INVALIDATE_META, existing, target.constructor);
	};
}

export interface CacheableSpec {
	prefix: string;
	keyFn: (...args: any[]) => string;
	ttl: number;
	propertyKey: string | symbol;
	original: (...args: any[]) => any;
}

export interface CacheInvalidateSpec {
	prefix: string;
	keyFn: (...args: any[]) => string;
	propertyKey: string | symbol;
	original: (...args: any[]) => any;
}

export function getCacheableSpecs(target: any): CacheableSpec[] {
	return safeGetMeta(CACHEABLE_META, target) ?? [];
}
export function getCacheInvalidateSpecs(target: any): CacheInvalidateSpec[] {
	return safeGetMeta(CACHE_INVALIDATE_META, target) ?? [];
}

export { METADATA_KEY };
