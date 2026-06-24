/**
 * Tests for DrizzleRateLimitStorage.
 */

import "reflect-metadata";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DrizzleService } from "../../src/drizzle/index.js";
import { DrizzleRateLimitStorage } from "../../src/limiter/backends/drizzle.js";
import { LimiterService } from "../../src/limiter/limiter.service.js";

let hasBunSqlite = false;
try {
	require("bun:sqlite");
	hasBunSqlite = true;
} catch (err) {
	void err;
}

const describeIf = hasBunSqlite ? describe : describe.skip;

describeIf("DrizzleRateLimitStorage (real SQLite)", () => {
	let svc: DrizzleService;
	let storage: DrizzleRateLimitStorage;

	beforeEach(async () => {
		svc = new DrizzleService({
			dialect: "bun-sqlite",
			connection: { filename: ":memory:" },
		});
		await svc.open();
		await svc.raw`CREATE TABLE nexus_rate_limits (
			key TEXT PRIMARY KEY,
			strategy TEXT NOT NULL,
			max_points INTEGER NOT NULL,
			points INTEGER NOT NULL DEFAULT 0,
			reset_at TEXT,
			log TEXT
		)`.execute();
		storage = new DrizzleRateLimitStorage(svc);
	});

	afterEach(async () => {
		await svc.close();
	});

	it("consume() allows within limit and rejects beyond", async () => {
		const r1 = await storage.consume("k1", 1, 2, 60_000, "sliding-window");
		const r2 = await storage.consume("k1", 1, 2, 60_000, "sliding-window");
		const r3 = await storage.consume("k1", 1, 2, 60_000, "sliding-window");
		expect(r1.allowed).toBe(true);
		expect(r2.allowed).toBe(true);
		expect(r3.allowed).toBe(false);
	});

	it("reset() clears state", async () => {
		await storage.consume("k1", 1, 1, 60_000, "sliding-window");
		await storage.reset("k1");
		const r = await storage.consume("k1", 1, 1, 60_000, "sliding-window");
		expect(r.allowed).toBe(true);
	});

	it("works with LimiterService", async () => {
		const limiter = new LimiterService({
			storage,
			rules: [{ path: "**", points: 2, duration: 60_000 }],
		});
		const a = await limiter.check("ip:1.1.1.1", {
			path: "**",
			points: 2,
			duration: 60_000,
		});
		const b = await limiter.check("ip:1.1.1.1", {
			path: "**",
			points: 2,
			duration: 60_000,
		});
		const c = await limiter.check("ip:1.1.1.1", {
			path: "**",
			points: 2,
			duration: 60_000,
		});
		expect(a.allowed).toBe(true);
		expect(b.allowed).toBe(true);
		expect(c.allowed).toBe(false);
	});
});
