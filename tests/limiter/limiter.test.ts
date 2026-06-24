/**
 * Tests for nexus/limiter.
 */

import "reflect-metadata";
import { Hono } from "hono";
import { beforeEach, describe, expect, it } from "vitest";
import { MemoryRateLimitStorage } from "../../src/limiter/backends/memory.js";
import { LimiterMiddleware } from "../../src/limiter/limiter.middleware.js";
import { LimiterService } from "../../src/limiter/limiter.service.js";
import type { RateLimitRule } from "../../src/limiter/types.js";
import { durationToMs } from "../../src/limiter/types.js";

describe("durationToMs", () => {
	it("converts shorthand", () => {
		expect(durationToMs("1s")).toBe(1_000);
		expect(durationToMs("5m")).toBe(5 * 60_000);
		expect(durationToMs("2h")).toBe(2 * 3_600_000);
		expect(durationToMs("1d")).toBe(86_400_000);
	});
	it("returns raw numbers as-is", () => {
		expect(durationToMs(7500)).toBe(7_500);
	});
	it("throws on bad input", () => {
		expect(() => durationToMs("bogus" as any)).toThrow();
	});
});

describe("MemoryRateLimitStorage · fixed-window", () => {
	let storage: MemoryRateLimitStorage;
	beforeEach(() => {
		storage = new MemoryRateLimitStorage();
	});

	it("allows up to `limit` requests", async () => {
		const r1 = await storage.consume("k1", 1, 3, 60_000, "fixed-window");
		const r2 = await storage.consume("k1", 1, 3, 60_000, "fixed-window");
		const r3 = await storage.consume("k1", 1, 3, 60_000, "fixed-window");
		const r4 = await storage.consume("k1", 1, 3, 60_000, "fixed-window");
		expect(r1.allowed).toBe(true);
		expect(r2.allowed).toBe(true);
		expect(r3.allowed).toBe(true);
		expect(r4.allowed).toBe(false);
	});

	it("tracks remaining count", async () => {
		const r = await storage.consume("k1", 1, 5, 60_000, "fixed-window");
		expect(r.remaining).toBe(4);
		expect(r.limit).toBe(5);
	});
});

