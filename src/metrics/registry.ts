/**
 * `MetricsRegistry` — collection of all metrics registered in the app.
 *
 * The registry is the source of truth for `MetricsService`. It:
 * - Holds every metric (counter / gauge / histogram / summary) by name.
 * - Serializes them to the Prometheus text exposition format.
 * - Supports content negotiation (OpenMetrics vs. Prometheus).
 *
 * Each metric is stored as a unified `RegisteredMetric` so the
 * registry can iterate and call `renderPrometheus()` on each.
 */

import { CounterImpl } from "./counter.js";
import { GaugeImpl } from "./gauge.js";
import { HistogramImpl } from "./histogram.js";
import { SummaryImpl } from "./summary.js";
import type {
	Counter,
	CounterOptions,
	ExpositionFormat,
	ExpositionResult,
	Gauge,
	GaugeOptions,
	Histogram,
	HistogramOptions,
	Summary,
	SummaryOptions,
} from "./types.js";

interface RegisteredMetric {
	name: string;
	type: "counter" | "gauge" | "histogram" | "summary";
	impl: { renderPrometheus(): string; reset(): void };
}

export class MetricsRegistry {
	private metrics = new Map<string, RegisteredMetric>();
	private globalLabels: Record<string, string> = {};

	/** Add a global label that's prepended to every metric line. */
	setGlobalLabels(labels: Record<string, string>): void {
		this.globalLabels = { ...labels };
	}

	getGlobalLabels(): Record<string, string> {
		return { ...this.globalLabels };
	}

	/** Register a counter; returns the same instance for chaining. */
	registerCounter(opts: CounterOptions): Counter {
		if (this.metrics.has(opts.name)) {
			throw new Error(`Metric ${opts.name} is already registered`);
		}
		const c = new CounterImpl(opts);
		this.metrics.set(opts.name, { name: opts.name, type: "counter", impl: c });
		return c;
	}

	registerGauge(opts: GaugeOptions): Gauge {
		if (this.metrics.has(opts.name)) {
			throw new Error(`Metric ${opts.name} is already registered`);
		}
		const g = new GaugeImpl(opts);
		this.metrics.set(opts.name, { name: opts.name, type: "gauge", impl: g });
		return g;
	}

	registerHistogram(opts: HistogramOptions): Histogram {
		if (this.metrics.has(opts.name)) {
			throw new Error(`Metric ${opts.name} is already registered`);
		}
		const h = new HistogramImpl(opts);
		this.metrics.set(opts.name, { name: opts.name, type: "histogram", impl: h });
		return h;
	}

	registerSummary(opts: SummaryOptions): Summary {
		if (this.metrics.has(opts.name)) {
			throw new Error(`Metric ${opts.name} is already registered`);
		}
		const s = new SummaryImpl(opts);
		this.metrics.set(opts.name, { name: opts.name, type: "summary", impl: s });
		return s;
	}

	/** Return a metric by name, regardless of type. */
	get(name: string): RegisteredMetric | undefined {
		return this.metrics.get(name);
	}

	/** Return a counter by name. Throws if it isn't a counter. */
	getCounter(name: string): Counter {
		const m = this.metrics.get(name);
		if (!m) throw new Error(`Counter ${name} is not registered`);
		if (m.type !== "counter") throw new Error(`Metric ${name} is a ${m.type}, not a counter`);
		return m.impl as unknown as Counter;
	}

	/** Return a gauge by name. */
	getGauge(name: string): Gauge {
		const m = this.metrics.get(name);
		if (!m) throw new Error(`Gauge ${name} is not registered`);
		if (m.type !== "gauge") throw new Error(`Metric ${name} is a ${m.type}, not a gauge`);
		return m.impl as unknown as Gauge;
	}

	/** Return a histogram by name. */
	getHistogram(name: string): Histogram {
		const m = this.metrics.get(name);
		if (!m) throw new Error(`Histogram ${name} is not registered`);
		if (m.type !== "histogram") throw new Error(`Metric ${name} is a ${m.type}, not a histogram`);
		return m.impl as unknown as Histogram;
	}

	/** Return a summary by name. */
	getSummary(name: string): Summary {
		const m = this.metrics.get(name);
		if (!m) throw new Error(`Summary ${name} is not registered`);
		if (m.type !== "summary") throw new Error(`Metric ${name} is a ${m.type}, not a summary`);
		return m.impl as unknown as Summary;
	}

	/** Number of registered metrics. */
	get size(): number {
		return this.metrics.size;
	}

	/** Names of all registered metrics, sorted. */
	names(): string[] {
		return [...this.metrics.keys()].sort();
	}

	/** Reset all metrics (clear values). */
	resetAll(): void {
		for (const m of this.metrics.values()) {
			m.impl.reset();
		}
	}

	/** Serialize all metrics to the requested exposition format. */
	expose(format: ExpositionFormat = "prometheus"): ExpositionResult {
		const sections: string[] = [];
		const globalLabelsStr = renderGlobalLabels(this.globalLabels);

		for (const m of this.metrics.values()) {
			const out = m.impl.renderPrometheus();
			if (globalLabelsStr) {
				sections.push(applyGlobalLabels(out, this.globalLabels));
			} else {
				sections.push(out);
			}
		}

		const body = sections.filter((s) => s.length > 0).join("\n\n");
		const contentType =
			format === "openmetrics"
				? "application/openmetrics-text; version=1.0.0; charset=utf-8"
				: "text/plain; version=0.0.4; charset=utf-8";
		return { body: body + (body.endsWith("\n") ? "" : "\n"), contentType };
	}
}

function renderGlobalLabels(labels: Record<string, string>): string {
	const keys = Object.keys(labels);
	if (keys.length === 0) return "";
	return keys.map((k) => `${k}="${labels[k]}"`).join(",");
}

function applyGlobalLabels(block: string, labels: Record<string, string>): string {
	const keys = Object.keys(labels);
	if (keys.length === 0) return block;
	const prefix = keys.map((k) => `${k}="${labels[k]}"`).join(",");
	return block
		.split("\n")
		.map((line) => {
			if (line.startsWith("#")) return line;
			const openBrace = line.indexOf("{");
			if (openBrace === -1) {
				const space = line.indexOf(" ");
				if (space === -1) return line;
				const metric = line.slice(0, space);
				const rest = line.slice(space);
				return `${metric}{${prefix}}${rest}`;
			}
			const closeBrace = line.indexOf("}", openBrace);
			if (closeBrace === -1) return line;
			const existing = line.slice(openBrace + 1, closeBrace);
			return `${line.slice(0, openBrace + 1)}${prefix},${existing}${line.slice(closeBrace)}`;
		})
		.join("\n");
}
