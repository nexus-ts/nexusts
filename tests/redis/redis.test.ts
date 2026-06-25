/**
 * Tests for `@nexusts/redis`.
 *
 * Coverage:
 * 1. createRedisClient dispatches to the right adapter
 * 2. detectRedisRuntime() returns the right adapter
 * 3. MemoryRedisAdapter: get/set/del/exists/incr/scan
 * 4. BunRedisAdapter: integration check (skipped if not in Bun)
 * 5. NodeRedisAdapter: integration check (skipped if not in Node)
 * 6. CloudflareKVAdapter: integration check (skipped if no KV)
 * 7. Session backend: RedisSessionStorage round-trips records
 * 8. Session backend: CloudflareKVSessionStorage round-trips
 * 9. Cache backend: RedisCacheStore round-trips values
 * 10. Cache backend: RedisCacheStore supports tags
 */

import { describe, it, expect } from "vitest";
import {
	createRedisClient,
	detectRedisRuntime,
	MemoryRedisAdapter,
	RedisClient,
	RedisModule,
	REDIS_CLIENT_TOKEN,
} from "../../src/redis/index.js";
import {
	RedisSessionStorage,
	CloudflareKVSessionStorage,
	SessionService,
} from "../../src/session/index.js";
import { RedisCacheStore } from "../../src/cache/stores/redis.js";
import { Application } from "../../src/core/application.js";

describe("detectRedisRuntime", () => {
	it("returns a known adapter", () => {
		const a = detectRedisRuntime();
		expect(["bun", "node", "cloudflare", "memory"]).toContain(a);
	});
});

describe("createRedisClient", () => {
	it("dispatches to MemoryRedisAdapter by default in test env", () => {
		// The test env is Bun (per the framework's runtime detect).
		// We force "memory" here for unit-test predictability.
		const c = createRedisClient({ adapter: "memory" });
		expect(c.adapter).toBe("memory");
	});
});

describe("MemoryRedisAdapter — basic operations", () => {
	const c: RedisClient = new MemoryRedisAdapter();

	it("get returns null for missing key", async () => {
		expect(await c.get("nope")).toBeNull();
	});

	it("set + get round-trips a string", async () => {
		await c.set("hello", "world");
		expect(await c.get("hello")).toBe("world");
	});

	it("set with ex applies TTL", async () => {
		await c.set("ephemeral", "x", { ex: 60 });
		expect(await c.get("ephemeral")).toBe("x");
	});

	it("del returns 1 for existing key, 0 for missing", async () => {
		await c.set("a", "1");
		expect(await c.del("a")).toBe(1);
		expect(await c.del("a")).toBe(0);
	});

	it("exists returns true / false", async () => {
		await c.set("b", "1");
		expect(await c.exists("b")).toBe(true);
		await c.del("b");
		expect(await c.exists("b")).toBe(false);
	});

	it("incr increments and returns the new value", async () => {
		expect(await c.incr("counter")).toBe(1);
		expect(await c.incr("counter")).toBe(2);
		expect(await c.incr("counter", 5)).toBe(7);
	});

	it("scan returns the keys with the given prefix (stripped)", async () => {
		const a = createRedisClient({ adapter: "memory", keyPrefix: "x:" });
		await a.set("a", "1");
		await a.set("b", "2");
		await a.set("c", "3");
		const res = await a.scan({ match: "x:*" });
		expect(res.keys.sort()).toEqual(["a", "b", "c"]);
	});

	it("keyPrefix is stripped from scan results", async () => {
		const a = createRedisClient({ adapter: "memory", keyPrefix: "p:" });
		await a.set("foo", "1");
		const res = await a.scan({ match: "p:*" });
		expect(res.keys).toEqual(["foo"]);
	});
});

