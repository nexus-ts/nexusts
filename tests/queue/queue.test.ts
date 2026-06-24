/**
 * Queue module tests — uses the in-memory backend so we don't need
 * Redis or a Worker runtime.
 *
 * Covers:
 *   - MemoryQueueBackend: add, addBatch, process, drain, stop
 *   - QueueService: DI resolution, add/process, event broadcasting
 *   - QueueModule.forRoot: registers QueueService under both tokens
 *   - OnQueueReady + invokeQueueReadyHooks: lifecycle wiring
 */

import "reflect-metadata";
import { Application } from "@core/application";
import { Controller } from "@core/decorators/controller";
import { Get } from "@core/decorators/http-methods";
import { Inject, Injectable } from "@core/decorators/injectable";
import { Module } from "@core/decorators/module";
import { beforeEach, describe, expect, it } from "vitest";
import {
	invokeQueueReadyHooks,
	MemoryQueueBackend,
	OnQueueReady,
	QueueModule,
	QueueService,
} from "../../src/queue/index.js";
import type { QueueEvent } from "../../src/queue/types.js";

describe("MemoryQueueBackend", () => {
	let backend: MemoryQueueBackend;

	beforeEach(() => {
		backend = new MemoryQueueBackend();
	});

	it('exposes name = "memory"', () => {
		expect(backend.name).toBe("memory");
	});

	it("add() returns a job ID", async () => {
		const job = await backend.add("send-email", { to: "a@b.c" });
		expect(job.jobId).toMatch(/^mem-/);
		expect(job.name).toBe("send-email");
	});

	it("add() emits a job:added event", async () => {
		const events: QueueEvent[] = [];
		backend.on((e) => events.push(e));
		await backend.add("send-email", { to: "a@b.c" });
		expect(events.some((e) => e.kind === "job:added")).toBe(true);
	});

	it("addBatch() enqueues multiple jobs", async () => {
		const jobs = await backend.addBatch([
			{ name: "send-email", data: { to: "a@b.c" } },
			{ name: "send-email", data: { to: "d@e.f" } },
		]);
		expect(jobs).toHaveLength(2);
	});

	it("process() registers a handler that runs on the next tick", async () => {
		const handled: unknown[] = [];
		await backend.process("send-email", async (data) => {
			handled.push(data);
			return { status: "completed" };
		});
		await backend.add("send-email", { to: "a@b.c" });
		await new Promise((r) => setTimeout(r, 200)); // wait for tick + handle
		expect(handled).toHaveLength(1);
		expect((handled[0] as { to: string }).to).toBe("a@b.c");
	});

	it("drain() waits for in-flight jobs", async () => {
		let done = false;
		await backend.process("slow", async () => {
			await new Promise((r) => setTimeout(r, 100));
			done = true;
			return { status: "completed" };
		});
		await backend.add("slow", {});
		await backend.drain();
		expect(done).toBe(true);
	});

	it("stop() clears the tick interval", async () => {
		await backend.stop();
		// No way to inspect the interval directly, but add() should still
		// work (it just queues to memory).
		const job = await backend.add("send-email", {});
		expect(job.jobId).toBeTruthy();
	});
});

describe("QueueService", () => {
	class TestModule {}
	const AppQueueModule = QueueModule.forRoot({ backend: "memory" });

	@Module({
		imports: [AppQueueModule],
	})
	class RootModule {}

	it("resolves QueueService via DI under both class and Symbol token", () => {
		const app = new Application(RootModule);
		const byClass = app.container.resolve(QueueService) as QueueService;
		const byToken = app.container.resolve(QueueService.TOKEN) as QueueService;
		expect(byClass).toBeInstanceOf(QueueService);
		expect(byToken).toBe(byClass);
	});

	it("exposes the configured backend", () => {
		const app = new Application(RootModule);
		const svc = app.container.resolve(QueueService) as QueueService;
		expect(svc.backend).toBeInstanceOf(MemoryQueueBackend);
		expect(svc.backend.name).toBe("memory");
	});

	it("add() goes through the backend", async () => {
		const app = new Application(RootModule);
		await app.container.resolve(QueueService).start();
		const svc = app.container.resolve(QueueService) as QueueService;
		const job = await svc.add("ping", { hello: "world" });
		expect(job.name).toBe("ping");
		await svc.stop();
	});

	it("on() subscribes to backend events", async () => {
		const app = new Application(RootModule);
		const svc = app.container.resolve(QueueService) as QueueService;
		await svc.start();
		const events: QueueEvent[] = [];
		svc.on((e) => events.push(e));
		await svc.add("ping", {});
		expect(events.some((e) => e.kind === "job:added")).toBe(true);
		await svc.stop();
	});
});

describe("QueueModule.forRoot — backend validation", () => {
	it("throws when QueueService is resolved with bullmq backend but no connection", () => {
		const AppBadModule = QueueModule.forRoot({ backend: "bullmq" });

		@Module({ imports: [AppBadModule] })
		class BadRoot {}

		const app = new Application(BadRoot);
		expect(() => app.container.resolve(QueueService)).toThrow(
			/bullmq\.connection/,
		);
	});

	it("throws when QueueService is resolved with cloudflare backend but no resolveBinding", () => {
		const AppBadModule = QueueModule.forRoot({ backend: "cloudflare" });

		@Module({ imports: [AppBadModule] })
		class BadRoot {}

		const app = new Application(BadRoot);
		expect(() => app.container.resolve(QueueService)).toThrow(
			/cloudflare\.resolveBinding/,
		);
	});
});

describe("@OnQueueReady + invokeQueueReadyHooks", () => {
	it("invokes all hooks on the instance", async () => {
		let hook1Called = false;
		let hook2Called = false;

		class Worker {
			@OnQueueReady()
			async init() {
				hook1Called = true;
			}

			@OnQueueReady()
			async bind() {
				hook2Called = true;
			}
		}

		const w = new Worker();
		await invokeQueueReadyHooks(w);
		expect(hook1Called).toBe(true);
		expect(hook2Called).toBe(true);
	});

	it("returns no hooks for a class without the decorator", async () => {
		class PlainWorker {}
		const w = new PlainWorker();
		await invokeQueueReadyHooks(w); // should not throw
		expect(true).toBe(true);
	});

	it("a worker hooks into the queue and processes jobs", async () => {
		let registered = false;
		const handled: unknown[] = [];

		class EmailWorker {
			@OnQueueReady()
			async register() {
				registered = true;
			}

			handle = async (data: unknown) => {
				handled.push(data);
				return { status: "completed" as const };
			};
		}

		const AppQueueModule = QueueModule.forRoot({ backend: "memory" });

		@Controller("/probe")
		class ProbeController {
			@Get("/")
			async probe() {
				return { registered };
			}
		}

		@Module({
			imports: [AppQueueModule],
			controllers: [ProbeController],
		})
		class RootModule {}

		const app = new Application(RootModule);
		const svc = app.container.resolve(QueueService) as QueueService;
		await svc.start();
		await svc.process("send-email", async (data) => {
			handled.push(data);
			return { status: "completed" as const };
		});

		const worker = new EmailWorker();
		await invokeQueueReadyHooks(worker);

		expect(registered).toBe(true);

		await svc.add("send-email", { to: "x@y.z" });
		await new Promise((r) => setTimeout(r, 250));
		expect(handled.length).toBeGreaterThan(0);

		await svc.stop();
	});
});
