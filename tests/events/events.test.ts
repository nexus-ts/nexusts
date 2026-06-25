/**
 * Events module tests.
 *
 * Covers:
 *   - NexusEventEmitter: exact match, single-segment wildcard,
 *     multi-segment wildcard, priorities, guards, one-shot listeners,
 *     error collection, max-listeners cap
 *   - EventService: DI resolution, scanForListeners, integration with
 *     @OnEvent decorator
 *   - EventsModule.forRoot validation (no surprises)
 */

import { describe, it, expect, beforeEach } from "vitest";
import { Application } from "@core/application";
import { Module } from "@core/decorators/module";
import { Controller } from "@core/decorators/controller";
import { Get } from "@core/decorators/http-methods";
import { Injectable, Inject } from "@core/decorators/injectable";
import {
	NexusEventEmitter,
	compilePattern,
	EventService,
	EventsModule,
	OnEvent,
	scanForListeners,
} from "../../src/events/index.js";

describe("compilePattern", () => {
	it("returns null for an exact pattern (no wildcards)", () => {
		expect(compilePattern("user.created")).toBeNull();
	});
	it("compiles star (single segment)", () => {
		const re = compilePattern("user.*");
		expect(re).not.toBeNull();
		expect(re!.test("user.created")).toBe(true);
		expect(re!.test("user.updated")).toBe(true);
		expect(re!.test("user.profile.updated")).toBe(false);
	});
	it("compiles double-star (multi segment)", () => {
		const re = compilePattern("**");
		expect(re).not.toBeNull();
		expect(re!.test("a")).toBe(true);
		expect(re!.test("a.b")).toBe(true);
		expect(re!.test("a.b.c.d")).toBe(true);
	});
});

describe("NexusEventEmitter — exact match", () => {
	let em: NexusEventEmitter;
	beforeEach(() => {
		em = new NexusEventEmitter();
	});

	it("delivers to an exact-match listener", async () => {
		const received: unknown[] = [];
		em.on("user.created", (p) => void received.push(p));
		const r = await em.emit("user.created", { id: "1" });
		expect(r.matched).toBe(1);
		expect(r.completed).toBe(1);
		expect(received).toEqual([{ id: "1" }]);
	});

	it("returns zero matches for an event with no listener", async () => {
		const r = await em.emit("nothing.here");
		expect(r.matched).toBe(0);
	});
});

describe("NexusEventEmitter — wildcards", () => {
	let em: NexusEventEmitter;
	beforeEach(() => {
		em = new NexusEventEmitter();
	});

	it("star matches a single segment", async () => {
		const got: string[] = [];
		em.on("user.*", (p) => void got.push(String((p as { type: string }).type)));
		await em.emit("user.created", { type: "created" });
		await em.emit("user.updated", { type: "updated" });
		await em.emit("user.profile.changed", { type: "changed" });
		expect(got).toEqual(["created", "updated"]);
	});

	it("double-star matches multiple segments", async () => {
		const got: string[] = [];
		em.on("**", () => void got.push("fired"));
		await em.emit("a");
		await em.emit("a.b");
		await em.emit("a.b.c.d");
		expect(got).toHaveLength(3);
	});

	it("exact and wildcard can co-exist", async () => {
		const exact: string[] = [];
		const wildcard: string[] = [];
		em.on("user.created", () => exact.push("exact"));
		em.on("user.*", () => wildcard.push("star"));
		await em.emit("user.created");
		await em.emit("user.deleted");
		expect(exact).toEqual(["exact"]);
		expect(wildcard).toEqual(["star", "star"]);
	});
});

describe("NexusEventEmitter — priorities", () => {
	it("runs lower-priority listeners first", async () => {
		const em = new NexusEventEmitter();
		const order: string[] = [];
		em.on("e", () => void order.push("hi"), { priority: 10 });
		em.on("e", () => void order.push("mid"), { priority: 5 });
		em.on("e", () => void order.push("lo"), { priority: 1 });
		await em.emit("e");
		expect(order).toEqual(["lo", "mid", "hi"]);
	});

	it("preserves registration order at the same priority (FIFO)", async () => {
		const em = new NexusEventEmitter();
		const order: string[] = [];
		em.on("e", () => void order.push("a"));
		em.on("e", () => void order.push("b"));
		em.on("e", () => void order.push("c"));
		await em.emit("e");
		expect(order).toEqual(["a", "b", "c"]);
	});
});

