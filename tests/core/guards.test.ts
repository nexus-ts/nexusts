/**
 * Tests for HTTP guards.
 */
import "reflect-metadata";
import {
	AuthGuard,
	createHttpGuard,
	executeHttpGuards,
	RolesGuard,
} from "@nexusts/core";
import { describe, expect, it } from "vitest";


describe("createHttpGuard", () => {
	it("creates a guard class from a function", async () => {
		const Guard = createHttpGuard((ctx) => {
			return ctx.getRequest().headers.has("x-api-key");
		});
		const guard = new Guard();
		const ctx = makeMockCtx(new Request("http://localhost/", {
			headers: { "x-api-key": "secret" },
		}));
		expect(await guard.canActivate(ctx)).toBe(true);
	});

	it("rejects when function returns false", async () => {
		const Guard = createHttpGuard(() => false);
		const guard = new Guard();
		const ctx = makeMockCtx(new Request("http://localhost/"));
		expect(await guard.canActivate(ctx)).toBe(false);
	});
});

describe("executeHttpGuards", () => {
	it("passes when all guards return true", async () => {
		const ctx = makeMockCtx(new Request("http://localhost/"));
		const result = await executeHttpGuards(
			[
				createHttpGuard(() => true),
				createHttpGuard(() => true),
			],
			ctx,
		);
		expect(result).toBe(true);
	});

	it("fails when any guard returns false (short-circuit)", async () => {
		let thirdCalled = false;
		const ctx = makeMockCtx(new Request("http://localhost/"));
		const result = await executeHttpGuards(
			[
				createHttpGuard(() => true),
				createHttpGuard(() => false),
				createHttpGuard(() => {
					thirdCalled = true;
					return true;
				}),
			],
			ctx,
		);
		expect(result).toBe(false);
		expect(thirdCalled).toBe(false);
	});

	it("works with guard instances passed directly", async () => {
		const ctx = makeMockCtx(new Request("http://localhost/"));
		const guards = [
			{ canActivate: () => true },
			{ canActivate: () => true },
		] as any;
		expect(await executeHttpGuards(guards, ctx)).toBe(true);
	});
});

describe("AuthGuard", () => {
	it("allows requests with Bearer token", async () => {
		const guard = new AuthGuard();
		const ctx = makeMockCtx(new Request("http://localhost/", {
			headers: { authorization: "Bearer tok123" },
		}));
		expect(await guard.canActivate(ctx)).toBe(true);
	});

	it("rejects requests without Authorization header", async () => {
		const guard = new AuthGuard();
		const ctx = makeMockCtx(new Request("http://localhost/"));
		expect(await guard.canActivate(ctx)).toBe(false);
	});

	it("rejects requests with non-Bearer auth", async () => {
		const guard = new AuthGuard();
		const ctx = makeMockCtx(new Request("http://localhost/", {
			headers: { authorization: "Basic dXNlcjpwYXNz" },
		}));
		expect(await guard.canActivate(ctx)).toBe(false);
	});
});

describe("RolesGuard", () => {
	it("allows when all required roles are present", async () => {
		const guard = new RolesGuard(["admin", "editor"]);
		const ctx = makeMockCtx(new Request("http://localhost/", {
			headers: { "x-user-roles": "admin,editor" },
		}));
		expect(await guard.canActivate(ctx)).toBe(true);
	});

	it("rejects when a required role is missing", async () => {
		const guard = new RolesGuard(["admin", "superadmin"]);
		const ctx = makeMockCtx(new Request("http://localhost/", {
			headers: { "x-user-roles": "admin,editor" },
		}));
		expect(await guard.canActivate(ctx)).toBe(false);
	});

	it("allows when no roles are required", async () => {
		const guard = new RolesGuard([]);
		const ctx = makeMockCtx(new Request("http://localhost/"));
		expect(await guard.canActivate(ctx)).toBe(true);
	});

	it("accepts custom roles extractor", async () => {
		const guard = new RolesGuard(
			["admin"],
			(ctx) => {
				const token = ctx.getRequest().headers.get("x-token") ?? "";
				return token.split("|");
			},
		);
		const ctx = makeMockCtx(new Request("http://localhost/", {
			headers: { "x-token": "user|admin" },
		}));
		expect(await guard.canActivate(ctx)).toBe(true);
	});
});

function makeMockCtx(req: Request): {
	type: "http";
	getRequest(): Request;
	getHandler(): string;
	getController(): string;
} {
	return {
		type: "http" as const,
		getRequest: () => req,
		getHandler: () => "testHandler",
		getController: () => "TestController",
	};
}
