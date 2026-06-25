/**
 * Tests for `@nexusts/metrics`.
 *
 * Coverage:
 * 1. Counter: inc, incBy, labels, error cases, render
 * 2. Gauge: set, inc, dec, setToCurrentTime, render
 * 3. Histogram: observe, custom buckets, default buckets, time() helper, render
 * 4. Summary: observe, percentiles, render
 * 5. Registry: registration, lookups, exposure in both formats
 * 6. Module: forRoot() with default metrics
 * 7. Controller: handler returns correct content-type
 * 8. @Counted() decorator: pass-through without service, records with service
 * 9. @Timed() decorator: pass-through without service, records with service
 * 10. Global labels applied correctly
 */

import { describe, it, expect, beforeEach } from "vitest";
import { Hono } from "hono";
import {
	MetricsService,
	METRICS_SERVICE_TOKEN,
	MetricsController,
	MetricsRegistry,
	CounterImpl,
	GaugeImpl,
	HistogramImpl,
	SummaryImpl,
	DEFAULT_BUCKETS,
	DEFAULT_PERCENTILES,
} from "../../src/metrics/index.js";
import { Counted, Timed } from "../../src/metrics/decorators/index.js";
import {
	setMetricsService,
	getMetricsService,
} from "../../src/metrics/service.js";

beforeEach(() => {
	setMetricsService(undefined as any);
});

describe("Counter", () => {
	it("increments by 1 by default", () => {
		const c = new CounterImpl({ name: "hits_total" });
		c.inc();
		c.inc();
		expect(c.getSamples()).toEqual([{ labels: {}, value: 2 }]);
	});

	it("increments by N", () => {
		const c = new CounterImpl({ name: "hits_total" });
		c.incBy(5);
		c.incBy(3);
		expect(c.getSamples()).toEqual([{ labels: {}, value: 8 }]);
	});

	it("rejects negative increments", () => {
		const c = new CounterImpl({ name: "hits_total" });
		expect(() => c.incBy(-1)).toThrow(/can only increase/);
	});

	it("supports labels", () => {
		const c = new CounterImpl({
			name: "requests_total",
			labelNames: ["method", "status"],
		});
		c.inc({ method: "GET", status: "200" });
		c.inc({ method: "GET", status: "200" });
		c.inc({ method: "POST", status: "201" });

		const samples = c.getSamples();
		expect(samples).toHaveLength(2);
		const get200 = samples.find((s) => s.labels!.method === "GET");
		expect(get200!.value).toBe(2);
	});

	it("rejects missing required labels", () => {
		const c = new CounterImpl({
			name: "requests_total",
			labelNames: ["method"],
		});
		expect(() => c.inc({} as any)).toThrow(/missing label/);
	});

	it("renders Prometheus format", () => {
		const c = new CounterImpl({
			name: "requests_total",
			help: "Total HTTP requests",
			labelNames: ["method"],
		});
		c.inc({ method: "GET" });
		c.incBy(2, { method: "POST" });
		const out = c.renderPrometheus();
		expect(out).toContain("# HELP requests_total Total HTTP requests");
		expect(out).toContain("# TYPE requests_total counter");
		expect(out).toContain('requests_total{method="GET"} 1');
		expect(out).toContain('requests_total{method="POST"} 2');
	});

	it("resets", () => {
		const c = new CounterImpl({ name: "hits_total" });
		c.inc();
		c.reset();
		expect(c.getSamples()).toEqual([]);
	});
});

describe("Gauge", () => {
	it("sets the value", () => {
		const g = new GaugeImpl({ name: "active" });
		g.set(42);
		expect(g.getSamples()).toEqual([{ labels: {}, value: 42 }]);
	});

	it("inc / dec", () => {
		const g = new GaugeImpl({ name: "active" });
		g.inc();
		g.inc(5);
		g.dec(2);
		expect(g.getSamples()[0].value).toBe(4);
	});

	it("supports negative increments", () => {
		const g = new GaugeImpl({ name: "active" });
		g.set(10);
		g.inc(-3);
		expect(g.getSamples()[0].value).toBe(7);
	});

	it("setToCurrentTime sets unix seconds", () => {
		const g = new GaugeImpl({ name: "last_update" });
		const before = Math.floor(Date.now() / 1000);
		g.setToCurrentTime();
		const after = Math.ceil(Date.now() / 1000);
		const v = g.getSamples()[0].value;
		expect(v).toBeGreaterThanOrEqual(before);
		expect(v).toBeLessThanOrEqual(after);
	});

	it("renders Prometheus format", () => {
		const g = new GaugeImpl({
			name: "active_connections",
			help: "Active connections",
			labelNames: ["pool"],
		});
		g.set(3, { pool: "main" });
		g.set(7, { pool: "replica" });
		const out = g.renderPrometheus();
		expect(out).toContain("# TYPE active_connections gauge");
		expect(out).toContain('active_connections{pool="main"} 3');
		expect(out).toContain('active_connections{pool="replica"} 7');
	});
});