describe("MemoryRateLimitStorage · sliding-window", () => {
	let storage: MemoryRateLimitStorage;
	beforeEach(() => {
		storage = new MemoryRateLimitStorage();
	});

	it("rejects the (limit+1)-th call", async () => {
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
});

describe("MemoryRateLimitStorage · token-bucket", () => {
	let storage: MemoryRateLimitStorage;
	beforeEach(() => {
		storage = new MemoryRateLimitStorage();
	});

	it("starts with full bucket and decrements", async () => {
		const r1 = await storage.consume("k1", 1, 5, 60_000, "token-bucket");
		expect(r1.allowed).toBe(true);
		expect(r1.remaining).toBe(4);
		const r2 = await storage.consume("k1", 1, 5, 60_000, "token-bucket");
		expect(r2.allowed).toBe(true);
		expect(r2.remaining).toBe(3);
	});

	it("exhausts when consuming more than the limit", async () => {
		await storage.consume("k1", 5, 5, 60_000, "token-bucket");
		const r = await storage.consume("k1", 1, 5, 60_000, "token-bucket");
		expect(r.allowed).toBe(false);
	});
});

describe("LimiterService + LimiterMiddleware (Hono integration)", () => {
	function buildApp(svc: LimiterService) {
		const mw = new LimiterMiddleware(svc);
		const app = new Hono();
		app.use("/*", mw.middleware());
		app.get("/api/users", (c) => c.text("ok"));
		app.post("/login", (c) => c.text("ok"));
		return app;
	}

	it("rejects when rule limits are exceeded", async () => {
		const rule: RateLimitRule = {
			path: "/api/*",
			points: 1,
			duration: 60_000,
		};
		const svc = new LimiterService({
			rules: [rule],
			storage: new MemoryRateLimitStorage(),
		});
		const app = buildApp(svc);
		const r1 = await app.request("http://x/api/users");
		expect(r1.status).toBe(200);
		const r2 = await app.request("http://x/api/users");
		expect(r2.status).toBe(429);
		expect(r2.headers.get("Retry-After")).toBeTruthy();
		expect(r2.headers.get("X-RateLimit-Limit")).toBe("1");
	});

	it("emits X-RateLimit-* headers on success", async () => {
		const svc = new LimiterService({
			rules: [{ path: "**", points: 5, duration: 60_000 }],
			storage: new MemoryRateLimitStorage(),
		});
		const app = buildApp(svc);
		const r = await app.request("http://x/api/users");
		expect(r.status).toBe(200);
		expect(r.headers.get("X-RateLimit-Limit")).toBe("5");
		expect(r.headers.get("X-RateLimit-Remaining")).toBe("4");
	});

	it("skips when skip() returns true", async () => {
		const rule: RateLimitRule = {
			path: "**",
			points: 1,
			duration: 60_000,
			skip: () => true,
		};
		const svc = new LimiterService({
			rules: [rule],
			storage: new MemoryRateLimitStorage(),
		});
		const app = buildApp(svc);
		const r1 = await app.request("http://x/api/users");
		const r2 = await app.request("http://x/api/users");
		expect(r1.status).toBe(200);
		expect(r2.status).toBe(200);
	});

	it("uses custom key derivation when supplied", async () => {
		const rule: RateLimitRule = {
			path: "**",
			points: 1,
			duration: 60_000,
			key: () => "user-42",
		};
		const svc = new LimiterService({
			rules: [rule],
			storage: new MemoryRateLimitStorage(),
		});
		const app = buildApp(svc);
		const r1 = await app.request("http://x/api/users", {
			headers: { "x-forwarded-for": "1.1.1.1" },
		});
		const r2 = await app.request("http://x/api/users", {
			headers: { "x-forwarded-for": "2.2.2.2" },
		});
		// Both requests share the same custom key, so the 2nd is rejected.
		expect(r1.status).toBe(200);
		expect(r2.status).toBe(429);
	});

	it("falls through when no rule matches", async () => {
		const svc = new LimiterService({
			rules: [{ path: "/admin/*", points: 1, duration: 60_000 }],
			storage: new MemoryRateLimitStorage(),
		});
		const app = buildApp(svc);
		const r = await app.request("http://x/api/users");
		expect(r.status).toBe(200);
	});

	it("uses custom reject response when provided", async () => {
		const rule: RateLimitRule = {
			path: "**",
			points: 1,
			duration: 60_000,
			reject: () => new Response("custom-rejection", { status: 418 }),
		};
		const svc = new LimiterService({
			rules: [rule],
			storage: new MemoryRateLimitStorage(),
		});
		const app = buildApp(svc);
		await app.request("http://x/api/users");
		const r = await app.request("http://x/api/users");
		expect(r.status).toBe(418);
		expect(await r.text()).toBe("custom-rejection");
	});

	it("filters by HTTP method", async () => {
		const rule: RateLimitRule = {
			path: "**",
			points: 1,
			duration: 60_000,
			methods: ["POST"],
		};
		const svc = new LimiterService({
			rules: [rule],
			storage: new MemoryRateLimitStorage(),
		});
		const app = buildApp(svc);
		// GET should not be limited.
		const g1 = await app.request("http://x/api/users");
		const g2 = await app.request("http://x/api/users");
		expect(g1.status).toBe(200);
		expect(g2.status).toBe(200);
		// POST should be limited.
		const p1 = await app.request("http://x/login", { method: "POST" });
		const p2 = await app.request("http://x/login", { method: "POST" });
		expect(p1.status).toBe(200);
		expect(p2.status).toBe(429);
	});
});