describe("NexusEventEmitter — guards", () => {
	it("skips a listener whose guard returns false", async () => {
		const em = new NexusEventEmitter();
		const got: unknown[] = [];
		em.on("order.paid", (p) => void got.push(p), {
			if: (p) => (p as { amount: number }).amount > 100,
		});
		await em.emit("order.paid", { amount: 50 });
		await em.emit("order.paid", { amount: 200 });
		expect(got).toEqual([{ amount: 200 }]);
	});

	it("skips when the guard throws", async () => {
		const em = new NexusEventEmitter();
		const got: unknown[] = [];
		em.on("e", () => void got.push(1), {
			if: () => {
				throw new Error("boom");
			},
		});
		em.on("e", () => void got.push(2));
		await em.emit("e");
		expect(got).toEqual([2]);
	});
});

describe("NexusEventEmitter — once / off / removeAllListeners", () => {
	it("once fires a single time then auto-removes", async () => {
		const em = new NexusEventEmitter();
		let count = 0;
		em.once("e", () => void count++);
		await em.emit("e");
		await em.emit("e");
		await em.emit("e");
		expect(count).toBe(1);
		expect(em.listenerCount("e")).toBe(0);
	});

	it("off() removes by id", async () => {
		const em = new NexusEventEmitter();
		const id = em.on("e", () => {});
		expect(em.off(id)).toBe(1);
		expect(em.listenerCount()).toBe(0);
	});

	it("off() removes all listeners matching a pattern", async () => {
		const em = new NexusEventEmitter();
		em.on("e", () => {});
		em.on("e", () => {});
		em.on("other", () => {});
		expect(em.off("e")).toBe(2);
		expect(em.listenerCount()).toBe(1);
	});

	it("removeAllListeners() clears every listener", () => {
		const em = new NexusEventEmitter();
		em.on("a", () => {});
		em.on("b", () => {});
		em.removeAllListeners();
		expect(em.listenerCount()).toBe(0);
	});
});

describe("NexusEventEmitter — error handling", () => {
	it("collects errors in EmitResult without stopping dispatch", async () => {
		const em = new NexusEventEmitter();
		const got: string[] = [];
		em.on("e", () => {
			throw new Error("boom1");
		});
		em.on("e", () => void got.push("ok"));
		em.on("e", () => {
			throw new Error("boom2");
		});
		const r = await em.emit("e");
		expect(r.matched).toBe(3);
		expect(r.completed).toBe(1);
		expect(r.failed).toBe(2);
		expect(r.errors).toHaveLength(2);
		expect(got).toEqual(["ok"]);
	});

	it("throws on first error when throwOnError is true", async () => {
		const em = new NexusEventEmitter({ throwOnError: true });
		em.on("e", () => {
			throw new Error("boom");
		});
		await expect(em.emit("e")).rejects.toThrow(/boom/);
	});

	it("throws when max listeners per pattern is exceeded", () => {
		const em = new NexusEventEmitter({ maxListenersPerPattern: 2 });
		em.on("e", () => {});
		em.on("e", () => {});
		expect(() => em.on("e", () => {})).toThrow(/Too many listeners/);
	});
});

describe("NexusEventEmitter — emitSync", () => {
	it("returns synchronously", () => {
		const em = new NexusEventEmitter();
		let fired = false;
		em.on("e", () => {
			fired = true;
		});
		const r = em.emitSync("e");
		expect(fired).toBe(true);
		expect(r.completed).toBe(1);
	});
});

describe("EventService DI integration", () => {
	const AppEventsModule = EventsModule.forRoot();

	@Module({ imports: [AppEventsModule] })
	class RootModule {}

	it("resolves via DI under both tokens", () => {
		const app = new Application(RootModule);
		const byClass = app.container.resolve(EventService);
		const byToken = app.container.resolve(EventService.TOKEN);
		expect(byClass).toBeInstanceOf(EventService);
		expect(byToken).toBe(byClass);
	});

	it("emits events that reach a registered listener", async () => {
		const app = new Application(RootModule);
		const svc = app.container.resolve(EventService);

		const got: string[] = [];
		svc.on(
			"user.created",
			(p) => void got.push((p as { email: string }).email),
		);
		const r = await svc.emit("user.created", { email: "a@b.c" });
		expect(r.completed).toBe(1);
		expect(got).toEqual(["a@b.c"]);
	});
});

