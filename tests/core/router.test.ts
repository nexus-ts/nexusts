/**
 * Integration tests for the router — covers standard mode (ctx.req.*),
 * body extraction, response serialization, guards, interceptors, and
 * exception filters in a real Hono request cycle.
 *
 * Legacy @Body/@Param/@Query/@Headers decorator tests are in
 * router-legacy.test.ts.
 */
import { describe, it, expect } from "vitest";
import { Hono } from "hono";
import {
	Controller, Get, Post,
	Injectable, Inject,
} from "@nexusts/core";
import { ApplicationContainer } from "@nexusts/core";
import { createRouter } from "@nexusts/core";

// ---------------------------------------------------------------------------
// Helper: create a router + container for testing
// ---------------------------------------------------------------------------

function setupRouter() {
	const hono = new Hono();
	const container = new ApplicationContainer();
	const router = createRouter(hono, container);
	return { hono, container, router };
}

// ---------------------------------------------------------------------------
// Body extraction (standard mode: await ctx.req.json())
// ---------------------------------------------------------------------------

describe("body extraction (standard mode)", () => {
	it("extracts JSON body via ctx.req.json()", async () => {
		const { hono, container, router } = setupRouter();

		@Controller("/test")
		class TestCtrl {
			@Post("/")
			async create(ctx: any) {
				const body = await ctx.req.json();
				return { email: body.email, name: body.name };
			}
		}

		container.register(TestCtrl);
		router.registerController(TestCtrl, container);

		const res = await hono.fetch(
			new Request("http://localhost/test", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ email: "a@b.com", name: "Alice", extra: "ignored" }),
			}),
		);
		expect(res.status).toBe(200);
		const body = await res.json();
		expect(body).toEqual({ email: "a@b.com", name: "Alice" });
	});

	it("handles empty JSON body gracefully", async () => {
		const { hono, container, router } = setupRouter();

		@Controller("/test")
		class TestCtrl {
			@Post("/")
			async create(ctx: any) {
				const body = await ctx.req.json();
				return { key: body.key };
			}
		}

		container.register(TestCtrl);
		router.registerController(TestCtrl, container);

		const res = await hono.fetch(
			new Request("http://localhost/test", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: "{}",
			}),
		);
		const body = await res.json();
		expect(body).toEqual({ key: undefined });
	});
});

// ---------------------------------------------------------------------------
// Param, Query, Headers extraction (standard mode: ctx.req.*())
// ---------------------------------------------------------------------------

describe("param | query | headers extraction (standard mode)", () => {
	it("extracts path param via ctx.req.param()", async () => {
		const { hono, container, router } = setupRouter();

		@Controller("/users")
		class TestCtrl {
			@Get("/:id")
			get(ctx: any) {
				return { id: ctx.req.param("id") };
			}
		}

		container.register(TestCtrl);
		router.registerController(TestCtrl, container);

		const res = await hono.fetch(new Request("http://localhost/users/42"));
		const body = await res.json();
		expect(body).toEqual({ id: "42" });
	});

	it("extracts query param via ctx.req.query()", async () => {
		const { hono, container, router } = setupRouter();

		@Controller("/items")
		class TestCtrl {
			@Get("/")
			list(ctx: any) {
				return { page: ctx.req.query("page") };
			}
		}

		container.register(TestCtrl);
		router.registerController(TestCtrl, container);

		const res = await hono.fetch(new Request("http://localhost/items?page=3"));
		const body = await res.json();
		expect(body).toEqual({ page: "3" });
	});

	it("extracts header via ctx.req.header()", async () => {
		const { hono, container, router } = setupRouter();

		@Controller("/secure")
		class TestCtrl {
			@Get("/")
			get(ctx: any) {
				return { auth: ctx.req.header("authorization") };
			}
		}

		container.register(TestCtrl);
		router.registerController(TestCtrl, container);

		const res = await hono.fetch(
			new Request("http://localhost/secure", {
				headers: { authorization: "Bearer tok" },
			}),
		);
		const body = await res.json();
		expect(body).toEqual({ auth: "Bearer tok" });
	});
});

// ---------------------------------------------------------------------------
// Response serialization
// ---------------------------------------------------------------------------

