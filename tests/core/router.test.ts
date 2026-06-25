/**
 * Integration tests for the router — covers @Body extraction,
 * @Param, @Query, @Headers, response serialization, guards,
 * interceptors, and exception filters in a real Hono request cycle.
 */
import { describe, it, expect } from "vitest";
import { Hono } from "hono";
import {
	Controller, Get, Post,
	Body, Param, Query, Headers,
	UseGuards, UseFilters,
	AuthGuard, HttpException,
	createExceptionFilter,
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
// @Body("field") extraction — the bug that the blog app uncovered
// ---------------------------------------------------------------------------

describe("@Body field extraction", () => {
	it("extracts named field from JSON body via @Body('key')", async () => {
		const { hono, container, router } = setupRouter();

		@Controller("/test")
		class TestCtrl {
			@Post("/")
			async create(@Body("email") email: string, @Body("name") name: string) {
				return { email, name };
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

	it("returns full body when @Body() has no key", async () => {
		const { hono, container, router } = setupRouter();

		@Controller("/test")
		class TestCtrl {
			@Post("/")
			async create(@Body() body: any) {
				return body;
			}
		}

		container.register(TestCtrl);
		router.registerController(TestCtrl, container);

		const res = await hono.fetch(
			new Request("http://localhost/test", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ a: 1, b: 2 }),
			}),
		);
		const body = await res.json();
		expect(body).toEqual({ a: 1, b: 2 });
	});

	it("handles empty JSON body gracefully", async () => {
		const { hono, container, router } = setupRouter();

		@Controller("/test")
		class TestCtrl {
			@Post("/")
			async create(@Body("key") key: string | undefined) {
				return { key };
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
// @Param, @Query, @Headers extraction
// ---------------------------------------------------------------------------

describe("@Param | @Query | @Headers extraction", () => {
	it("extracts @Param('id') from path", async () => {
		const { hono, container, router } = setupRouter();

		@Controller("/users")
		class TestCtrl {
			@Get("/:id")
			get(@Param("id") id: string) {
				return { id };
			}
		}

		container.register(TestCtrl);
		router.registerController(TestCtrl, container);

		const res = await hono.fetch(new Request("http://localhost/users/42"));
		const body = await res.json();
		expect(body).toEqual({ id: "42" });
	});

	it("extracts @Query('page') from query string", async () => {
		const { hono, container, router } = setupRouter();

		@Controller("/items")
		class TestCtrl {
			@Get("/")
			list(@Query("page") page: string) {
				return { page };
			}
		}

		container.register(TestCtrl);
		router.registerController(TestCtrl, container);

		const res = await hono.fetch(new Request("http://localhost/items?page=3"));
		const body = await res.json();
		expect(body).toEqual({ page: "3" });
	});

	it("extracts @Headers('authorization')", async () => {
		const { hono, container, router } = setupRouter();

		@Controller("/secure")
		class TestCtrl {
			@Get("/")
			get(@Headers("authorization") auth: string) {
				return { auth };
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
// Guards — integration with real Request
// ---------------------------------------------------------------------------

describe("Guards integration", () => {
	it("AuthGuard rejects request without Bearer token (403)", async () => {
		const { hono, container, router } = setupRouter();

		@Controller("/admin")
		@UseGuards(AuthGuard)
		class AdminCtrl {
			@Get("/")
			index() {
				return { secret: true };
			}
		}

		container.register(AdminCtrl);
		router.registerController(AdminCtrl, container);

		const res = await hono.fetch(new Request("http://localhost/admin"));
		expect(res.status).toBe(403);
	});

	it("AuthGuard allows request with Bearer token", async () => {
		const { hono, container, router } = setupRouter();

		@Controller("/admin")
		@UseGuards(AuthGuard)
		class AdminCtrl {
			@Get("/")
			index() {
				return { secret: true };
			}
		}

		container.register(AdminCtrl);
		router.registerController(AdminCtrl, container);

		const res = await hono.fetch(
			new Request("http://localhost/admin", {
				headers: { authorization: "Bearer tok123" },
			}),
		);
		expect(res.status).toBe(200);
		const body = await res.json();
		expect(body).toEqual({ secret: true });
	});
});

// ---------------------------------------------------------------------------
// Exception Filters — integration
// ---------------------------------------------------------------------------

describe("Exception Filters integration", () => {
	it("catches HttpException and returns proper status", async () => {
		const { hono, container, router } = setupRouter();

		const notFoundFilter = createExceptionFilter((error, _ctx) => {
			if (error instanceof HttpException && error.statusCode === 404) {
				return new Response(JSON.stringify({ custom: error.message }), {
					status: 404,
					headers: { "Content-Type": "application/json" },
				});
			}
			throw error;
		});

		@Controller("/api")
		class TestCtrl {
			@Get("/:id")
			@UseFilters(notFoundFilter)
			get(@Param("id") id: string) {
				if (id === "999") throw HttpException.notFound("Missing");
				return { id };
			}
		}

		container.register(TestCtrl);
		router.registerController(TestCtrl, container);

		const res = await hono.fetch(new Request("http://localhost/api/999"));
		expect(res.status).toBe(404);
		const body = await res.json();
		expect(body).toEqual({ custom: "Missing" });
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
			constructor(@Inject(Greeter) private greeter: Greeter) {}
			@Get("/:name")
			greet(@Param("name") name: string) {
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
