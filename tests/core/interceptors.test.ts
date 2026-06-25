/**
 * Tests for interceptors.
 */
import { describe, it, expect } from "vitest";
import {
	createInterceptor,
	composeInterceptors,
	LoggingInterceptor,
	TimeoutInterceptor,
} from "@nexusts/core";
import type { ExecutionContext } from "@nexusts/core";

describe("createInterceptor", () => {
	it("creates an interceptor class from a function", async () => {
		const Cls = createInterceptor(async (_ctx, next) => {
			const result = await next();
			return `wrapped(${result})`;
		});
		const interceptor = new Cls();
		const ctx = makeMockCtx();
		const result = await interceptor.intercept(ctx, async () => "hello");
		expect(result).toBe("wrapped(hello)");
	});
});

describe("composeInterceptors", () => {
	it("composes interceptors in onion order (first wraps outermost)", async () => {
		const logs: string[] = [];

		const i1 = async (_ctx: ExecutionContext, next: () => Promise<unknown>) => {
			logs.push("i1 before");
			const r = await next();
			logs.push("i1 after");
			return r;
		};

		const i2 = async (_ctx: ExecutionContext, next: () => Promise<unknown>) => {
			logs.push("i2 before");
			const r = await next();
			logs.push("i2 after");
			return r;
		};

		const ctx = makeMockCtx();
		const composed = composeInterceptors([i1, i2], ctx, async () => {
			logs.push("handler");
			return "result";
		});

		const result = await composed();
		expect(result).toBe("result");
		expect(logs).toEqual(["i1 before", "i2 before", "handler", "i2 after", "i1 after"]);
	});

	it("works with a single interceptor", async () => {
		const i1 = async (_ctx: ExecutionContext, next: () => Promise<unknown>) => {
			return `[${await next()}]`;
		};

		const ctx = makeMockCtx();
		const composed = composeInterceptors([i1], ctx, async () => "data");
		expect(await composed()).toBe("[data]");
	});

	it("works with no interceptors (passthrough)", async () => {
		const ctx = makeMockCtx();
		const composed = composeInterceptors([], ctx, async () => "raw");
		expect(await composed()).toBe("raw");
	});

	it("interceptors can short-circuit by not calling next", async () => {
		const blocking = async (_ctx: ExecutionContext, _next: () => Promise<unknown>) => {
			return "blocked";
		};

		const ctx = makeMockCtx();
		const composed = composeInterceptors([blocking], ctx, async () => {
			throw new Error("should not reach");
		});
		expect(await composed()).toBe("blocked");
	});
});

describe("LoggingInterceptor", () => {
	it("logs incoming and completed messages", async () => {
		const logs: string[] = [];
		const origLog = console.log;
		console.log = (...args) => logs.push(args.join(" "));

		try {
			const interceptor = new LoggingInterceptor();
			const ctx = makeMockCtx();
			const result = await interceptor.intercept(ctx, async () => "ok");
			expect(result).toBe("ok");
			expect(logs.length).toBeGreaterThanOrEqual(2);
			expect(logs[0]).toContain("Incoming");
			expect(logs[1]).toContain("Completed");
		} finally {
			console.log = origLog;
		}
	});

	it("logs failure when handler throws", async () => {
		const logs: string[] = [];
		const origLog = console.log;
		const origErr = console.error;
		console.log = (...args) => logs.push(args.join(" "));
		console.error = (...args) => logs.push(args.join(" "));

		try {
			const interceptor = new LoggingInterceptor();
			const ctx = makeMockCtx();
			await expect(
				interceptor.intercept(ctx, async () => {
					throw new Error("boom");
				}),
			).rejects.toThrow("boom");
			expect(logs.some((l) => l.includes("Failed"))).toBe(true);
		} finally {
			console.log = origLog;
			console.error = origErr;
		}
	});
});

describe("TimeoutInterceptor", () => {
	it("passes through if handler completes in time", async () => {
		const interceptor = new TimeoutInterceptor(1000);
		const ctx = makeMockCtx();
		const result = await interceptor.intercept(ctx, async () => "fast");
		expect(result).toBe("fast");
	});

	it("rejects if handler exceeds timeout", async () => {
		const interceptor = new TimeoutInterceptor(10);
		const ctx = makeMockCtx();
		await expect(
			interceptor.intercept(
				ctx,
				() => new Promise((resolve) => setTimeout(resolve, 500, "slow")),
			),
		).rejects.toThrow(/timed out/);
	}, 2000);
});

function makeMockCtx(): ExecutionContext {
	return {
		type: "http" as const,
		// The ExecutionContext interface doesn't have getRequest(), but
		// LoggingInterceptor calls isHttpContext() which checks type === "http"
		// and then follows with getRequest(). We add it as a duck-typed member.
		getRequest: () => new Request("http://localhost/test"),
		getHandler: () => "testMethod",
		getController: () => "TestController",
	} as any;
}