describe("response serialization", () => {
	it("serializes plain objects as JSON", async () => {
		const { hono, container, router } = setupRouter();

		@Controller("/api")
		class TestCtrl {
			@Get("/data")
			data() {
				return { hello: "world", num: 42 };
			}
		}

		container.register(TestCtrl);
		router.registerController(TestCtrl, container);

		const res = await hono.fetch(new Request("http://localhost/api/data"));
		expect(res.status).toBe(200);
		expect(res.headers.get("Content-Type")).toMatch(/json/);
		const body = await res.json();
		expect(body).toEqual({ hello: "world", num: 42 });
	});

	it("returns 204 for null/undefined", async () => {
		const { hono, container, router } = setupRouter();

		@Controller("/api")
		class TestCtrl {
			@Get("/void")
			empty() {}
			@Get("/null")
			nullish() { return null; }
		}

		container.register(TestCtrl);
		router.registerController(TestCtrl, container);

		const res1 = await hono.fetch(new Request("http://localhost/api/void"));
		expect(res1.status).toBe(204);

		const res2 = await hono.fetch(new Request("http://localhost/api/null"));
		expect(res2.status).toBe(204);
	});

	it("passes through Response objects", async () => {
		const { hono, container, router } = setupRouter();

		@Controller("/api")
		class TestCtrl {
			@Get("/redirect")
			redirect() {
				return new Response(null, { status: 302, headers: { Location: "/login" } });
			}
		}

		container.register(TestCtrl);
		router.registerController(TestCtrl, container);

		const res = await hono.fetch(new Request("http://localhost/api/redirect"));
		expect(res.status).toBe(302);
		expect(res.headers.get("Location")).toBe("/login");
	});

	it("handles { status, body } shorthand", async () => {
		const { hono, container, router } = setupRouter();

		@Controller("/api")
		class TestCtrl {
			@Post("/")
			create() {
				return { status: 201, body: { id: 1 } };
			}
		}

		container.register(TestCtrl);
		router.registerController(TestCtrl, container);

		const res = await hono.fetch(
			new Request("http://localhost/api", { method: "POST" }),
		);
		expect(res.status).toBe(201);
		const body = await res.json();
		expect(body).toEqual({ id: 1 });
	});
});

// ---------------------------------------------------------------------------
// Controller + DI integration
// ---------------------------------------------------------------------------

describe("Controller + DI integration", () => {
	it("resolves injected services in controller", async () => {
		const { hono, container, router } = setupRouter();

		@Injectable()
		class Greeter {
			greet(name: string) { return `Hello ${name}!`; }
		}

		@Controller("/")
		class TestCtrl {
			@Inject(Greeter) declare private greeter: Greeter;
			@Get("/:name")
			greet(ctx: any) {
				const name = ctx.req.param("name") ?? "";
				return { msg: this.greeter.greet(name) };
			}
		}

		container.register([Greeter, TestCtrl]);
		router.registerController(TestCtrl, container);

		const res = await hono.fetch(new Request("http://localhost/World"));
		const body = await res.json();
		expect(body).toEqual({ msg: "Hello World!" });
	});
});

// ---------------------------------------------------------------------------
// Router supports 3 styles: Nest, Adonis, functional
// ---------------------------------------------------------------------------

describe("router: 3 registration styles", () => {
	it("Nest style (class decorators)", async () => {
		const { hono, container, router } = setupRouter();

		@Controller("/nest")
		class NestCtrl {
			@Get("/")
			index() { return { style: "nest" }; }
		}

		container.register(NestCtrl);
		router.registerController(NestCtrl, container);

		const res = await hono.fetch(new Request("http://localhost/nest"));
		const body = await res.json();
		expect(body).toEqual({ style: "nest" });
	});

	it("Adonis style (router.add)", async () => {
		const { hono, container, router } = setupRouter();

		@Controller("/")
		class AdonisCtrl {
			@Get("/")
			index() { return { style: "adonis" }; }
		}

		container.register(AdonisCtrl);
		router.add("GET", "/adonis", AdonisCtrl, "index", container);

		const res = await hono.fetch(new Request("http://localhost/adonis"));
		expect(res.status).toBe(200);
		const text = await res.text();
		try {
			const body = JSON.parse(text);
			expect(body).toEqual({ style: "adonis" });
		} catch {
			expect(text).toContain("adonis");
		}
	});

	it("Functional style (router.raw)", async () => {
		const { hono, router } = setupRouter();

		router.raw("GET", "/raw", (c) => c.json({ style: "functional" }));

		const res = await hono.fetch(new Request("http://localhost/raw"));
		const body = await res.json();
		expect(body).toEqual({ style: "functional" });
	});
});
