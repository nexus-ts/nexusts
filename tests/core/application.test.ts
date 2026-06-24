/**
 * Tests for the Application class — lifecycle hooks, middleware ordering,
 * listen/shutdown, and the bootstrap() / shutdown() flow.
 */
import "reflect-metadata";
import {
	Application, Controller, Get,
	Injectable,Module, type OnModuleDestroy,
	type OnModuleInit, 
} from "@nexusts/core";
import { Hono } from "hono";
import { describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Application creates a server that can be tested via Hono's fetch
// ---------------------------------------------------------------------------

describe("Application middleware option", () => {
	it("registers middleware before routes (middleware runs first)", async () => {
		const order: string[] = [];

		@Controller("/api")
		class TestCtrl {
			@Get("/")
			index() {
				order.push("handler");
				return { ok: true };
			}
		}

		@Module({ controllers: [TestCtrl] })
		class TestModule {}

		const app = new Application(TestModule, {
			middleware: [
				async (_c, next) => {
					order.push("mw1");
					await next();
				},
				async (_c, next) => {
					order.push("mw2");
					await next();
				},
			],
		});

		// Use the Hono app directly for testing
		const res = await app.server.app.fetch(new Request("http://localhost/api"));
		expect(res.status).toBe(200);
		expect(order).toEqual(["mw1", "mw2", "handler"]);
	});

	it("middleware can modify request context", async () => {
		@Controller("/api")
		class TestCtrl {
			@Get("/")
			index() {
				return { ok: true };
			}
		}

		@Module({ controllers: [TestCtrl] })
		class TestModule {}

		let mwRan = false;
		const app = new Application(TestModule, {
			middleware: [
				async (_c, next) => {
					mwRan = true;
					await next();
				},
			],
		});

		await app.server.app.fetch(new Request("http://localhost/api"));
		expect(mwRan).toBe(true);
	});
});

// ---------------------------------------------------------------------------
// Bootstrap calls lifecycle hooks
// ---------------------------------------------------------------------------

describe("Application lifecycle hooks", () => {
	it("calls onModuleInit during bootstrap", async () => {
		let initCalled = false;

		@Injectable()
		class TestService implements OnModuleInit {
			onModuleInit() { initCalled = true; }
		}

		@Module({ providers: [TestService] })
		class TestModule {}

		const app = new Application(TestModule);
		await app.bootstrap();
		expect(initCalled).toBe(true);
	});

	it("calls onModuleDestroy during shutdown", async () => {
		let destroyCalled = false;

		@Injectable()
		class TestService implements OnModuleDestroy {
			onModuleDestroy() { destroyCalled = true; }
		}

		@Module({ providers: [TestService] })
		class TestModule {}

		const app = new Application(TestModule);
		await app.bootstrap();
		await app.shutdown();
		expect(destroyCalled).toBe(true);
	});

	it("bootstrap is idempotent (calling twice does nothing)", async () => {
		let count = 0;

		@Injectable()
		class TestService implements OnModuleInit {
			onModuleInit() { count++; }
		}

		@Module({ providers: [TestService] })
		class TestModule {}

		const app = new Application(TestModule);
		await app.bootstrap();
		await app.bootstrap();
		expect(count).toBe(1);
	});

	it("shutdown after bootstrap is safe", async () => {
		@Module({})
		class TestModule {}

		const app = new Application(TestModule);
		await app.bootstrap();
		await expect(app.shutdown()).resolves.toBeUndefined();
	});

	it("shutdown without bootstrap is safe (no-op)", async () => {
		@Module({})
		class TestModule {}

		const app = new Application(TestModule);
		await expect(app.shutdown()).resolves.toBeUndefined();
	});
});

// ---------------------------------------------------------------------------
// listen() doesn't double-start the server
// ---------------------------------------------------------------------------

describe("Application listen does not double-start", () => {
	it("bootstrap() followed by listen() starts server once", async () => {
		@Module({})
		class TestModule {}

		const app = new Application(TestModule, { port: 0 });
		await app.bootstrap();

		// listen() should NOT call server.start() again because
		// bootstrap() already did. On port 0, Bun assigns a random port.
		// We just verify no crash.
		await expect(app.listen()).resolves.toBeDefined();
	});
});

// ---------------------------------------------------------------------------
// Static factory and fetch handler
// ---------------------------------------------------------------------------

describe("Application static bootstrap", () => {
	it("Application.bootstrap returns an Application instance", () => {
		@Module({})
		class TestModule {}

		const app = Application.bootstrap(TestModule);
		expect(app).toBeInstanceOf(Application);
		expect(app.server).toBeDefined();
		expect(app.container).toBeDefined();
	});

	it("fetch getter returns a callable function", () => {
		@Controller("/health")
		class HealthCtrl {
			@Get("/")
			index() { return { status: "ok" }; }
		}

		@Module({ controllers: [HealthCtrl] })
		class TestModule {}

		const app = Application.bootstrap(TestModule);
		expect(typeof app.fetch).toBe("function");
	});
});
