/**
 * Tests for nexus/health.
 */

import { describe, it, expect } from "vitest";
import { Application } from "@core/application";
import { Module } from "@core/decorators/module";
import { Controller } from "@core/decorators/controller";
import { Get } from "@core/decorators/http-methods";
import {
	HealthCheckService,
	HealthModule,
	type HealthIndicator,
} from "../../src/health/index.js";
import type { HealthIndicatorResult } from "../../src/health/types.js";

class StubUp implements HealthIndicator {
	readonly name = "stub-up";
	async check(): Promise<HealthIndicatorResult> {
		return { status: "up" };
	}
}

class StubDown implements HealthIndicator {
	readonly name = "stub-down";
	async check(): Promise<HealthIndicatorResult> {
		return { status: "down", message: "simulated" };
	}
}

describe("HealthCheckService", () => {
	it("reports up when every indicator is up", async () => {
		const svc = new HealthCheckService();
		svc.register(new StubUp());
		svc.register({
			name: "stub-up-2",
			async check() {
				return { status: "up" };
			},
		});
		const r = await svc.check();
		expect(r.status).toBe("up");
		expect(r.results).toHaveLength(2);
		expect(r.durationMs).toBeGreaterThanOrEqual(0);
	});

	it("reports down when any indicator is down", async () => {
		const svc = new HealthCheckService();
		svc.register(new StubUp());
		svc.register(new StubDown());
		const r = await svc.check();
		expect(r.status).toBe("down");
		expect(r.results.find((e) => e.name === "stub-down")?.result.message).toBe(
			"simulated",
		);
	});

	it("catches indicator exceptions", async () => {
		const svc = new HealthCheckService();
		svc.register({
			name: "throws",
			async check() {
				throw new Error("boom");
			},
		});
		const r = await svc.check();
		expect(r.status).toBe("down");
		expect(r.results[0]?.result.message).toContain("boom");
	});

	it("register / unregister / list", () => {
		const svc = new HealthCheckService();
		svc.register(new StubUp());
		expect(svc.list()).toContain("stub-up");
		expect(svc.unregister("stub-up")).toBe(true);
		expect(svc.list()).not.toContain("stub-up");
	});
});

describe("HealthController (HTTP integration)", () => {
	const AppHealthModule = HealthModule.forRoot();

	@Controller("/probe")
	class ProbeController {
		@Get("/")
		probe() {
			return { ok: true };
		}
	}

	@Module({
		imports: [AppHealthModule],
		controllers: [ProbeController],
	})
	class RootModule {}

	it("exposes /health/live (auto-default health indicator)", async () => {
		const app = new Application(RootModule);
		const res = await app.server.app.request("/health/live");
		expect(res.status).toBe(200);
		const body = await res.json();
		expect(body.status).toBe("up");
	});

	it("exposes /health/ready (200 when empty)", async () => {
		const app = new Application(RootModule);
		const res = await app.server.app.request("/health/ready");
		expect(res.status).toBe(200);
		const body = await res.json();
		expect(body.status).toBe("up");
		expect(Array.isArray(body.results)).toBe(true);
	});

	it("returns 503 when an indicator is down", async () => {
		const app = new Application(RootModule);
		const svc = app.container.resolve(
			HealthCheckService.TOKEN,
		) as HealthCheckService;
		svc.register(new StubDown());
		const res = await app.server.app.request("/health/ready");
		expect(res.status).toBe(503);
		const body = await res.json();
		expect(body.status).toBe("down");
	});
});

describe("Built-in indicators", () => {
	it("MemoryHealthIndicator reports up under normal heap pressure", async () => {
		const { MemoryHealthIndicator } = await import("../../src/health/index.js");
		const ind = new MemoryHealthIndicator({ threshold: 0.99 });
		const r = await ind.check();
		expect(r.status).toBe("up");
		expect(r.data).toBeDefined();
	});
});
