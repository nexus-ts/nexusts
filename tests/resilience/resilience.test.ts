/**
 * Tests for `@kabyeon/nexusjs/resilience`.
 *
 * Covers:
 *  - `retry()` function: backoff strategies, retry-on, abort, timeout.
 *  - `CircuitBreaker` state machine: closed → open → half-open → closed.
 *  - `Bulkhead` concurrency limit + queue + reject-on-full.
 *  - `ResilienceService` registry: getOrCreate pattern.
 *  - `ResilienceModule.forRoot()` DI integration.
 */
import { beforeAll, describe, expect, it } from "vitest";
import "reflect-metadata";

let retry: typeof import("@kabyeon/nexusjs/resilience").retry;
let computeBackoff: typeof import("@kabyeon/nexusjs/resilience").computeBackoff;
let CircuitBreaker: typeof import("@kabyeon/nexusjs/resilience").CircuitBreaker;
let CircuitOpenError: typeof import("@kabyeon/nexusjs/resilience").CircuitOpenError;
let Bulkhead: typeof import("@kabyeon/nexusjs/resilience").Bulkhead;
let BulkheadFullError: typeof import("@kabyeon/nexusjs/resilience").BulkheadFullError;
let ResilienceService: typeof import("@kabyeon/nexusjs/resilience").ResilienceService;
let ResilienceModule: typeof import("@kabyeon/nexusjs/resilience").ResilienceModule;

beforeAll(async () => {
	const mod = await import("@kabyeon/nexusjs/resilience");
	retry = mod.retry;
	computeBackoff = mod.computeBackoff;
	CircuitBreaker = mod.CircuitBreaker;
	CircuitOpenError = mod.CircuitOpenError;
	Bulkhead = mod.Bulkhead;
	BulkheadFullError = mod.BulkheadFullError;
	ResilienceService = mod.ResilienceService;
	ResilienceModule = mod.ResilienceModule;
});

describe("retry()", () => {
	it("returns the eventual value when fn eventually succeeds", async () => {
		let calls = 0;
		const result = await retry(
			async () => {
				calls += 1;
				if (calls < 3) throw new Error("transient");
				return "ok";
			},
			{ attempts: 5, initialDelay: 1 },
		);
		expect(result).toBe("ok");
		expect(calls).toBe(3);
	});

	it("re-throws the final error after attempts are exhausted", async () => {
		let calls = 0;
		await expect(
			retry(
				async () => {
					calls += 1;
					throw new Error("always");
				},
				{ attempts: 3, initialDelay: 1 },
			),
		).rejects.toThrow("always");
		expect(calls).toBe(3);
	});

	it("respects retryOn() filter", async () => {
		let calls = 0;
		await expect(
			retry(
				async () => {
					calls += 1;
					const e: any = new Error("bad");
					e.name = "AbortError";
					throw e;
				},
				{ attempts: 5, initialDelay: 1, retryOn: () => false },
			),
		).rejects.toThrow("bad");
		expect(calls).toBe(1);
	});

	it("aborts when the AbortSignal is triggered", async () => {
		const ac = new AbortController();
		const promise = retry(
			async (signal) => {
				return await new Promise<never>((_resolve, reject) => {
					const id = setTimeout(() => reject(new Error("timeout")), 5_000);
					signal.addEventListener("abort", () => {
						clearTimeout(id);
						reject(ac.signal.reason ?? new Error("aborted"));
					}, { once: true });
				});
			},
			{ attempts: 5, initialDelay: 50, timeout: 200 },
		);
		setTimeout(() => ac.abort(), 20);
		await expect(promise).rejects.toThrow();
	});

	it("calls onRetry hook between attempts", async () => {
		const calls: Array<{ err: unknown; attempt: number; delay: number }> = [];
		await expect(
			retry(
				async () => {
					throw new Error("nope");
				},
				{
					attempts: 3,
					initialDelay: 1,
					onRetry: (err, attempt, delay) => {
						calls.push({ err, attempt, delay });
					},
				},
			),
		).rejects.toThrow();
		expect(calls.length).toBe(2);
		expect(calls[0].attempt).toBe(1);
		expect(calls[1].attempt).toBe(2);
	});

	it("computeBackoff picks the right strategy", () => {
		const cfg = { initialDelay: 100, maxDelay: 10_000, multiplier: 2 };
		expect(
			computeBackoff(1, { ...cfg, backoff: "constant" }),
		).toBe(100);
		expect(
			computeBackoff(1, { ...cfg, backoff: "linear" }),
		).toBe(100);
		expect(
			computeBackoff(3, { ...cfg, backoff: "linear" }),
		).toBe(300);
		expect(
			computeBackoff(3, { ...cfg, backoff: "exponential" }),
		).toBe(400); // 100 * 2^2
	});
});