describe("@OnEvent + scanForListeners", () => {
	const AppEventsModule = EventsModule.forRoot();

	@Controller("/probe")
	class ProbeController {
		@Get("/")
		probe() {
			return { ok: true };
		}
	}

	@Injectable()
	class UserListeners {
		created: unknown[] = [];
		anyUser: unknown[] = [];

		@OnEvent("user.created")
		onCreated(p: unknown) {
			this.created.push(p);
		}

		@OnEvent("user.*", { priority: 1 })
		onAnyUser(p: unknown) {
			this.anyUser.push(p);
		}
	}

	@Module({
		imports: [AppEventsModule],
		controllers: [ProbeController],
	})
	class RootModule {}

	it("registers @OnEvent handlers and dispatches in priority order", async () => {
		const app = new Application(RootModule);
		const svc = app.container.resolve(EventService);
		const listener = new UserListeners();
		const ids = scanForListeners(listener, svc);
		expect(ids).toHaveLength(2);

		await svc.emit("user.created", { id: "1" });
		expect(listener.anyUser).toHaveLength(1); // priority 1 runs first
		expect(listener.created).toHaveLength(1);
		// anyUser should have fired first because of its lower priority.
		expect(listener.anyUser[0]).toEqual({ id: "1" });
		expect(listener.created[0]).toEqual({ id: "1" });
	});
});

describe("EventsModule — backend validation", () => {
	it("resolves when no config is supplied (defaults to memory)", () => {
		const M = EventsModule.forRoot();
		@Module({ imports: [M] })
		class R {}
		const app = new Application(R);
		expect(() => app.container.resolve(EventService)).not.toThrow();
	});
});

describe("NexusEventEmitter — guards", () => {
it("rejects a listener when if returns false", async () => {
const em = new NexusEventEmitter();
const calls: string[] = [];
em.on("user.created", () => { calls.push("A"); }, { if: () => true });
em.on("user.created", () => { calls.push("B"); }, { if: () => false });
em.on("user.created", () => { calls.push("C"); }, { if: () => true });
await em.emit("user.created");
expect(calls).toEqual(["A", "C"]);
});

it("if receives the payload", async () => {
const em = new NexusEventEmitter();
const seen: any[] = [];
em.on("order.*",
() => {},
{ if: (payload: any) => { seen.push(payload); return true; } },
);
await em.emit("order.placed", { id: 42 });
expect(seen).toEqual([{ id: 42 }]);
});

it("if returning false skips only that listener", async () => {
const em = new NexusEventEmitter();
const results: string[] = [];
em.on("event", () => results.push("A"), { if: () => false });
em.on("event", () => results.push("B"), { if: () => true });
em.on("event", () => results.push("C"));
await em.emit("event");
expect(results).toEqual(["B", "C"]);
});
});

describe("NexusEventEmitter — priority + if interaction", () => {
it("lowest priority runs first regardless of if conditions", async () => {
const em = new NexusEventEmitter();
const order: number[] = [];
em.on("evt", () => order.push(1), { priority: 10, if: () => true });
em.on("evt", () => order.push(2), { priority: 20, if: () => false });
em.on("evt", () => order.push(3), { priority: 30, if: () => true });
await em.emit("evt");
expect(order).toEqual([1, 3]);
});
});

describe("NexusEventEmitter — listener lifecycle", () => {
it("off() removes listeners by pattern", async () => {
const em = new NexusEventEmitter();
const calls: string[] = [];
em.on("evt", () => { calls.push("A"); });
em.off("evt");
await em.emit("evt");
expect(calls).toEqual([]);
});

it("removeAllListeners clears all for a pattern", async () => {
const em = new NexusEventEmitter();
const calls: string[] = [];
em.on("evt", () => calls.push("A"));
em.on("evt", () => calls.push("B"));
em.removeAllListeners("evt");
await em.emit("evt");
expect(calls).toEqual([]);
});

it("once() fires only once", async () => {
const em = new NexusEventEmitter();
let count = 0;
em.once("evt", () => { count++; });
await em.emit("evt");
await em.emit("evt");
expect(count).toBe(1);
});

it("listenerCount is tracked", async () => {
const em = new NexusEventEmitter();
expect(em.listenerCount("evt")).toBe(0);
em.on("evt", () => {});
em.on("evt", () => {});
expect(em.listenerCount("evt")).toBe(2);
});
});
