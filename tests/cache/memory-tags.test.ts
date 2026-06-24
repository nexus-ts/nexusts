/**
 * Tests for MemoryStore's tag-based invalidation.
 */

import "reflect-metadata";
import { beforeEach, describe, expect, it } from "vitest";
import { MemoryStore } from "../../src/cache/stores/memory.js";

describe("MemoryStore invalidateByTag", () => {
	let store: MemoryStore;
	beforeEach(() => {
		store = new MemoryStore({ max: 100, sweepIntervalMs: 0 });
	});

	it("removes every key tagged with the given tag", async () => {
		await store.set("u1", { id: 1 }, { tags: ["users", "all"] });
		await store.set("u2", { id: 2 }, { tags: ["users"] });
		await store.set("p1", { id: 1 }, { tags: ["posts"] });
		const n = await store.invalidateByTag("users");
		expect(n).toBe(2);
		expect(await store.get("u1")).toBeUndefined();
		expect(await store.get("u2")).toBeUndefined();
		expect(await store.get("p1")).toBeDefined();
	});

	it("returns 0 when no keys match the tag", async () => {
		expect(await store.invalidateByTag("nothing")).toBe(0);
	});

	it("cleans up the tag index after invalidation", async () => {
		await store.set("u1", 1, { tags: ["users"] });
		await store.invalidateByTag("users");
		// Re-set the same key + tag; invalidation should still work.
		await store.set("u1", 2, { tags: ["users"] });
		const n = await store.invalidateByTag("users");
		expect(n).toBe(1);
	});

	it("removes a key from all tag indexes on delete()", async () => {
		await store.set("k1", 1, { tags: ["a", "b", "c"] });
		await store.delete("k1");
		expect(await store.invalidateByTag("a")).toBe(0);
		expect(await store.invalidateByTag("b")).toBe(0);
		expect(await store.invalidateByTag("c")).toBe(0);
	});

	it("removes tag associations on clear()", async () => {
		await store.set("u1", 1, { tags: ["users"] });
		await store.clear("u*");
		expect(await store.invalidateByTag("users")).toBe(0);
	});
});
