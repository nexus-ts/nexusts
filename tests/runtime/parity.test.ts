/**
 * Runtime adapter parity tests.
 *
 * Validates that the same API surface works across runtimes.
 * Runs on both Bun and Node.js — Bun-specific code paths are guarded
 * by `isBun` checks; CF Workers paths use a mock KV namespace.
 */
import { describe, it, expect } from "vitest";
import {
	createRedisClient,
	detectRedisRuntime,
	MemoryRedisAdapter,
	CloudflareKVAdapter,
} from "@nexusts/redis";

const isBun = typeof Bun !== "undefined";

// ---------------------------------------------------------------------------
// detectRedisRuntime()
// ---------------------------------------------------------------------------

describe("detectRedisRuntime()", () => {
	it("returns a known adapter kind", () => {
		const kind = detectRedisRuntime();
		expect(["bun", "node", "cloudflare", "memory"]).toContain(kind);
	});

	it("returns 'bun' when running under Bun", () => {
		if (!isBun) return; // skip on Node.js
		expect(detectRedisRuntime()).toBe("bun");
	});

	it("returns 'node' or 'memory' when running under Node.js", () => {
		if (isBun) return; // skip on Bun
		// 'node' if ioredis is installed, 'memory' otherwise
		const kind = detectRedisRuntime();
		expect(["node", "memory"]).toContain(kind);
	});
});

// ---------------------------------------------------------------------------
// MemoryRedisAdapter — universal parity baseline
// ---------------------------------------------------------------------------

describe("MemoryRedisAdapter — API parity baseline", () => {
	it("get / set / del round-trip", async () => {
		const client = new MemoryRedisAdapter();
		await client.set("k", "v");
		expect(await client.get("k")).toBe("v");
		await client.del("k");
		expect(await client.get("k")).toBeNull();
	});

	it("exists() returns true for known keys", async () => {
		const client = new MemoryRedisAdapter();
		await client.set("x", "1");
		expect(await client.exists("x")).toBe(true);
		expect(await client.exists("y")).toBe(false);
	});

	it("incr() increments and returns the new value", async () => {
		const client = new MemoryRedisAdapter();
		expect(await client.incr("counter")).toBe(1);
		expect(await client.incr("counter")).toBe(2);
		expect(await client.incr("counter", 5)).toBe(7);
	});

	it("set() with { nx } only sets if key does not exist", async () => {
		const client = new MemoryRedisAdapter();
		await client.set("once", "first");
		await client.set("once", "second", { nx: true });
		expect(await client.get("once")).toBe("first");
	});

	it("scan() iterates over keys", async () => {
		const client = new MemoryRedisAdapter();
		await client.set("a:1", "1");
		await client.set("a:2", "2");
		await client.set("b:1", "3");

		const result = await client.scan({ match: "a:*" });
		expect(result.keys).toHaveLength(2);
		expect(result.keys.sort()).toEqual(["a:1", "a:2"]);
	});

	it("createRedisClient({ adapter: 'memory' }) returns a MemoryRedisAdapter", async () => {
		const client = createRedisClient({ adapter: "memory" });
		expect(client.adapter).toBe("memory");
		await client.set("hello", "world");
		expect(await client.get("hello")).toBe("world");
	});
});

// ---------------------------------------------------------------------------
// CloudflareKVAdapter — parity via mock KV namespace
// ---------------------------------------------------------------------------

/** Minimal mock that matches the KVNamespaceLike interface. */
function makeMockKV() {
	const store = new Map<string, string>();
	return {
		async get(key: string) { return store.get(key) ?? null; },
		async put(key: string, value: string) { store.set(key, value); },
		async delete(key: string) { store.delete(key); },
		async list(opts?: { prefix?: string; cursor?: string }) {
			const prefix = opts?.prefix ?? "";
			const keys = [...store.keys()]
				.filter((k) => k.startsWith(prefix))
				.map((name) => ({ name }));
			return { keys, list_complete: true, cursor: undefined };
		},
	};
}

describe("CloudflareKVAdapter — API parity (mock KV)", () => {
	it("get / set / del round-trip", async () => {
		const client = new CloudflareKVAdapter({ kv: makeMockKV() as any });
		await client.set("k", "hello");
		expect(await client.get("k")).toBe("hello");
		await client.del("k");
		expect(await client.get("k")).toBeNull();
	});

	it("exists() returns correct boolean", async () => {
		const client = new CloudflareKVAdapter({ kv: makeMockKV() as any });
		await client.set("exist", "1");
		expect(await client.exists("exist")).toBe(true);
		expect(await client.exists("missing")).toBe(false);
	});

	it("adapter kind is 'cloudflare'", () => {
		const client = new CloudflareKVAdapter({ kv: makeMockKV() as any });
		expect(client.adapter).toBe("cloudflare");
	});

	it("scan() lists keys with prefix match", async () => {
		const client = new CloudflareKVAdapter({ kv: makeMockKV() as any });
		await client.set("user:1", "a");
		await client.set("user:2", "b");
		await client.set("post:1", "c");
		const result = await client.scan({ match: "user:*" });
		expect(result.keys.sort()).toEqual(["user:1", "user:2"]);
	});
});
