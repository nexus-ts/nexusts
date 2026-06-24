/**
 * Tests for cross-pod ResilienceStore implementations.
 * Uses only MemoryResilienceStore (no external deps) to test
 * the full store + CircuitBreaker sync integration.
 */
import { describe, it, expect, beforeEach } from "vitest";
import {
	MemoryResilienceStore,
	RedisResilienceStore,
	CircuitBreaker,
	ResilienceService,
} from "@nexusts/resilience";
import type { CircuitSnapshot } from "@nexusts/resilience";

// ---------------------------------------------------------------------------
// MemoryResilienceStore
// ---------------------------------------------------------------------------

describe("MemoryResilienceStore", () => {
	it("returns null for unknown circuit", async () => {
		const store = new MemoryResilienceStore();
		expect(await store.getSnapshot("unknown")).toBeNull();
	});

	it("saves and retrieves a snapshot", async () => {
		const store = new MemoryResilienceStore();
		const snap: CircuitSnapshot = {
			state: "open",
			openedAt: 100,
			failures: 5,
			successes: 2,
			updatedAt: 200,
		};
		await store.saveSnapshot("stripe", snap);
		const retrieved = await store.getSnapshot("stripe");
		expect(retrieved).toEqual(snap);
	});

	it("stores separate snapshots per circuit name", async () => {
		const store = new MemoryResilienceStore();
		await store.saveSnapshot("a", { state: "open", openedAt: 1, failures: 3, successes: 0, updatedAt: 10 });
		await store.saveSnapshot("b", { state: "closed", openedAt: 0, failures: 0, successes: 5, updatedAt: 20 });

		expect((await store.getSnapshot("a"))?.state).toBe("open");
		expect((await store.getSnapshot("b"))?.state).toBe("closed");
	});

	it("overwrites an existing snapshot", async () => {
		const store = new MemoryResilienceStore();
		await store.saveSnapshot("x", { state: "open", openedAt: 1, failures: 3, successes: 0, updatedAt: 10 });
		await store.saveSnapshot("x", { state: "closed", openedAt: 0, failures: 0, successes: 10, updatedAt: 20 });
		expect((await store.getSnapshot("x"))?.state).toBe("closed");
	});

	it("returns a copy — mutations don't affect the stored value", async () => {
		const store = new MemoryResilienceStore();
		const snap: CircuitSnapshot = { state: "open", openedAt: 1, failures: 2, successes: 1, updatedAt: 5 };
		await store.saveSnapshot("y", snap);
		// Mutate original
		snap.state = "closed";
		// Store should still have 'open'
		expect((await store.getSnapshot("y"))?.state).toBe("open");
	});
});

// ---------------------------------------------------------------------------
// RedisResilienceStore (mock client)
// ---------------------------------------------------------------------------

function makeRedisClient() {
	const data = new Map<string, string>();
	return {
		async get(key: string) { return data.get(key) ?? null; },
		async set(key: string, value: string) { data.set(key, value); },
		async del(key: string) { data.delete(key); return 1; },
		async close() {},
	};
}

describe("RedisResilienceStore", () => {
	it("returns null for unknown circuit", async () => {
		const store = new RedisResilienceStore(makeRedisClient());
		expect(await store.getSnapshot("unknown")).toBeNull();
	});

	it("saves and retrieves a snapshot via JSON", async () => {
		const store = new RedisResilienceStore(makeRedisClient());
		const snap: CircuitSnapshot = { state: "half-open", openedAt: 50, failures: 1, successes: 0, updatedAt: 60 };
		await store.saveSnapshot("payments", snap);
		const r = await store.getSnapshot("payments");
		expect(r).toEqual(snap);
	});

	it("respects custom keyPrefix", async () => {
		const client = makeRedisClient() as any;
		const orig = client.set.bind(client);
		const keys: string[] = [];
		client.set = async (k: string, v: string, opts?: any) => { keys.push(k); return orig(k, v, opts); };

		const store = new RedisResilienceStore(client, { keyPrefix: "app:cb:" });
		await store.saveSnapshot("db", { state: "open", openedAt: 0, failures: 0, successes: 0, updatedAt: 0 });
		expect(keys[0]).toBe("app:cb:db");
	});
});

// ---------------------------------------------------------------------------
// CircuitBreaker + Store — cross-pod sync integration
// ---------------------------------------------------------------------------

describe("CircuitBreaker cross-pod sync", () => {
	let store: MemoryResilienceStore;
	let cbA: CircuitBreaker;
	let cbB: CircuitBreaker;

	beforeEach(() => {
		store = new MemoryResilienceStore();

		cbA = new CircuitBreaker("external-api", { threshold: 0.5, minCalls: 2 });
		cbA._store = store;
		cbA._syncIntervalMs = 0; // always sync

		cbB = new CircuitBreaker("external-api", { threshold: 0.5, minCalls: 2 });
		cbB._store = store;
		cbB._syncIntervalMs = 0; // always sync
	});

	it("pod A opening circuit is visible to pod B on next execute()", async () => {
		// Force open on pod A — this saves to store
		cbA.forceOpen();
		// Pod B reads store before executing
		await expect(cbB.execute(() => Promise.resolve("ok"))).rejects.toThrow("open");
	});

	it("pod A closing circuit is visible to pod B", async () => {
		cbA.forceOpen();
		// pod B sees open
		await expect(cbB.execute(() => Promise.resolve("ok"))).rejects.toThrow("open");
		// pod A closes
		cbA.forceClose();
		// pod B should now be able to execute (store has 'closed')
		const result = await cbB.execute(() => Promise.resolve("recovered"));
		expect(result).toBe("recovered");
	});

	it("newer remote snapshot takes precedence over local open state", async () => {
		// cbA opens — this saves 'open' to the store with updatedAt=now
		cbA.forceOpen();

		// Simulate another pod (or admin) closing the circuit in the store
		// with a newer timestamp — injected AFTER forceOpen() to win the race
		await store.saveSnapshot("external-api", {
			state: "closed",
			openedAt: 0,
			failures: 0,
			successes: 0,
			updatedAt: Date.now() + 100, // 100 ms newer
		});

		// cbA.execute() syncs from store, sees 'closed', and lets the call through
		const result = await cbA.execute(() => Promise.resolve("ok"));
		expect(result).toBe("ok");
	});
});

// ---------------------------------------------------------------------------
// ResilienceService.setStore()
// ---------------------------------------------------------------------------

describe("ResilienceService.setStore()", () => {
	it("wires the store into all existing and future circuits", async () => {
		const svc = new ResilienceService({});
		const cb = svc.getOrCreateCircuit("svc-cb", { threshold: 0.5, minCalls: 2 });

		const store = new MemoryResilienceStore();
		svc.setStore(store);

		// Store should now be on cb
		expect(cb._store).toBe(store);

		// New circuits should also get the store
		const cb2 = svc.getOrCreateCircuit("svc-cb2");
		expect(cb2._store).toBe(store);
	});
});