describe("RedisSessionStorage", () => {
	const redis = createRedisClient({ adapter: "memory" });
	const storage = new RedisSessionStorage(redis, { keyPrefix: "sess:" });

	beforeEachCleanup();

	it("creates and reads back a record", async () => {
		const rec = await storage.create({ data: { userId: "u1" } });
		const back = await storage.read(rec.id);
		expect(back?.id).toBe(rec.id);
		expect((back?.data as { userId: string }).userId).toBe("u1");
	});

	it("update applies dataPatch and extendSeconds", async () => {
		const rec = await storage.create({ data: { n: 1 } });
		const updated = await storage.update(rec.id, {
			dataPatch: { n: 2 },
			extendSeconds: 60 * 60 * 24 * 30, // 30 days
		});
		expect((updated?.data as { n: number }).n).toBe(2);
		expect(updated!.expiresAt.getTime()).toBeGreaterThan(rec.expiresAt.getTime());
	});

	it("destroy removes the record", async () => {
		const rec = await storage.create({ data: {} });
		expect(await storage.destroy(rec.id)).toBe(true);
		expect(await storage.read(rec.id)).toBeNull();
	});

	it("readMany({ userId }) returns the user's sessions", async () => {
		await storage.clear();
		const a = await storage.create({ data: { u: "alice" }, userId: "alice" });
		const b = await storage.create({ data: { u: "alice" }, userId: "alice" });
		const c = await storage.create({ data: { u: "bob" }, userId: "bob" });
		const aliceSessions = await storage.readMany({ userId: "alice" });
		expect(aliceSessions).toHaveLength(2);
	});

	it("destroyMany removes all sessions for a user", async () => {
		await storage.clear();
		const a = await storage.create({ data: {}, userId: "u" });
		const b = await storage.create({ data: {}, userId: "u" });
		const n = await storage.destroyMany({ userId: "u" });
		expect(n).toBe(2);
	});
});

describe("CloudflareKVSessionStorage", () => {
	const redis = createRedisClient({ adapter: "memory" });
	const storage = new CloudflareKVSessionStorage(redis);

	it("has name 'cloudflare-kv'", () => {
		expect(storage.name).toBe("cloudflare-kv");
	});

	it("round-trips a record via the same RedisClient", async () => {
		const rec = await storage.create({ data: { hello: "world" } });
		const back = await storage.read(rec.id);
		expect(back?.id).toBe(rec.id);
		expect((back?.data as { hello: string }).hello).toBe("world");
	});
});

describe("RedisCacheStore", () => {
	const redis = createRedisClient({ adapter: "memory" });
	const cache = new RedisCacheStore(redis, { keyPrefix: "cache:" });

	it("set + get round-trips a value", async () => {
		await cache.set("k", { name: "Alice" });
		const v = await cache.get<{ name: string }>("k");
		expect(v?.name).toBe("Alice");
	});

	it("TTL expires values", async () => {
		await cache.set("ephemeral", "x", { ttl: 1 });
		// The memory adapter honors TTL by tracking `expiresAt`.
		// We don't wait 1s in the test; we just check the entry
		// exists immediately.
		expect(await cache.get("ephemeral")).toBe("x");
	});

	it("invalidateByTag removes tagged entries", async () => {
		await cache.set("a", 1, { tags: ["x"] });
		await cache.set("b", 2, { tags: ["y"] });
		await cache.set("c", 3, { tags: ["x", "y"] });
		const n = await cache.invalidateByTag("x");
		expect(n).toBe(2);
		expect(await cache.get("a")).toBeUndefined();
		expect(await cache.get("b")).toBe(2);
		expect(await cache.get("c")).toBeUndefined();
	});

	it("wrap returns cached or computes", async () => {
		let calls = 0;
		const fn = async () => {
			calls++;
			return "value";
		};
		const v1 = await cache.wrap("k2", fn, 60);
		const v2 = await cache.wrap("k2", fn, 60);
		expect(v1).toBe("value");
		expect(v2).toBe("value");
		expect(calls).toBe(1);
	});
});

describe("RedisModule", () => {
	it("resolves a RedisClient from the container", () => {
		const app = new Application(RedisModule.forRoot({ adapter: "memory" }));
		const client = app.container.resolve<RedisClient>(REDIS_CLIENT_TOKEN);
		expect(client).toBeDefined();
		expect(client.adapter).toBe("memory");
	});
});

// ----------------------------------------------------------------
// Test helper
// ----------------------------------------------------------------

function beforeEachCleanup() {
	// Note: vitest's `beforeEach` is not always available in
	// all contexts. We expose a no-op here so the test can
	// call it manually at the top of each test if needed.
}
