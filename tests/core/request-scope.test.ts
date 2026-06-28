/**
 * Tests for request-scoped DI.
 *
 *   - `scope: 'request'` providers get a new instance per request.
 *   - The same instance is shared across consumers in one request.
 *   - Singletons stay shared across requests.
 *   - `REQUEST` / `REQUEST_SCOPE` tokens resolve to the live Hono context.
 *   - `getRequest()` / `getRequestScope()` helpers work from anywhere.
 */

import { describe, it, expect } from "vitest";
import { Hono } from "hono";
import { DIContainer } from "../../src/core/di/container.js";
import { Inject, Injectable } from "../../src/core/decorators/index.js";
import { requestScopeMiddleware } from "../../src/core/di/request-middleware.js";
import {
	RequestScopeStorage,
	REQUEST,
	getRequest,
	getRequestScope,
	getRequestState,
	setRequestState,
} from "../../src/core/di/request-scope.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

@Injectable({ scope: "request" })
class RequestCtx {
	id = Math.random().toString(36).slice(2, 8);
	touched = 0;
}

@Injectable()
class ServiceA {
	@Inject(RequestCtx) declare private ctx: RequestCtx;
	touch() {
		(this.ctx as RequestCtx).touched++;
	}
}

@Injectable()
class ServiceB {
	@Inject(RequestCtx) declare private ctx: RequestCtx;
	touch() {
		(this.ctx as RequestCtx).touched++;
	}
}

function makeHono() {
	const root = new DIContainer();
	return { app: new Hono(), root };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("RequestScopeStorage", () => {
	it("returns undefined outside a request", () => {
		expect(RequestScopeStorage.get()).toBeUndefined();
		expect(getRequest()).toBeUndefined();
		expect(getRequestScope()).toBeUndefined();
	});

	it("propagates the scope through async boundaries", async () => {
		const scope = RequestScopeStorage.create({ url: "http://x" }, new DIContainer());
		const result = await RequestScopeStorage.run(scope, async () => {
			await new Promise((r) => setTimeout(r, 10));
			return getRequest();
		});
		expect(result).toBe(scope.context);
	});

	it("supports user state via state bag", () => {
		const scope = RequestScopeStorage.create({}, new DIContainer());
		RequestScopeStorage.run(scope, () => {
			setRequestState("userId", "user-42");
			expect(getRequestState("userId")).toBe("user-42");
		});
		expect(getRequestState("userId")).toBeUndefined();
	});
});

describe("REQUEST token · injected via Hono context", () => {
	it("resolves the active Hono context", async () => {
		const { app, root } = makeHono();
		let captured: any = null;
		app.use("*", requestScopeMiddleware(root));
		app.get("/", (c) => {
			const req = root.resolve<any>(REQUEST);
			captured = req;
			return c.json({ url: req?.req?.url ?? null });
		});
		const res = await app.request("http://x/");
		expect(res.status).toBe(200);
		expect(captured).toBeDefined();
		expect(captured.req.url).toBe("http://x/");
	});
});

describe("scope: 'request' · per-request lifetime", () => {
	it("creates a new instance per request", async () => {
		const { app, root } = makeHono();
		let first: RequestCtx | null = null;
		let second: RequestCtx | null = null;
		root.register(RequestCtx as any);
		app.use("*", requestScopeMiddleware(root));
		app.get("/a", (c) => {
			first = root.resolve<RequestCtx>(RequestCtx as any);
			return c.json({ id: first.id });
		});
		app.get("/b", (c) => {
			second = root.resolve<RequestCtx>(RequestCtx as any);
			return c.json({ id: second.id });
		});
		await app.request("http://x/a");
		await app.request("http://x/b");
		expect(first).not.toBeNull();
		expect(second).not.toBeNull();
		expect(first!.id).not.toBe(second!.id);
	});

	it("shares the same instance across consumers in one request", async () => {
		const { app, root } = makeHono();
		let a: RequestCtx | null = null;
		let b: RequestCtx | null = null;
		root.register(RequestCtx as any);
		root.register(ServiceA as any);
		root.register(ServiceB as any);
		app.use("*", requestScopeMiddleware(root));
		app.get("/", (c) => {
			const sa = root.resolve<ServiceA>(ServiceA as any);
			const sb = root.resolve<ServiceB>(ServiceB as any);
			sa.touch();
			sb.touch();
			a = (sa as any).ctx;
			b = (sb as any).ctx;
			return c.json({ ok: true });
		});
		await app.request("http://x/");
		expect(a).not.toBeNull();
		expect(a).toBe(b);
		expect(a!.touched).toBe(2);
	});
});

describe("scope: 'singleton' (default) · unchanged", () => {
	it("still shares a single instance across requests", async () => {
		const { app, root } = makeHono();
		const Counter = class {
			count = 0;
		};
		root.register({ provide: "counter", useValue: new Counter() } as any);
		let first: any = null;
		let second: any = null;
		root.register(RequestCtx as any);
		app.use("*", requestScopeMiddleware(root));
		app.get("/a", (c) => {
			first = (root as any).resolve("counter");
			first.count++;
			return c.json({ count: first.count });
		});
		app.get("/b", (c) => {
			second = (root as any).resolve("counter");
			second.count++;
			return c.json({ count: second.count });
		});
		await app.request("http://x/a");
		await app.request("http://x/b");
		expect(first.count).toBe(2);
		expect(first).toBe(second);
	});
});

describe("scope: 'transient' · new instance per call", () => {
	it("creates a fresh instance every resolve", () => {
		const root = new DIContainer();
		root.register({ provide: "trans", useFactory: () => ({ id: Math.random() }), scope: "transient" } as any);
		const a = (root as any).resolve("trans");
		const b = (root as any).resolve("trans");
		expect(a).not.toBe(b);
	});
});

describe("Application integration · end-to-end", () => {
	it("scope: 'request' works through the framework", async () => {
		@Injectable()
		class TestService {
			@Inject(RequestCtx) declare public ctx: RequestCtx;
		}
		// Simulate a controller via the Hono middleware + DI flow.
		const root = new DIContainer();
		root.register(RequestCtx as any);
		root.register(TestService as any);
		const app = new Hono();
		app.use("*", requestScopeMiddleware(root));
		app.get("/probe/", (c) => {
			const svc = root.resolve<TestService>(TestService as any);
			return c.json({ ctxId: svc.ctx.id });
		});
		const res = await app.request("http://x/probe/");
		const body = await res.json();
		expect(res.status).toBe(200);
		expect(typeof body.ctxId).toBe("string");
		expect(body.ctxId.length).toBeGreaterThan(0);
	});
});
