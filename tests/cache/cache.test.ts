/**
 * Tests for nexus/cache.
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
	CacheService,
	MemoryStore,
	Cacheable,
	CacheInvalidate,
	getCacheableSpecs,
	getCacheInvalidateSpecs,
} from "@nexusts/cache";

describe("MemoryStore", () => {
	let store: MemoryStore;
	beforeEach(() => {
		store = new MemoryStore({ max: 100, sweepIntervalMs: 0 });
	});

	it("get/set round trip", async () => {
		await store.set("k1", { a: 1 });
		const v = await store.get<{ a: number }>("k1");
		expect(v).toEqual({ a: 1 });
	});

	it("returns undefined for missing keys", async () => {
		expect(await store.get("missing")).toBeUndefined();
	});

	it("respects TTL", async () => {
		await store.set("k1", "v", { ttl: 1 });
		expect(await store.get("k1")).toBe("v");
		await new Promise((r) => setTimeout(r, 1100));
		expect(await store.get("k1")).toBeUndefined();
	});

	it("delete() removes the key", async () => {
		await store.set("k1", "v");
		expect(await store.delete("k1")).toBe(true);
		expect(await store.get("k1")).toBeUndefined();
	});

	it("clear() with no arg wipes everything", async () => {
		await store.set("a", 1);
		await store.set("b", 2);
		const n = await store.clear();
		expect(n).toBe(2);
		expect(await store.get("a")).toBeUndefined();
		expect(await store.get("b")).toBeUndefined();
	});

	it("clear() with glob removes matching keys", async () => {
		await store.set("user:1", "a");
		await store.set("user:2", "b");
		await store.set("post:1", "c");
		const n = await store.clear("user:*");
		expect(n).toBe(2);
		expect(await store.get("user:1")).toBeUndefined();
		expect(await store.get("post:1")).toBe("c");
	});

	it("evicts LRU entries when max is reached", async () => {
		const small = new MemoryStore({ max: 3, sweepIntervalMs: 0 });
		await small.set("a", 1);
		await small.set("b", 2);
		await small.set("c", 3);
		await small.get("a"); // touch
		await small.set("d", 4); // evicts b
		expect(await small.get("a")).toBe(1);
		expect(await small.get("b")).toBeUndefined();
		expect(await small.get("c")).toBe(3);
		expect(await small.get("d")).toBe(4);
		await small.close();
	});

	it("wrap() caches and returns", async () => {
		let calls = 0;
		const fn = async () => {
			calls++;
			return { x: calls };
		};
		const a = await store.wrap("k1", fn, 60);
		const b = await store.wrap("k1", fn, 60);
		expect(a).toEqual({ x: 1 });
		expect(b).toEqual({ x: 1 });
		expect(calls).toBe(1);
	});
});

describe("CacheService", () => {
	let cache: CacheService;
	beforeEach(() => {
		cache = new CacheService({ prefix: "test" });
	});

	it("prefixes keys", async () => {
		await cache.set("k1", "v");
		// Use direct store access to verify prefixing.
		const direct = await cache.store.get<unknown>("test:k1");
		expect(direct).toBe("v");
	});

	it("clear() respects the prefix", async () => {
		await cache.set("user:1", "a");
		await cache.set("user:2", "b");
		const n = await cache.clear("user:*");
		expect(n).toBe(2);
	});

	it("invalidateByTag() is a no-op for the in-memory store", async () => {
		const n = await cache.invalidateByTag("anything");
		expect(n).toBe(0);
	});
});

describe("@Cacheable decorator", () => {
	it("stores CacheableSpec metadata on the class", () => {
		class UserService {
			// oxlint-disable-next-line no-unused-vars
			constructor(private db: any = null) {}
			@Cacheable("user", (id: string) => id, 60)
			async findById(id: string) {
				return { id };
			}
		}
		const specs = getCacheableSpecs(UserService);
		expect(specs).toHaveLength(1);
		expect(specs[0]?.prefix).toBe("user");
		expect(specs[0]?.ttl).toBe(60);
	});
});

describe("@CacheInvalidate decorator", () => {
	it("stores CacheInvalidateSpec metadata on the class", () => {
		class UserService {
			@CacheInvalidate("user", (id: string) => id)
			async deleteById(id: string) {
				return id;
			}
		}
		const specs = getCacheInvalidateSpecs(UserService);
		expect(specs).toHaveLength(1);
		expect(specs[0]?.prefix).toBe("user");
	});
});

describe("applyDecorators (wiring)", () => {
	it("caches the result of @Cacheable methods", async () => {
		class UserService {
			calls = 0;
			@Cacheable("user", (id: string) => id, 60)
			async findById(id: string) {
				this.calls++;
				return { id, n: this.calls };
			}
		}
		const cache = new CacheService({ prefix: "t1" });
		const svc = new UserService();
		cache.applyDecorators(svc);
		const a = await svc.findById("42");
		const b = await svc.findById("42");
		expect(a).toEqual({ id: "42", n: 1 });
		expect(b).toEqual({ id: "42", n: 1 });
		expect(svc.calls).toBe(1);
	});

	it("invalidates matching keys after @CacheInvalidate", async () => {
		class UserService {
			@Cacheable("user", (id: string) => id, 60)
			async findById(id: string) {
				return { id };
			}
			@CacheInvalidate("user", (id: string) => id)
			async deleteById(id: string) {
				return id;
			}
		}
		const cache = new CacheService({ prefix: "t2" });
		const svc = new UserService();
		cache.applyDecorators(svc);
		await svc.findById("42"); // populate cache
		await svc.deleteById("42"); // invalidate
		const a2 = await svc.findById("42"); // should re-compute
		expect(a2).toEqual({ id: "42" });
	});
});
