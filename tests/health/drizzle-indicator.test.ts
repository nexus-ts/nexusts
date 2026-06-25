/**
 * Tests for DrizzleHealthIndicator.
 */

import { describe, it, expect } from "vitest";
import { DrizzleHealthIndicator } from "../../src/health/indicators/drizzle.js";
import { DrizzleService } from "../../src/drizzle/index.js";

describe("DrizzleHealthIndicator", () => {
	it("reports up when the probe succeeds", async () => {
		const db = new DrizzleService({
			dialect: "bun-sqlite",
			connection: { filename: ":memory:" },
		});
		await db.open();
		const ind = new DrizzleHealthIndicator("database", db);
		const r = await ind.check();
		expect(r.status).toBe("up");
		expect(
			(r.data as { latencyMs?: number } | undefined)?.latencyMs,
		).toBeGreaterThanOrEqual(0);
		await db.close();
	});

	it("reports down when the probe throws", async () => {
		const fakeDb = {
			rawQuery: async () => {
				throw new Error("connection refused");
			},
		};
		const ind = new DrizzleHealthIndicator("database", fakeDb as any);
		const r = await ind.check();
		expect(r.status).toBe("down");
		expect(r.message).toContain("connection refused");
	});

	it("respects timeoutMs", async () => {
		const slowDb = {
			rawQuery: async () => {
				await new Promise((r) => setTimeout(r, 1000));
				return [];
			},
		};
		const ind = new DrizzleHealthIndicator("database", slowDb as any, {
			timeoutMs: 50,
		});
		const r = await ind.check();
		expect(r.status).toBe("down");
		expect(r.message).toContain("timed out");
	});
});
