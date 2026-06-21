/**
 * Tests for nexus/shield.
 */

import "reflect-metadata";
import { describe, it, expect } from "vitest";
import { Hono } from "hono";
import {
	CsrfGuard,
	HeadersGuard,
	ShieldService,
} from "../../src/shield/index.js";
import type { ShieldConfig } from "../../src/shield/types.js";

describe("CsrfGuard", () => {
	const secret = "test-secret";
	const cfg: ShieldConfig["csrf"] = {
		enabled: true,
		cookie: { secure: false, httpOnly: false },
	};
	const guard = new CsrfGuard(cfg as any, secret);

	it("issues a token + sets cookie", () => {
		const res = new Headers();
		const t = guard.issue(res);
		expect(t.token).toBeTruthy();
		expect(t.html).toContain("meta");
		const setCookie = res.get("set-cookie") ?? "";
		expect(setCookie).toContain("nexus-csrf=");
	});

	it("verify() allows safe methods without a token", () => {
		expect(guard.verify({ method: "GET", headers: new Headers() })).toBe(true);
	});

	it("verify() rejects mutating requests with no cookie", () => {
		expect(guard.verify({ method: "POST", headers: new Headers() })).toBe(
			false,
		);
	});

	it("verify() accepts a matching signed token", () => {
		const res = new Headers();
		const t = guard.issue(res);
		// Extract the raw cookie value
		const sc = res.get("set-cookie") ?? "";
		const rawCookie = sc.split(";")[0]?.split("=")[1] ?? "";
		const headers = new Headers();
		headers.set("cookie", `nexus-csrf=${rawCookie}`);
		headers.set("x-csrf-token", t.token);
		expect(guard.verify({ method: "POST", headers })).toBe(true);
	});

	it("verify() rejects a mismatched token", () => {
		const res = new Headers();
		guard.issue(res);
		const sc = res.get("set-cookie") ?? "";
		const rawCookie = sc.split(";")[0]?.split("=")[1] ?? "";
		const headers = new Headers();
		headers.set("cookie", `nexus-csrf=${rawCookie}`);
		headers.set("x-csrf-token", "wrong.signed");
		expect(guard.verify({ method: "POST", headers })).toBe(false);
	});
});

describe("HeadersGuard middleware", () => {
	it("sets X-Content-Type-Options", async () => {
		const g = new HeadersGuard(false, false, false, true, undefined);
		const app = new Hono();
		app.use("/*", g.middleware());
		app.get("/", (c) => c.text("ok"));
		const r = await app.request("http://x/");
		expect(r.headers.get("X-Content-Type-Options")).toBe("nosniff");
	});

	it("sets HSTS", async () => {
		const g = new HeadersGuard(
			{ maxAge: 31_536_000, includeSubDomains: true, preload: true },
			false,
			false,
			false,
			undefined,
		);
		const app = new Hono();
		app.use("/*", g.middleware());
		app.get("/", (c) => c.text("ok"));
		const r = await app.request("http://x/");
		expect(r.headers.get("Strict-Transport-Security")).toBe(
			"max-age=31536000; includeSubDomains; preload",
		);
	});

	it("sets X-Frame-Options", async () => {
		const g = new HeadersGuard(false, false, "DENY", false, undefined);
		const app = new Hono();
		app.use("/*", g.middleware());
		app.get("/", (c) => c.text("ok"));
		const r = await app.request("http://x/");
		expect(r.headers.get("X-Frame-Options")).toBe("DENY");
	});

	it("sets CSP", async () => {
		const g = new HeadersGuard(
			false,
			{
				directives: {
					defaultSrc: ["'self'"],
					scriptSrc: ["'self'", "cdn.example"],
				},
			},
			false,
			false,
			undefined,
		);
		const app = new Hono();
		app.use("/*", g.middleware());
		app.get("/", (c) => c.text("ok"));
		const r = await app.request("http://x/");
		const csp = r.headers.get("Content-Security-Policy") ?? "";
		expect(csp).toContain("default-src 'self'");
		expect(csp).toContain("script-src 'self' cdn.example");
	});

	it("sets Referrer-Policy", async () => {
		const g = new HeadersGuard(
			false,
			false,
			false,
			false,
			"strict-origin-when-cross-origin",
		);
		const app = new Hono();
		app.use("/*", g.middleware());
		app.get("/", (c) => c.text("ok"));
		const r = await app.request("http://x/");
		expect(r.headers.get("Referrer-Policy")).toBe(
			"strict-origin-when-cross-origin",
		);
	});
});

describe("ShieldService (combined middleware)", () => {
	it("runs all configured guards", async () => {
		const svc = new ShieldService({
			csrf: { enabled: true, cookie: { secure: false } },
			hsts: { maxAge: 60 },
			csp: { directives: { defaultSrc: ["'self'"] } },
			xFrameOptions: "DENY",
			xContentTypeOptions: true,
			referrerPolicy: "no-referrer",
			secret: "x",
		});
		const app = new Hono();
		app.use("/*", svc.middleware());
		app.get("/", (c) => c.text("ok"));
		app.post("/submit", (c) => c.text("ok"));
		// GET should set the cookie and security headers.
		const r1 = await app.request("http://x/");
		expect(r1.status).toBe(200);
		expect(r1.headers.get("X-Frame-Options")).toBe("DENY");
		expect(r1.headers.get("X-Content-Type-Options")).toBe("nosniff");
		expect(r1.headers.get("Strict-Transport-Security")).toBe("max-age=60");
		expect(r1.headers.get("Content-Security-Policy")).toContain(
			"default-src 'self'",
		);
		expect(r1.headers.get("Referrer-Policy")).toBe("no-referrer");
		const setCookie = r1.headers.get("set-cookie") ?? "";
		expect(setCookie).toContain("nexus-csrf=");
		// POST without CSRF should 403.
		const r2 = await app.request("http://x/submit", { method: "POST" });
		expect(r2.status).toBe(403);
	});
});