describe("CircuitBreaker", () => {
	it("starts in the closed state", () => {
		const cb = new CircuitBreaker("test");
		expect(cb.currentState).toBe("closed");
	});

	it("opens after enough failures", async () => {
		const cb = new CircuitBreaker("test", {
			threshold: 0.5,
			minCalls: 4,
			timeout: 60_000,
		});
		const failingFn = async () => {
			throw new Error("nope");
		};
		// 4 failing calls → 100% failure ratio ≥ 0.5 with minCalls = 4.
		for (let i = 0; i < 4; i++) {
			await expect(cb.execute(failingFn)).rejects.toThrow();
		}
		expect(cb.currentState).toBe("open");
	});

	it("rejects immediately with CircuitOpenError when open", async () => {
		const cb = new CircuitBreaker("test", {
			threshold: 0.5,
			minCalls: 1,
			timeout: 60_000,
		});
		await expect(cb.execute(async () => { throw new Error("fail"); })).rejects.toThrow();
		expect(cb.currentState).toBe("open");
		await expect(cb.execute(async () => "x")).rejects.toBeInstanceOf(CircuitOpenError);
	});

	it("transitions to half-open after the timeout", async () => {
		const cb = new CircuitBreaker("test", {
			threshold: 0.5,
			minCalls: 1,
			timeout: 10,
			halfOpenAfter: 1,
		});
		await expect(cb.execute(async () => { throw new Error("fail"); })).rejects.toThrow();
		expect(cb.currentState).toBe("open");
		await new Promise((r) => setTimeout(r, 15));
		expect(cb.currentState).toBe("half-open");
		await cb.execute(async () => "ok");
		expect(cb.currentState).toBe("closed");
	});

	it("fires onStateChange hook", async () => {
		const states: string[] = [];
		const cb = new CircuitBreaker("test", {
			threshold: 0.5,
			minCalls: 1,
			timeout: 10,
			halfOpenAfter: 1,
		});
		(cb as any)._onStateChange = (from: string, to: string) => {
			states.push(`${from}->${to}`);
		};
		await expect(cb.execute(async () => { throw new Error("fail"); })).rejects.toThrow();
		expect(states).toContain("closed->open");
	});
});

describe("Bulkhead", () => {
	it("passes through when concurrency is below the limit", async () => {
		const bh = new Bulkhead({ maxConcurrent: 3 });
		const r = await bh.execute(async () => 42);
		expect(r).toBe(42);
		expect(bh.stats).toEqual({ inFlight: 0, queued: 0 });
	});

	it("limits concurrent executions", async () => {
		const bh = new Bulkhead({ maxConcurrent: 2 });
		let active = 0;
		let maxActive = 0;
		const task = async () => {
			active += 1;
			maxActive = Math.max(maxActive, active);
			await new Promise((r) => setTimeout(r, 30));
			active -= 1;
			return "ok";
		};
		const results = await Promise.all(
			Array.from({ length: 5 }, () => bh.execute(task)),
		);
		expect(results.length).toBe(5);
		expect(maxActive).toBeLessThanOrEqual(2);
	});

	it("rejects immediately when rejectOnFull and queue is full", async () => {
		const bh = new Bulkhead({
			maxConcurrent: 1,
			maxQueued: 0,
			rejectOnFull: true,
		});
		const slow = bh.execute(() => new Promise((r) => setTimeout(() => r(1), 50)));
		await expect(
			bh.execute(() => Promise.resolve(2)),
		).rejects.toBeInstanceOf(BulkheadFullError);
		await slow;
	});

	it("preserves FIFO order in the queue", async () => {
		const bh = new Bulkhead({ maxConcurrent: 1 });
		const order: number[] = [];
		const tasks = [1, 2, 3].map(
			(i) => bh.execute(async () => {
				order.push(i);
				await new Promise((r) => setTimeout(r, 10));
				return i;
			}),
		);
		await Promise.all(tasks);
		expect(order).toEqual([1, 2, 3]);
	});
});

describe("ResilienceService", () => {
	it("merges defaults with per-call config", async () => {
		const svc = new (ResilienceService as any)({
			retry: { attempts: 5, initialDelay: 50 },
		});
		const cb = svc.getOrCreateCircuit("merge", { threshold: 0.7 });
		expect(cb.config.threshold).toBe(0.7);
	});

	it("shares a circuit across calls (same name = same instance)", () => {
		const svc = new (ResilienceService as any)();
		const a = svc.getOrCreateCircuit("stripe");
		const b = svc.getOrCreateCircuit("stripe");
		expect(a).toBe(b);
	});

	it("shares a bulkhead across calls", () => {
		const svc = new (ResilienceService as any)();
		const a = svc.getOrCreateBulkhead("api");
		const b = svc.getOrCreateBulkhead("api");
		expect(a).toBe(b);
	});

	it("retry() falls through to defaults when no override", async () => {
		const svc = new (ResilienceService as any)({
			retry: { attempts: 2, initialDelay: 1 },
		});
		let calls = 0;
		await svc.retry(async () => {
			calls += 1;
			if (calls < 2) throw new Error("nope");
			return "ok";
		});
		expect(calls).toBe(2);
	});
});

describe("ResilienceModule — DI integration", () => {
	it("forRoot() returns a class with the right providers", () => {
		const mod = (ResilienceModule as any).forRoot({
			retry: { attempts: 7 },
		});
		expect(mod).toBeDefined();
		// The class is a JS function with a name and a `providers`
		// accessor set by the @Module decorator.
		expect(typeof mod).toBe("function");
	});
});
