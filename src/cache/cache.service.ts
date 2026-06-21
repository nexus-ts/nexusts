/**
 * `CacheService` — main entry point for caching.
 *
 *   const cache = new CacheService({ store: new MemoryStore() });
 *   await cache.set('user:42', user, { ttl: 60 });
 *   const u = await cache.get<User>('user:42');
 *
 * Provides:
 *   - `get`, `set`, `delete`, `clear` — direct key operations
 *   - `wrap` — cache-or-compute
 *   - `getOrSet` — alias for wrap with a default TTL
 *   - `invalidateByTag`, `invalidateByPrefix` — bulk removal
 *   - `applyDecorators(target)` — wires @Cacheable / @CacheInvalidate
 *     onto an existing service instance.
 */
import { Inject, Injectable } from "../core/decorators/index.js";
import { MemoryStore } from "./stores/memory.js";
import type { CacheConfig, CacheStore } from "./types.js";
import {
	getCacheableSpecs,
	getCacheInvalidateSpecs,
} from "./types.js";

@Injectable()
export class CacheService {
	/** DI token. */
	static readonly TOKEN = Symbol.for("nexus:CacheService");

	store: CacheStore;
	defaultTtl: number;
	prefix: string;

	constructor(@Inject("CACHE_CONFIG") config: CacheConfig = {}) {
		this.store = config.store ?? new MemoryStore();
		this.defaultTtl = config.defaultTtl ?? 60;
		this.prefix = config.prefix ?? "nexus";
	}

	private key(k: string): string {
		return `${this.prefix}:${k}`;
	}

	async get<T = unknown>(k: string): Promise<T | undefined> {
		return this.store.get<T>(this.key(k));
	}

	async set<T = unknown>(k: string, value: T, ttl?: number): Promise<void>;
	async set<T = unknown>(k: string, value: T, opts: { ttl?: number; tags?: string[] }): Promise<void>;
	async set<T = unknown>(
		k: string,
		value: T,
		optsOrTtl: number | { ttl?: number; tags?: string[] } = this.defaultTtl,
	): Promise<void> {
		const opts =
			typeof optsOrTtl === "number"
				? { ttl: optsOrTtl }
				: { ttl: optsOrTtl.ttl ?? this.defaultTtl, tags: optsOrTtl.tags };
		await this.store.set<T>(this.key(k), value, opts);
	}

	async delete(k: string): Promise<boolean> {
		return this.store.delete(this.key(k));
	}

	async clear(pattern?: string): Promise<number> {
		return this.store.clear(pattern ? `${this.prefix}:${pattern}` : undefined);
	}

	/** Get or compute-and-store. */
	async wrap<T>(k: string, fn: () => Promise<T>, ttl?: number): Promise<T> {
		return this.store.wrap<T>(this.key(k), fn, ttl ?? this.defaultTtl);
	}

	/**
	 * Tag-based invalidation. Delegates to the underlying store.
	 * Stores without a tag index (the default `MemoryStore`) return 0.
	 * Use `DrizzleCacheStore` (or implement `invalidateByTag` on a
	 * custom store) for true tag-based removal.
	 */
	async invalidateByTag(tag: string): Promise<number> {
		if (typeof (this.store as any).invalidateByTag === "function") {
			return await (this.store as any).invalidateByTag(this.prefixedTag(tag));
		}
		return 0;
	}

	/** Sweep expired entries. No-op on stores that don't implement `gc()`. */
	async gc(): Promise<number> {
		if (typeof this.store.gc === "function") {
			return await this.store.gc();
		}
		return 0;
	}

	/** Apply the configured prefix to a tag name. */
	private prefixedTag(tag: string): string {
		return `${this.prefix}:${tag}`;
	}

	/**
	 * Apply @Cacheable / @CacheInvalidate decorators to an existing service
	 * instance. The framework's DI container does this automatically.
	 */
	applyDecorators(target: any): void {
		const ctor = target.constructor;
		const cacheables = getCacheableSpecs(ctor);
		for (const spec of cacheables) {
			const original = spec.original;
			(target as any)[spec.propertyKey] = async (...args: any[]) => {
				const subKey = spec.keyFn(...args);
				return this.wrap(`${spec.prefix}:${subKey}`, () =>
					original.apply(target, args),
				);
			};
		}
		const invalidates = getCacheInvalidateSpecs(ctor);
		for (const spec of invalidates) {
			const original = spec.original;
			(target as any)[spec.propertyKey] = async (...args: any[]) => {
				const result = await original.apply(target, args);
				const subKey = spec.keyFn(...args);
				await this.clear(`${spec.prefix}:${subKey}*`);
				return result;
			};
		}
	}
}
