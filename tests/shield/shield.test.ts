/**
 * Tests for nexus/shield.
 */

import "reflect-metadata";
import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import {
	CorsGuard,
	CsrfGuard,
	HeadersGuard,
	ShieldService,
} from "@nexusts/shield";
import type { ShieldConfig } from "@nexusts/shield";

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

describe("CorsGuard", () => {
	it("resolveOrigin — wildcard returns *", () => {
		const g = new CorsGuard({ origin: "*" });
		expect(g.resolveOrigin("https://example.com")).toBe("*");
	});

	it("resolveOrigin — exact string match", () => {
		const g = new CorsGuard({ origin: "https://app.example.com" });
		expect(g.resolveOrigin("https://app.example.com")).toBe("https://app.example.com");
		expect(g.resolveOrigin("https://evil.com")).toBeNull();
	});

	it("resolveOrigin — array whitelist", () => {
		const g = new CorsGuard({ origin: ["https://a.com", "https://b.com"] });
		expect(g.resolveOrigin("https://a.com")).toBe("https://a.com");
		expect(g.resolveOrigin("https://c.com")).toBeNull();
	});

	it("resolveOrigin — function resolver", () => {
		const g = new CorsGuard({ origin: (o) => o.endsWith(".trusted.com") });
		expect(g.resolveOrigin("https://sub.trusted.com")).toBe("https://sub.trusted.com");
		expect(g.resolveOrigin("https://evil.com")).toBeNull();
	});

	it("applyHeaders — sets Access-Control-Allow-Origin", () => {
		const g = new CorsGuard({ origin: "https://app.example.com", credentials: true });
		const headers = new Headers();
		g.applyHeaders(headers, "https://app.example.com");
		expect(headers.get("Access-Control-Allow-Origin")).toBe("https://app.example.com");
		expect(headers.get("Access-Control-Allow-Credentials")).toBe("true");
		expect(headers.get("Vary")).toContain("Origin");
	});

	it("applyHeaders — skips disallowed origin", () => {
		const g = new CorsGuard({ origin: "https://app.example.com" });
		const headers = new Headers();
		g.applyHeaders(headers, "https://evil.com");
		expect(headers.get("Access-Control-Allow-Origin")).toBeNull();
	});

	it("applyPreflightHeaders — returns true and sets methods", () => {
		const g = new CorsGuard({
			origin: "https://app.example.com",
			methods: ["GET", "POST"],
			allowedHeaders: ["Content-Type", "Authorization"],
			maxAge: 3600,
		});
		const headers = new Headers();
		const allowed = g.applyPreflightHeaders(headers, "https://app.example.com");
		expect(allowed).toBe(true);
		expect(headers.get("Access-Control-Allow-Methods")).toBe("GET, POST");
		expect(headers.get("Access-Control-Allow-Headers")).toBe("Content-Type, Authorization");
		expect(headers.get("Access-Control-Max-Age")).toBe("3600");
	});

	it("middleware — handles OPTIONS preflight and returns 204", async () => {
		const g = new CorsGuard({ origin: "https://app.example.com", methods: ["GET", "POST"] });
		const app = new Hono();
		app.use("/*", g.middleware());
		app.get("/api", (c) => c.text("ok"));
		const r = await app.request("http://x/api", {
			method: "OPTIONS",
			headers: {
				Origin: "https://app.example.com",
				"Access-Control-Request-Method": "POST",
			},
		});
		expect(r.status).toBe(204);
		expect(r.headers.get("Access-Control-Allow-Origin")).toBe("https://app.example.com");
		expect(r.headers.get("Access-Control-Allow-Methods")).toContain("POST");
	});

	it("middleware — sets CORS headers on regular request", async () => {
		const g = new CorsGuard({ origin: "*" });
		const app = new Hono();
		app.use("/*", g.middleware());
		app.get("/", (c) => c.text("ok"));
		const r = await app.request("http://x/", {
			headers: { Origin: "https://any.com" },
		});
		expect(r.status).toBe(200);
		expect(r.headers.get("Access-Control-Allow-Origin")).toBe("*");
	});

	it("middleware — returns 403 preflight for disallowed origin", async () => {
		const g = new CorsGuard({ origin: "https://allowed.com" });
		const app = new Hono();
		app.use("/*", g.middleware());
		app.get("/", (c) => c.text("ok"));
		const r = await app.request("http://x/", {
			method: "OPTIONS",
			headers: {
				Origin: "https://evil.com",
				"Access-Control-Request-Method": "GET",
			},
		});
		expect(r.status).toBe(403);
	});
});

describe("ShieldService (combined middleware)", () => {
	it("runs all configured guards including CORS", async () => {
		const svc = new ShieldService({
			cors: { origin: "https://app.example.com", credentials: true },
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
		// GET with matching origin: CORS + security headers + CSRF cookie.
		const r1 = await app.request("http://x/", {
			headers: { Origin: "https://app.example.com" },
		});
		expect(r1.status).toBe(200);
		expect(r1.headers.get("Access-Control-Allow-Origin")).toBe("https://app.example.com");
		expect(r1.headers.get("Access-Control-Allow-Credentials")).toBe("true");
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
		// OPTIONS preflight should 204 (not CSRF 403).
		const r3 = await app.request("http://x/submit", {
			method: "OPTIONS",
			headers: {
				Origin: "https://app.example.com",
				"Access-Control-Request-Method": "POST",
			},
		});
		expect(r3.status).toBe(204);
		expect(r3.headers.get("Access-Control-Allow-Origin")).toBe("https://app.example.com");
	});
});
