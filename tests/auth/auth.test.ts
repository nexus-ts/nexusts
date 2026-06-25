/**
 * Auth module tests.
 *
 * Exercises the NexusTS auth integration end-to-end:
 *   - createAuth() builds a better-auth instance
 *   - AuthService.getSession returns null for unauthenticated requests
 *   - authMiddleware populates c.var.user / c.var.session
 *   - The AuthController routes are registered with the right methods
 *   - CurrentUser decorator is importable and usable
 */

import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { Hono } from "hono";
import { Application } from "@core/application";
import { Module } from "@core/decorators/module";
import { Controller } from "@core/decorators/controller";
import { Get } from "@core/decorators/http-methods";
import {
	createAuth,
	AuthService,
	AuthModule,
	authMiddleware,
	CurrentUser,
} from "../../src/auth/index.js";
import type {
	AuthUser,
	AuthVariables,
	AuthConfig,
} from "../../src/auth/types.js";

const AUTH_CONFIG: AuthConfig = {
	basePath: "/api/auth",
	emailAndPassword: { enabled: true, requireEmailVerification: false },
	sessionExpiresInSeconds: 60 * 60,
};

describe("createAuth", () => {
	beforeAll(() => {
		process.env["BETTER_AUTH_SECRET"] = "a".repeat(32);
		process.env["BETTER_AUTH_URL"] = "http://localhost:3000";
	});

	it("builds a better-auth instance with NexusTS defaults", () => {
		const auth = createAuth(AUTH_CONFIG);
		expect(auth).toBeDefined();
		expect(typeof auth.handler).toBe("function");
		expect(typeof auth.api.getSession).toBe("function");
	});

	it("throws when BETTER_AUTH_SECRET is missing", () => {
		const prev = process.env["BETTER_AUTH_SECRET"];
		delete process.env["BETTER_AUTH_SECRET"];
		try {
			expect(() => createAuth(AUTH_CONFIG)).toThrow(/BETTER_AUTH_SECRET/);
		} finally {
			if (prev !== undefined) process.env["BETTER_AUTH_SECRET"] = prev;
		}
	});

	it("throws when BETTER_AUTH_URL is missing", () => {
		const prev = process.env["BETTER_AUTH_URL"];
		delete process.env["BETTER_AUTH_URL"];
		try {
			expect(() => createAuth(AUTH_CONFIG)).toThrow(/BETTER_AUTH_URL/);
		} finally {
			if (prev !== undefined) process.env["BETTER_AUTH_URL"] = prev;
		}
	});
});

describe("AuthService", () => {
	beforeAll(() => {
		process.env["BETTER_AUTH_SECRET"] = "a".repeat(32);
		process.env["BETTER_AUTH_URL"] = "http://localhost:3000";
	});

	it("resolves the AuthService via DI when forRoot is imported", async () => {
		const AppAuthModule = AuthModule.forRoot(AUTH_CONFIG);

		@Controller("/probe")
		class ProbeController {
			@Get("/")
			probe() {
				return { ok: true };
			}
		}

		@Module({
			imports: [AppAuthModule],
			controllers: [ProbeController],
		})
		class TestModule {}

		const app = new Application(TestModule);
		const authService = app.container.resolve<AuthService>(AuthService.TOKEN);
		expect(authService).toBeInstanceOf(AuthService);
	});

	it("returns null for an unauthenticated session", async () => {
		process.env["BETTER_AUTH_SECRET"] = "a".repeat(32);
		process.env["BETTER_AUTH_URL"] = "http://localhost:3000";

		const AppAuthModule = AuthModule.forRoot(AUTH_CONFIG);

		@Module({ imports: [AppAuthModule] })
		class TestModule {}

		const app = new Application(TestModule);
		const authService = app.container.resolve<AuthService>(AuthService.TOKEN);
		const session = await authService.getSession({
			headers: new Headers(),
		});
		expect(session).toBeNull();
	});

	it("redirect() returns a Response with the right status + Location", async () => {
		process.env["BETTER_AUTH_SECRET"] = "a".repeat(32);
		process.env["BETTER_AUTH_URL"] = "http://localhost:3000";

		const AppAuthModule = AuthModule.forRoot(AUTH_CONFIG);

		@Module({ imports: [AppAuthModule] })
		class TestModule {}

		const app = new Application(TestModule);
		const authService = app.container.resolve<AuthService>(AuthService.TOKEN);
		const r = authService.redirect("/dashboard");
		expect(r.status).toBe(302);
		expect(r.headers.get("Location")).toBe("/dashboard");
	});
});

describe("authMiddleware", () => {
	beforeAll(() => {
		process.env["BETTER_AUTH_SECRET"] = "a".repeat(32);
		process.env["BETTER_AUTH_URL"] = "http://localhost:3000";
	});

	it("populates c.var.user = null when unauthenticated", async () => {
		const auth = createAuth(AUTH_CONFIG);
		const app = new Hono<{ Variables: AuthVariables }>();
		app.use("*", authMiddleware(auth, { mode: "optional" }));
		app.get("/who", (c) => c.json({ user: c.get("user") }));
		const res = await app.request("/who");
		expect(res.status).toBe(200);
		const body = await res.json();
		expect(body.user).toBeNull();
	});

	it("returns 401 in required mode when unauthenticated", async () => {
		const auth = createAuth(AUTH_CONFIG);
		const app = new Hono<{ Variables: AuthVariables }>();
		app.use("/protected/*", authMiddleware(auth, { mode: "required" }));
		app.get("/protected/secret", (c) => c.json({ ok: true }));
		const res = await app.request("/protected/secret");
		expect(res.status).toBe(401);
		const body = await res.json();
		expect(body.error).toBe("Unauthorized");
	});

	it("skips ignored paths entirely", async () => {
		const auth = createAuth(AUTH_CONFIG);
		const app = new Hono<{ Variables: AuthVariables }>();
		app.use(
			"*",
			authMiddleware(auth, { mode: "required", ignoredPaths: /^\/health$/ }),
		);
		app.get("/health", (c) => c.json({ ok: true }));
		const res = await app.request("/health");
		expect(res.status).toBe(200);
	});
});

describe("AuthModule HTTP integration", () => {
	beforeAll(() => {
		process.env["BETTER_AUTH_SECRET"] = "a".repeat(32);
		process.env["BETTER_AUTH_URL"] = "http://localhost:3000";
	});

	it("GET /api/auth/session returns 200 with user=null for unauthenticated requests", async () => {
		const AppAuthModule = AuthModule.forRoot(AUTH_CONFIG);

		@Module({ imports: [AppAuthModule] })
		class RootModule {}

		const app = new Application(RootModule);
		const res = await app.server.app.request("/api/auth/session");
		expect(res.status).toBe(200);
		const body = await res.json();
		expect(body.user).toBeNull();
		expect(body.session).toBeNull();
	});
});

describe("CurrentUser decorator", () => {
	it("is a function (ParameterDecorator factory)", () => {
		expect(typeof CurrentUser).toBe("function");
	});

	it("returns a ParameterDecorator with no options", () => {
		const deco = CurrentUser();
		expect(typeof deco).toBe("function");
	});

	it("accepts all option shapes without throwing", () => {
		expect(() => CurrentUser({ required: true })).not.toThrow();
		expect(() => CurrentUser({ session: true })).not.toThrow();
		expect(() => CurrentUser({ assert: (_u: AuthUser) => true })).not.toThrow();
	});
});
