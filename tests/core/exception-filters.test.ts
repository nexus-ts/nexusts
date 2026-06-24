/**
 * Tests for exception filters and HttpException.
 */
import "reflect-metadata";
import {
	createDefaultExceptionFilter,
	createExceptionFilter,
	executeExceptionFilters,
	HttpException,
} from "@nexusts/core";
import { describe, expect, it } from "vitest";


/** Minimal execution context shape for testing. */
interface MinimalFilterCtx {
	type: "http";
	getRequest(): Request;
	getHandler(): string;
	getController(): string;
}

describe("HttpException", () => {
	it("creates with status code and message", () => {
		const err = new HttpException(404, "Not Found");
		expect(err).toBeInstanceOf(Error);
		expect(err.statusCode).toBe(404);
		expect(err.message).toBe("Not Found");
		expect(err.name).toBe("HttpException");
	});

	it("uses default message when omitted", () => {
		const err = new HttpException(500);
		expect(err.message).toBe("HTTP 500");
	});

	it("badRequest factory returns 400", () => {
		const err = HttpException.badRequest("Invalid input");
		expect(err.statusCode).toBe(400);
		expect(err.message).toBe("Invalid input");
	});

	it("unauthorized factory returns 401", () => {
		const err = HttpException.unauthorized();
		expect(err.statusCode).toBe(401);
		expect(err.message).toBe("Unauthorized");
	});

	it("forbidden factory returns 403", () => {
		const err = HttpException.forbidden();
		expect(err.statusCode).toBe(403);
	});

	it("notFound factory returns 404", () => {
		const err = HttpException.notFound("User missing");
		expect(err.statusCode).toBe(404);
		expect(err.message).toBe("User missing");
	});

	it("conflict factory returns 409", () => {
		const err = HttpException.conflict();
		expect(err.statusCode).toBe(409);
	});

	it("unprocessable factory returns 422", () => {
		const err = HttpException.unprocessable();
		expect(err.statusCode).toBe(422);
	});

	it("tooManyRequests factory returns 429", () => {
		const err = HttpException.tooManyRequests();
		expect(err.statusCode).toBe(429);
	});

	it("internalServerError factory returns 500", () => {
		const err = HttpException.internalServerError("Oops");
		expect(err.statusCode).toBe(500);
		expect(err.message).toBe("Oops");
	});

	it("serviceUnavailable factory returns 503", () => {
		const err = HttpException.serviceUnavailable();
		expect(err.statusCode).toBe(503);
	});

	it("toJSON returns error object", () => {
		const err = HttpException.badRequest("Bad");
		const json = err.toJSON();
		expect(json).toEqual({ error: "Bad", statusCode: 400 });
	});
});

describe("createExceptionFilter", () => {
	it("creates a filter from a function", async () => {
		const filter = createExceptionFilter((error, _ctx) => {
			return new Response(`Caught: ${(error as Error).message}`, { status: 400 });
		});
		expect(filter).toHaveProperty("catch");
		expect(typeof filter.catch).toBe("function");
	});

	it("the returned filter catches errors", async () => {
		const filter = createExceptionFilter((error) => {
			return new Response(`Custom: ${(error as Error).message}`, { status: 400 });
		});
		const ctx = makeMockContext();
		const res = await filter.catch(new Error("test error"), ctx);
		expect(res.status).toBe(400);
		const text = await res.text();
		expect(text).toContain("test error");
	});
});

describe("defaultExceptionFilter", () => {
	it("handles HttpException with its status code", async () => {
		const filter = createDefaultExceptionFilter();
		const ctx = makeMockContext();
		const res = await filter.catch(HttpException.notFound("Missing"), ctx);
		expect(res.status).toBe(404);
		const body = await res.json();
		expect(body).toHaveProperty("error", "Missing");
		expect(body).toHaveProperty("statusCode", 404);
	});

	it("wraps plain errors as 500", async () => {
		const filter = createDefaultExceptionFilter();
		const ctx = makeMockContext();
		const res = await filter.catch(new Error("Something broke"), ctx);
		expect(res.status).toBe(500);
		const body = await res.json();
		expect(body).toHaveProperty("error", "Something broke");
		expect(body).toHaveProperty("statusCode", 500);
	});

	it("does not include stack in production-like env", async () => {
		const orig = process.env.NODE_ENV;
		process.env.NODE_ENV = "production";
		try {
			const filter = createDefaultExceptionFilter();
			const ctx = makeMockContext();
			const res = await filter.catch(new Error("prod error"), ctx);
			const body = await res.json();
			expect(body).not.toHaveProperty("stack");
		} finally {
			process.env.NODE_ENV = orig;
		}
	});
});

describe("executeExceptionFilters", () => {
	it("tries filters in order and returns first response", async () => {
		const filter1 = createExceptionFilter(() => {
			throw new Error("skip me");
		});
		const filter2 = createExceptionFilter(async (_error) => {
			return new Response("handled", { status: 200 });
		});
		const ctx = makeMockContext();
		const res = await executeExceptionFilters(
			[filter1, filter2],
			new Error("test"),
			ctx,
		);
		expect(res.status).toBe(200);
		const text = await res.text();
		expect(text).toBe("handled");
	});

	it("falls back to default filter when none handle", async () => {
		const filter = createExceptionFilter(() => {
			throw new Error("also skip");
		});
		const ctx = makeMockContext();
		const res = await executeExceptionFilters(
			[filter],
			new Error("ultimate fallback"),
			ctx,
		);
		expect(res.status).toBe(500);
	});
});

function makeMockContext(): MinimalFilterCtx {
	return {
		type: "http" as const,
		getRequest: () => new Request("http://localhost/"),
		getHandler: () => "testHandler",
		getController: () => "TestController",
	};
}
