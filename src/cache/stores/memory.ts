/**
 * In-memory LRU cache store with TTL eviction.
 *
 * Simple and fast; not cluster-safe. Use `RedisStore` for shared state
 * across multiple Bun processes.
 */
import type { CacheEntry, CacheSetOptions, CacheStore } from "../types.js";

export interface MemoryStoreOptions {
	/** Maximum number of entries. Default: 10_000. */
	max?: number;
	/** Sweep interval for expired entries. Default: 30_000 ms. 0 = no sweep. */
	sweepIntervalMs?: number;
}

export class MemoryStore implements CacheStore {
	readonly kind = "memory";
	private data = new Map<string, CacheEntry>();
	private readonly max: number;
	private sweepTimer: ReturnType<typeof setInterval> | null = null;

	constructor(opts: MemoryStoreOptions = {}) {
		this.max = opts.max ?? 10_000;
		const sweepMs = opts.sweepIntervalMs ?? 30_000;
		if (sweepMs > 0) {
			this.sweepTimer = setInterval(() => this.sweepExpired(), sweepMs);
			// Don't keep the event loop alive for the sweep timer.
			if (typeof this.sweepTimer === "object" && this.sweepTimer !== null) {
				(this.sweepTimer as any).unref?.();
			}
		}
	}

	async get<T = unknown>(key: string): Promise<T | undefined> {
		const e = this.data.get(key);
		if (!e) return undefined;
		if (e.expiresAt > 0 && e.expiresAt <= Date.now()) {
			this.data.delete(key);
			return undefined;
		}
		// Touch for LRU.
		this.data.delete(key);
		this.data.set(key, e);
		return e.value as T;
	}

	async set<T = unknown>(
		key: string,
		value: T,
		opts: CacheSetOptions = {},
	): Promise<void> {
		const ttl = opts.ttl ?? 0;
		const entry: CacheEntry<T> = {
			value,
			expiresAt: ttl > 0 ? Date.now() + ttl * 1000 : 0,
			tags: opts.tags,
		};
		// Insert (and possibly evict).
		if (!this.data.has(key) && this.data.size >= this.max) {
			// Evict oldest (first key in iteration order).
			const oldest = this.data.keys().next().value;
			if (oldest !== undefined) this.data.delete(oldest);
		}
		this.data.set(key, entry);
	}

	async delete(key: string): Promise<boolean> {
		return this.data.delete(key);
	}

	async clear(pattern?: string): Promise<number> {
		if (!pattern) {
			const n = this.data.size;
			this.data.clear();
			return n;
		}
		const rx = globToRegExp(pattern);
		let n = 0;
		for (const k of [...this.data.keys()]) {
			if (rx.test(k)) {
				this.data.delete(k);
				n++;
			}
		}
		return n;
	}

	async wrap<T>(key: string, fn: () => Promise<T>, ttl?: number): Promise<T> {
		const v = await this.get<T>(key);
		if (v !== undefined) return v;
		const result = await fn();
		await this.set(key, result, { ttl });
		return result;
	}

	async close(): Promise<void> {
		if (this.sweepTimer) clearInterval(this.sweepTimer);
		this.sweepTimer = null;
		this.data.clear();
	}

	private sweepExpired(): void {
		const now = Date.now();
		for (const [k, e] of this.data.entries()) {
			if (e.expiresAt > 0 && e.expiresAt <= now) this.data.delete(k);
		}
	}
}

function globToRegExp(pattern: string): RegExp {
	return new RegExp(
		"^" +
			pattern
				.replace(/[.+^${}()|[\]\\]/g, "\\$&")
				.replace(/\*\*/g, "::DBL::")
				.replace(/\*/g, "[^:]+")
				.replace(/::DBL::/g, ".*") +
			"$",
	);
}
