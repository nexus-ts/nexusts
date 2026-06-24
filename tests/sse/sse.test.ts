/**
 * Tests for nexus/sse — SseStream class + sse() helper + Hono integration.
 */

import "reflect-metadata";
import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getLastEventId, sse } from "../../src/sse/sse.js";
import { SseStream } from "../../src/sse/sse-stream.js";

// ---------------------------------------------------------------------------
// Mock HonoSSEApi
// ---------------------------------------------------------------------------

function makeMockApi(): any {
	const events: Array<{ id?: string; event?: string; data: string; retry?: number }> = [];
	const closed: { value: boolean; _resolve?: () => void } = { value: false };
	const abortedCallbacks: Array<() => void> = [];
	const closePromise = new Promise<void>((resolve) => {
		closed._resolve = resolve;
	});

	const api = {
		writeSSE: vi.fn(async (msg: any) => {
			events.push(msg);
		}),
		sleep: vi.fn(async (ms: number) => {
			await new Promise<void>((r) => setTimeout(r, ms));
		}),
		close: vi.fn(async () => {
			closed.value = true;
			closed._resolve?.();
		}),
		abort: vi.fn(() => {
			closed.value = true;
			for (const cb of abortedCallbacks) cb();
		}),
		onAbort: vi.fn((cb: () => void) => {
			abortedCallbacks.push(cb);
		}),
		events,
		isClosed: () => closed.value,
		triggerAbort: () => {
			closed.value = true;
			for (const cb of abortedCallbacks) cb();
		},
		_waitForClose: closePromise,
	};
	return api;
}

// ---------------------------------------------------------------------------
// SseStream unit tests
// ---------------------------------------------------------------------------

describe("SseStream · writeSSE behavior", () => {
	let api: ReturnType<typeof makeMockApi>;
	let stream: SseStream;

	beforeEach(() => {
		api = makeMockApi();
		stream = new SseStream(api as any);
	});

	it("serialises string data verbatim", () => {
		stream.send("hello");
		expect(api.events).toEqual([{ data: "hello" }]);
	});

	it("JSON-serialises object data", () => {
		stream.send({ data: { x: 1, y: "z" } });
		expect(api.events).toEqual([{ data: JSON.stringify({ x: 1, y: "z" }) }]);
	});

	it("includes id, event, retry when provided", () => {
		stream.send({ id: 42, event: "tick", data: { count: 1 }, retry: 3000 });
		const e = api.events[0]!;
		expect(e.id).toBe("42");
		expect(e.event).toBe("tick");
		expect(e.retry).toBe(3000);
		expect(e.data).toBe(JSON.stringify({ count: 1 }));
	});

	it("send() is no-op after close()", async () => {
		await stream.close();
		stream.send({ data: "after close" });
		expect(api.events).toEqual([]);
	});

	it("close() is idempotent", async () => {
		await stream.close();
		await stream.close();
		expect(api.close).toHaveBeenCalledTimes(1);
	});

	it("returns the correct closed state", async () => {
		expect(stream.closed).toBe(false);
		await stream.close();
		expect(stream.closed).toBe(true);
	});
});

describe("SseStream · onClose callback", () => {
	it("fires onClose when close() is called", async () => {
		const api = makeMockApi();
		const stream = new SseStream(api as any);
		const cb = vi.fn();
		stream.onClose(cb);
		await stream.close();
		expect(cb).toHaveBeenCalledTimes(1);
	});

	it("fires onClose when the underlying API is aborted", () => {
		const api = makeMockApi();
		const stream = new SseStream(api as any);
		const cb = vi.fn();
		stream.onClose(cb);
		api.triggerAbort();
		expect(cb).toHaveBeenCalledTimes(1);
	});

	it("invokes onClose immediately if already closed", async () => {
		const api = makeMockApi();
		const stream = new SseStream(api as any);
		await stream.close();
		const cb = vi.fn();
		stream.onClose(cb);
		expect(cb).toHaveBeenCalledTimes(1);
	});

	it("swallows exceptions from onClose callbacks", async () => {
		const api = makeMockApi();
		const stream = new SseStream(api as any);
		stream.onClose(() => {
			throw new Error("boom");
		});
		// Should not propagate.
		await stream.close();
	});
});

// ---------------------------------------------------------------------------
// Hono integration
// ---------------------------------------------------------------------------

describe("sse() · Hono integration", () => {
	let app: Hono;

	beforeEach(() => {
		app = new Hono();
	});

	it("returns a Response with text/event-stream content type", async () => {
		app.get("/events", (c) =>
			sse(c, (stream) => {
				stream.send({ data: "hello" });
			}),
		);
		const res = await app.request("http://x/events");
		expect(res.status).toBe(200);
		expect(res.headers.get("content-type")).toContain("text/event-stream");
	});

	it("streams events as data: lines separated by blank lines", async () => {
		app.get("/events", (c) =>
			sse(c, (stream) => {
				stream.send({ event: "tick", data: { n: 1 } });
				stream.send({ event: "tick", data: { n: 2 } });
				stream.send({ data: "done" });
			}),
		);
		const res = await app.request("http://x/events");
		const text = await res.text();
		expect(text).toContain("event: tick");
		expect(text).toContain("data: {\"n\":1}");
		expect(text).toContain("data: {\"n\":2}");
		expect(text).toContain("data: done");
		// Events separated by blank lines.
		expect(text).toContain("\n\n");
	});

	it("supports the id field for reconnection", async () => {
		app.get("/events", (c) =>
			sse(c, (stream) => {
				stream.send({ id: 1, data: "first" });
				stream.send({ id: 2, data: "second" });
			}),
		);
		const res = await app.request("http://x/events");
		const text = await res.text();
		expect(text).toContain("id: 1");
		expect(text).toContain("id: 2");
	});

	it("supports the retry field", async () => {
		app.get("/events", (c) =>
			sse(c, (stream) => {
				stream.send({ retry: 5000, data: "reconnect me in 5s" });
			}),
		);
		const res = await app.request("http://x/events");
		const text = await res.text();
		expect(text).toContain("retry: 5000");
	});

	it("fires onClose callbacks when the client disconnects", async () => {
		// Use a stream that writes a tick periodically. The abort
		// signal from the controller should stop it.
		const onClose = vi.fn();
		app.get("/events", (c) =>
			sse(c, (stream) => {
				stream.send({ data: "started" });
				const t = setInterval(() => {
					stream.send({ data: "tick" });
				}, 10);
				stream.onClose(() => {
					clearInterval(t);
					onClose();
				});
			}),
		);

		const res = await app.request("http://x/events");
		// Read the body so the stream is actually consumed.
		await res.text();
		// After consumption, onClose should have been called.
		expect(onClose).toHaveBeenCalled();
	});
});

// ---------------------------------------------------------------------------
// Last-Event-ID helper
// ---------------------------------------------------------------------------

describe("getLastEventId", () => {
	it("returns the header value when present", () => {
		const c = {
			req: { header: (n: string) => (n === "Last-Event-ID" ? "42" : undefined) },
		} as any;
		expect(getLastEventId(c)).toBe("42");
	});

	it("returns null when the header is missing", () => {
		const c = { req: { header: () => undefined } } as any;
		expect(getLastEventId(c)).toBe(null);
	});
});