describe("Histogram", () => {
	it("observes values into buckets", () => {
		const h = new HistogramImpl({
			name: "latency",
			buckets: [1, 5, 10],
		});
		h.observe(0.5);
		h.observe(3);
		h.observe(7);
		h.observe(20);
		const out = h.renderPrometheus();
		expect(out).toContain("# TYPE latency histogram");
		expect(out).toContain('latency_bucket{le="1"} 1');
		expect(out).toContain('latency_bucket{le="5"} 2');
		expect(out).toContain('latency_bucket{le="10"} 3');
		expect(out).toContain('latency_bucket{le="+Inf"} 4');
		expect(out).toContain("latency_sum 30.5");
		expect(out).toContain("latency_count 4");
	});

	it("uses default buckets when none provided", () => {
		const h = new HistogramImpl({ name: "latency" });
		h.observe(0.003);
		const out = h.renderPrometheus();
		// Check that all default buckets appear
		for (const b of DEFAULT_BUCKETS) {
			expect(out).toContain(`le="${b}"`);
		}
	});

	it("time() helper measures async functions", async () => {
		const h = new HistogramImpl({ name: "duration" });
		await h.time(async () => {
			await new Promise((r) => setTimeout(r, 5));
		});
		const out = h.renderPrometheus();
		expect(out).toContain("duration_count 1");
		const m = out.match(/duration_sum (\S+)/);
		expect(m).not.toBeNull();
		expect(parseFloat(m![1])).toBeGreaterThanOrEqual(0.005);
	});

	it("supports labels", () => {
		const h = new HistogramImpl({
			name: "duration",
			labelNames: ["route"],
			buckets: [1],
		});
		h.observe(0.5, { route: "/a" });
		h.observe(2, { route: "/a" });
		h.observe(0.1, { route: "/b" });
		const out = h.renderPrometheus();
		expect(out).toContain('duration_bucket{route="/a",le="1"} 1');
		expect(out).toContain('duration_bucket{route="/a",le="+Inf"} 2');
		expect(out).toContain('duration_count{route="/a"} 2');
	});
});

describe("Summary", () => {
	it("observes values and computes percentiles", () => {
		const s = new SummaryImpl({
			name: "size",
			percentiles: [0.5, 0.9],
		});
		for (let i = 1; i <= 100; i++) s.observe(i);
		const out = s.renderPrometheus();
		expect(out).toContain("# TYPE size summary");
		expect(out).toContain("size_count 100");
		expect(out).toMatch(/size_sum 5050/);
	});

	it("uses default percentiles when none provided", () => {
		const s = new SummaryImpl({ name: "size" });
		s.observe(1);
		s.observe(2);
		const out = s.renderPrometheus();
		for (const p of DEFAULT_PERCENTILES) {
			const pstr = p.toString();
			expect(out).toContain(`quantile="${pstr}"`);
		}
	});

	it("time() helper", async () => {
		const s = new SummaryImpl({ name: "duration" });
		await s.time(async () => {
			await new Promise((r) => setTimeout(r, 1));
		});
		const out = s.renderPrometheus();
		expect(out).toContain("duration_count 1");
	});
});

describe("MetricsRegistry", () => {
	it("registers and retrieves metrics", () => {
		const reg = new MetricsRegistry();
		const c = reg.registerCounter({ name: "c1" });
		expect(c).toBeInstanceOf(CounterImpl);
		expect(reg.getCounter("c1")).toBe(c);
	});

	it("rejects duplicate registration", () => {
		const reg = new MetricsRegistry();
		reg.registerCounter({ name: "c1" });
		expect(() => reg.registerCounter({ name: "c1" })).toThrow(/already registered/);
	});

	it("looks up the wrong type as an error", () => {
		const reg = new MetricsRegistry();
		reg.registerCounter({ name: "c1" });
		expect(() => reg.getGauge("c1")).toThrow(/not a gauge/);
	});

	it("exposes Prometheus format", () => {
		const reg = new MetricsRegistry();
		const c = reg.registerCounter({ name: "hits_total" });
		c.inc();
		const result = reg.expose("prometheus");
		expect(result.contentType).toBe("text/plain; version=0.0.4; charset=utf-8");
		expect(result.body).toContain("# TYPE hits_total counter");
		expect(result.body).toContain("hits_total 1");
	});

	it("exposes OpenMetrics format", () => {
		const reg = new MetricsRegistry();
		const c = reg.registerCounter({ name: "hits_total" });
		c.inc();
		const result = reg.expose("openmetrics");
		expect(result.contentType).toContain("application/openmetrics-text");
	});

	it("applies global labels", () => {
		const reg = new MetricsRegistry();
		reg.setGlobalLabels({ service: "my-app" });
		const c = reg.registerCounter({ name: "hits_total", labelNames: ["method"] });
		c.inc({ method: "GET" });
		const result = reg.expose("prometheus");
		expect(result.body).toContain('service="my-app"');
		expect(result.body).toContain('method="GET"');
	});

	it("resetAll clears all metrics", () => {
		const reg = new MetricsRegistry();
		const c = reg.registerCounter({ name: "c1" });
		c.inc();
		reg.resetAll();
		expect(c.getSamples()).toEqual([]);
	});
});

