/**
 * Tests for DrizzleCacheStore.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { DrizzleService } from "../../src/drizzle/index.js";
import { DrizzleCacheStore } from "../../src/cache/stores/drizzle.js";

let hasBunSqlite = false;
try {
	require("bun:sqlite");
	hasBunSqlite = true;
} catch (err) {
	void err;
}

const describeIf = hasBunSqlite ? describe : describe.skip;

describeIf("DrizzleCacheStore (real SQLite)", () => {
	let svc: DrizzleService;
	let store: DrizzleCacheStore;

	beforeEach(async () => {
		svc = new DrizzleService({
			dialect: "sqlite",
			connection: { filename: ":memory:" },
		});
		await svc.open();
		await svc.raw`CREATE TABLE nexus_cache (
			key TEXT PRIMARY KEY,
			value TEXT NOT NULL,
			expires_at TEXT,
			created_at TEXT NOT NULL,
			updated_at TEXT NOT NULL
		)`.execute();
		await svc.raw`CREATE TABLE nexus_cache_tags (
			tag TEXT NOT NULL,
			key TEXT NOT NULL,
			PRIMARY KEY (tag, key)
		)`.execute();
		store = new DrizzleCacheStore(svc);
	});

	afterEach(async () => {
		await svc.close();
	});

	it("get/set round trip with JSON", async () => {
		await store.set("user:1", { name: "Alice", age: 30 });
		const v = await store.get<{ name: string; age: number }>("user:1");
		expect(v).toEqual({ name: "Alice", age: 30 });
	});

	it("returns undefined for missing keys", async () => {
		expect(await store.get("missing")).toBeUndefined();
	});

	it("respects TTL (lazy expiry on get)", async () => {
		await store.set("k1", "v", { ttl: 1 });
		expect(await store.get("k1")).toBe("v");
		await new Promise((r) => setTimeout(r, 1100));
		expect(await store.get("k1")).toBeUndefined();
	});

	it("upsert overwrites existing value", async () => {
		await store.set("k1", "first");
		await store.set("k1", "second");
		expect(await store.get("k1")).toBe("second");
	});

	it("delete() returns true on existing, false on missing", async () => {
		await store.set("k1", "v");
		expect(await store.delete("k1")).toBe(true);
		expect(await store.delete("k1")).toBe(false);
	});

	it("clear() with no arg wipes everything", async () => {
		await store.set("a", 1);
		await store.set("b", 2);
		const n = await store.clear();
		expect(n).toBe(2);
		expect(await store.get("a")).toBeUndefined();
	});

	it("clear() with glob pattern", async () => {
		await store.set("user:1", "a");
		await store.set("user:2", "b");
		await store.set("post:1", "c");
		const n = await store.clear("user:*");
		expect(n).toBe(2);
		expect(await store.get("user:1")).toBeUndefined();
		expect(await store.get("post:1")).toBe("c");
	});

	it("wrap() caches and returns on hit", async () => {
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

	it("invalidateByTag() removes every key with the tag", async () => {
		await store.set("u1", { id: 1 }, { tags: ["users", "all"] });
		await store.set("u2", { id: 2 }, { tags: ["users"] });
		await store.set("p1", { id: 1 }, { tags: ["posts"] });
		const n = await store.invalidateByTag("users");
		expect(n).toBe(2);
		expect(await store.get("u1")).toBeUndefined();
		expect(await store.get("u2")).toBeUndefined();
		expect(await store.get("p1")).toBeDefined();
	});

	it("invalidateByTag() returns 0 when no keys match", async () => {
		const n = await store.invalidateByTag("nope");
		expect(n).toBe(0);
	});

	it("invalidateByTag() cleans up the tag index", async () => {
		await store.set("u1", 1, { tags: ["users"] });
		await store.invalidateByTag("users");
		await store.set("u2", 2, { tags: ["users"] });
		await store.invalidateByTag("users");
		// Re-setting and re-invalidating should not double-count.
		const n = await store.invalidateByTag("users");
		expect(n).toBe(0);
	});

	it("gc() removes expired entries", async () => {
		await store.set("k1", "v", { ttl: 1 });
		await store.set("k2", "v2", { ttl: 600 });
		await new Promise((r) => setTimeout(r, 1100));
		const n = await store.gc();
		expect(n).toBeGreaterThanOrEqual(1);
		expect(await store.get("k1")).toBeUndefined();
		expect(await store.get("k2")).toBe("v2");
	});
});

describe("DrizzleCacheStore options", () => {
	it("respects custom table names", () => {
		const fakeDb = {
			rawQuery: async () => [],
		} as any;
		const store = new DrizzleCacheStore(fakeDb, {
			tableName: "my_cache",
			tagsTableName: "my_cache_tags",
		});
		expect(store).toBeInstanceOf(DrizzleCacheStore);
		// Indirect test: the store is constructed without error.
	});
});
