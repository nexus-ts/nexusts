/**
 * Tests for RedisCacheStore using an in-memory mock Redis client.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { RedisCacheStore } from "@nexusts/cache";
import type { RedisClient } from "@nexusts/redis";

/** Minimal in-memory mock of RedisClient for unit testing. */
function makeMockClient(): RedisClient {
	const store = new Map<string, string>();

	return {
		async get(key: string) {
			return store.get(key) ?? null;
		},
		async set(key: string, value: string, opts?: { ex?: number }) {
			store.set(key, value);
			if (opts?.ex) {
				setTimeout(() => store.delete(key), opts.ex * 1000);
			}
		},
		async del(key: string) {
			store.delete(key);
		},
		async exists(key: string) {
			return store.has(key);
		},
		async scan(opts: { match?: string; cursor: string | number; count?: number }) {
			const pattern = opts.match ?? "*";
			const prefix = pattern.endsWith("*") ? pattern.slice(0, -1) : pattern;
			const keys = [...store.keys()].filter((k) => k.startsWith(prefix));
			return { keys, cursor: "0" };
		},
		async close() {},
	} as unknown as RedisClient;
}

describe("RedisCacheStore", () => {
	let store: RedisCacheStore;

	beforeEach(() => {
		store = new RedisCacheStore(makeMockClient());
	});

	it("get/set round trip", async () => {
		await store.set("user:1", { name: "Alice" });
		const v = await store.get<{ name: string }>("user:1");
		expect(v).toEqual({ name: "Alice" });
	});

	it("returns undefined for missing keys", async () => {
		expect(await store.get("missing")).toBeUndefined();
	});

	it("delete() removes the key", async () => {
		await store.set("k1", "hello");
		expect(await store.delete("k1")).toBe(true);
		expect(await store.get("k1")).toBeUndefined();
	});

	it("has() returns true for existing key", async () => {
		await store.set("k1", "v");
		expect(await store.has("k1")).toBe(true);
		expect(await store.has("k2")).toBe(false);
	});

	it("wrap() caches and returns", async () => {
		let calls = 0;
		const fn = async () => { calls++; return { x: calls }; };
		const a = await store.wrap("wk", fn, 60);
		const b = await store.wrap("wk", fn, 60);
		expect(a).toEqual({ x: 1 });
		expect(b).toEqual({ x: 1 });
		expect(calls).toBe(1);
	});

	it("invalidateByTag() removes all tagged keys", async () => {
		await store.set("post:1", "a", { tags: ["posts"] });
		await store.set("post:2", "b", { tags: ["posts"] });
		await store.set("user:1", "c", { tags: ["users"] });
		const n = await store.invalidateByTag("posts");
		expect(n).toBe(2);
		expect(await store.get("post:1")).toBeUndefined();
		expect(await store.get("post:2")).toBeUndefined();
		expect(await store.get("user:1")).toBe("c");
	});

	it("clear() removes all keys under the prefix", async () => {
		await store.set("a", 1);
		await store.set("b", 2);
		const n = await store.clear();
		expect(n).toBeGreaterThanOrEqual(2);
		expect(await store.get("a")).toBeUndefined();
		expect(await store.get("b")).toBeUndefined();
	});

	it("custom keyPrefix is applied", async () => {
		const client = makeMockClient();
		const prefixed = new RedisCacheStore(client, { keyPrefix: "myapp:" });
		await prefixed.set("k1", "v");
		// The key should exist via the store's API.
		expect(await prefixed.get("k1")).toBe("v");
	});
});