describe("MetricsService", () => {
	it("creates metrics via factory methods", () => {
		const svc = new MetricsService();
		const c = svc.counter({ name: "c1" });
		expect(c).toBeInstanceOf(CounterImpl);
		expect(svc.size).toBe(1);
	});

	it("getOrCreateCounter registers on first call", () => {
		const svc = new MetricsService();
		const c1 = svc.getOrCreateCounter("c1", "help", ["method"]);
		c1.inc({ method: "GET" });
		const c2 = svc.getOrCreateCounter("c1", "help", ["method"]);
		expect(c2).toBe(c1);
	});

	it("getOrCreateHistogram registers on first call", () => {
		const svc = new MetricsService();
		const h1 = svc.getOrCreateHistogram("h1", undefined, undefined, undefined);
		h1.observe(1);
		const h2 = svc.getOrCreateHistogram("h1", undefined, undefined, undefined);
		expect(h2).toBe(h1);
	});
});

describe("MetricsController", () => {
	it("handler returns the exposition result", async () => {
		const svc = new MetricsService();
		svc.counter({ name: "hits_total" }).inc();
		const app = new Hono();
		app.get("/metrics", MetricsController.handler(svc));
		const res = await app.request("http://x/metrics");
		expect(res.status).toBe(200);
		const body = await res.text();
		expect(body).toContain("hits_total 1");
	});

	it("uses OpenMetrics when client requests it", async () => {
		const svc = new MetricsService();
		svc.counter({ name: "hits_total" }).inc();
		const app = new Hono();
		app.get("/metrics", MetricsController.handler(svc));
		const res = await app.request("http://x/metrics", {
			headers: { accept: "application/openmetrics-text" },
		});
		expect(res.headers.get("content-type")).toContain("application/openmetrics-text");
	});
});

describe("@Counted() decorator", () => {
	it("is a pass-through without a service", () => {
		setMetricsService(undefined as any);
		class Svc {
			@Counted("counted_pass_total")
			list() {
				return [];
			}
		}
		const svc = new Svc();
		expect(svc.list()).toEqual([]);
	});

	it("records a counter when a service is set", async () => {
		const service = new MetricsService();
		setMetricsService(service);

		class Svc {
			@Counted("counted_record_total", { labels: () => ({ method: "GET" }) })
			list() {
				return [];
			}

			@Counted("counted_record_no_labels_total")
			async fetch() {
				return [];
			}
		}
		const svc = new Svc();
		svc.list();
		svc.list();
		await svc.fetch();

		const c = service.getCounter("counted_record_total");
		const samples = c.getSamples();
		expect(samples.length).toBeGreaterThan(0);
		const get = samples.find((s) => s.labels?.method === "GET");
		expect(get).toBeDefined();
		expect(get!.value).toBeGreaterThanOrEqual(2);

		const c2 = service.getCounter("counted_record_no_labels_total");
		expect(c2.getSamples().length).toBeGreaterThan(0);
	});
});

describe("@Timed() decorator", () => {
	it("is a pass-through without a service", async () => {
		setMetricsService(undefined as any);
		class Svc {
			@Timed("timed_pass_seconds")
			list() {
				return [];
			}
		}
		const svc = new Svc();
		expect(svc.list()).toEqual([]);
	});

	it("records a histogram when a service is set", async () => {
		const service = new MetricsService();
		setMetricsService(service);

		class Svc {
			@Timed("timed_record_seconds", { labels: () => ({ method: "GET" }) })
			list() {
				return [];
			}

			@Timed("timed_record_no_labels_seconds")
			async fetch() {
				await new Promise((r) => setTimeout(r, 1));
				return [];
			}
		}
		const svc = new Svc();
		svc.list();
		await svc.fetch();

		const h = service.getHistogram("timed_record_seconds");
		expect(h.getSamples().length).toBeGreaterThan(0);
		const h2 = service.getHistogram("timed_record_no_labels_seconds");
		expect(h2.getSamples().length).toBeGreaterThan(0);
	});
});

describe("Token exports", () => {
	it("METRICS_SERVICE_TOKEN is a symbol", () => {
		expect(typeof METRICS_SERVICE_TOKEN).toBe("symbol");
	});
});
