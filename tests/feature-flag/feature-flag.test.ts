/**
 * Tests for @nexusts/feature-flag.
 */
import { describe, it, expect } from "vitest";
import {
	MemoryFlagBackend,
	FeatureFlagService,
	FeatureFlag,
} from "@nexusts/feature-flag";

// ---------------------------------------------------------------------------
// MemoryFlagBackend
// ---------------------------------------------------------------------------

describe("MemoryFlagBackend", () => {
	it("returns false for unknown flags", async () => {
		const b = new MemoryFlagBackend();
		expect(await b.isEnabled("unknown")).toBe(false);
	});

	it("returns true for enabled:true flags", async () => {
		const b = new MemoryFlagBackend({ "my-flag": true });
		expect(await b.isEnabled("my-flag")).toBe(true);
	});

	it("returns false for enabled:false flags", async () => {
		const b = new MemoryFlagBackend({ "my-flag": false });
		expect(await b.isEnabled("my-flag")).toBe(false);
	});

	it("setFlag / getFlag round-trip", () => {
		const b = new MemoryFlagBackend();
		b.setFlag("x", { enabled: true, rollout: 0.5 });
		expect(b.getFlag("x")).toEqual({ enabled: true, rollout: 0.5 });
	});

	it("allowlist bypasses rollout and always returns true", async () => {
		const b = new MemoryFlagBackend({
			"my-flag": { enabled: true, rollout: 0, allowlist: ["user-1"] },
		});
		expect(await b.isEnabled("my-flag", { userId: "user-1" })).toBe(true);
		expect(await b.isEnabled("my-flag", { userId: "user-2" })).toBe(false);
	});

	it("denylist overrides everything and returns false", async () => {
		const b = new MemoryFlagBackend({
			"my-flag": { enabled: true, allowlist: ["user-1"], denylist: ["user-1"] },
		});
		// Denylist wins over allowlist
		expect(await b.isEnabled("my-flag", { userId: "user-1" })).toBe(false);
	});

	it("rollout=1 means always enabled for any userId", async () => {
		const b = new MemoryFlagBackend({ "roll-flag": { enabled: true, rollout: 1 } });
		for (const id of ["a", "b", "c", "d"]) {
			expect(await b.isEnabled("roll-flag", { userId: id })).toBe(true);
		}
	});

	it("rollout=0 means always disabled (no allowlist)", async () => {
		const b = new MemoryFlagBackend({ "roll-flag": { enabled: true, rollout: 0 } });
		expect(await b.isEnabled("roll-flag", { userId: "anyone" })).toBe(false);
	});

	it("rollout is deterministic for the same userId", async () => {
		const b = new MemoryFlagBackend({ "det-flag": { enabled: true, rollout: 0.5 } });
		const r1 = await b.isEnabled("det-flag", { userId: "stable-user" });
		const r2 = await b.isEnabled("det-flag", { userId: "stable-user" });
		expect(r1).toBe(r2);
	});

	it("tenantId is used as fallback key for rollout", async () => {
		const b = new MemoryFlagBackend({ "t-flag": { enabled: true, rollout: 0.5 } });
		const r1 = await b.isEnabled("t-flag", { tenantId: "tenant-abc" });
		const r2 = await b.isEnabled("t-flag", { tenantId: "tenant-abc" });
		expect(r1).toBe(r2);
	});
});

// ---------------------------------------------------------------------------
// FeatureFlagService
// ---------------------------------------------------------------------------

describe("FeatureFlagService", () => {
	it("isEnabled delegates to the backend", async () => {
		const svc = new FeatureFlagService({ flags: { "svc-flag": true } });
		expect(await svc.isEnabled("svc-flag")).toBe(true);
		expect(await svc.isEnabled("other-flag")).toBe(false);
	});

	it("setFlag updates the in-memory backend", async () => {
		const svc = new FeatureFlagService({});
		svc.setFlag("dynamic", true);
		expect(await svc.isEnabled("dynamic")).toBe(true);
		svc.setFlag("dynamic", false);
		expect(await svc.isEnabled("dynamic")).toBe(false);
	});

	it("getFlag returns undefined for unknown flags", () => {
		const svc = new FeatureFlagService({});
		expect(svc.getFlag("nope")).toBeUndefined();
	});
});

// ---------------------------------------------------------------------------
// @FeatureFlag decorator + applyDecorators
// ---------------------------------------------------------------------------

/** Minimal Hono-like context mock. */
function makeCtx() {
	const responses: [object, number][] = [];
	return {
		responses,
		json(body: object, status: number) {
			responses.push([body, status]);
			return { body, status };
		},
	};
}

describe("@FeatureFlag decorator", () => {
	it("passes through when flag is enabled", async () => {
		const svc = new FeatureFlagService({ flags: { "my-feat": true } });

		class Ctrl {
			@FeatureFlag("my-feat")
			async handler(c: any) {
				return { ok: true };
			}
		}

		const ctrl = new Ctrl();
		svc.applyDecorators(ctrl);
		const result = await (ctrl as any).handler(makeCtx());
		expect(result).toEqual({ ok: true });
	});

	it("returns 404 when flag is disabled", async () => {
		const svc = new FeatureFlagService({ flags: { "off-feat": false } });

		class Ctrl {
			@FeatureFlag("off-feat")
			async handler(c: any) {
				return { ok: true };
			}
		}

		const ctrl = new Ctrl();
		svc.applyDecorators(ctrl);
		const ctx = makeCtx();
		const result = await (ctrl as any).handler(ctx);
		expect(result.status).toBe(404);
		expect((result.body as any).code).toBe("FEATURE_DISABLED");
	});

	it("uses custom onDisabled when provided", async () => {
		const svc = new FeatureFlagService({ flags: { "custom-feat": false } });

		class Ctrl {
			@FeatureFlag("custom-feat", {
				onDisabled: (c: any) => c.json({ message: "Coming soon" }, 503),
			})
			async handler(c: any) {
				return { ok: true };
			}
		}

		const ctrl = new Ctrl();
		svc.applyDecorators(ctrl);
		const ctx = makeCtx();
		const result = await (ctrl as any).handler(ctx);
		expect(result.status).toBe(503);
		expect((result.body as any).message).toBe("Coming soon");
	});

	it("extracts context via contextFn for rollout targeting", async () => {
		const svc = new FeatureFlagService({
			// disabled by default; only allowlisted users get in
			flags: { "ctx-feat": { enabled: false, allowlist: ["alice"] } },
		});

		class Ctrl {
			@FeatureFlag("ctx-feat", {
				contextFn: (c: any) => ({ userId: c.userId }),
			})
			async handler(c: any) {
				return { user: c.userId };
			}
		}

		const ctrl = new Ctrl();
		svc.applyDecorators(ctrl);

		const aliceCtx = { userId: "alice", json: makeCtx().json, responses: [] };
		expect(await (ctrl as any).handler(aliceCtx)).toEqual({ user: "alice" });

		const bobCtx = makeCtx() as any;
		bobCtx.userId = "bob";
		const result = await (ctrl as any).handler(bobCtx);
		expect(result.status).toBe(404);
	});
});
