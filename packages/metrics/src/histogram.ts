/**
 * `Histogram` — distribution of observed values into buckets.
 *
 * Each `observe()` adds the value to every bucket whose upper bound
 * is >= value. The metric exposes:
 *   - `<name>_bucket{le="..."}` — cumulative count per bucket
 *   - `<name>_sum` — total sum of all observed values
 *   - `<name>_count` — total count
 *
 * Default buckets (Prometheus convention): [0.005, 0.01, 0.025,
 * 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10] seconds.
 *
 * Example:
 *   const h = new Histogram({ name: "http_duration_seconds" });
 *   h.observe(0.123);
 *   await h.time(async () => fetch("/slow"));
 */

import { escapeLabelValue, renderLabels } from "./counter.js";
import type { HistogramOptions, Histogram as IHistogram, MetricSample } from "./types.js";

/** Prometheus default buckets (seconds). */
export const DEFAULT_BUCKETS = [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10];

interface HistogramState {
	buckets: number[]; // count per upper bound
	sum: number;
	count: number;
}

export class HistogramImpl implements IHistogram {
	readonly name: string;
	readonly help?: string;
	readonly labelNames: string[];
	private readonly upperBounds: number[];
	/** Map from "label1=v1,label2=v2" -> state. */
	private states = new Map<string, HistogramState>();

	constructor(opts: HistogramOptions) {
		this.name = opts.name;
		this.help = opts.help;
		this.labelNames = opts.labelNames ?? [];
		const buckets = opts.buckets ?? DEFAULT_BUCKETS;
		// Copy and sort, ensure monotonic increasing
		this.upperBounds = [...buckets].sort((a, b) => a - b);
		if (this.upperBounds.length === 0) {
			throw new Error(`Histogram ${this.name} requires at least one bucket`);
		}
	}

	observe(value: number, labels?: Record<string, string>): void {
		this.assertLabels(labels);
		const k = this.key(labels);
		let s = this.states.get(k);
		if (!s) {
			s = { buckets: new Array(this.upperBounds.length).fill(0), sum: 0, count: 0 };
			this.states.set(k, s);
		}
		s.sum += value;
		s.count++;
		for (let i = 0; i < this.upperBounds.length; i++) {
			if (value <= this.upperBounds[i]) s.buckets[i]++;
		}
	}

	async time<T>(
		fn: (start: number) => Promise<T> | T,
		labels?: Record<string, string>,
	): Promise<T> {
		const start = performance.now();
		try {
			return await fn(start);
		} finally {
			const elapsedMs = performance.now() - start;
			this.observe(elapsedMs / 1000, labels);
		}
	}

	reset(): void {
		this.states.clear();
	}

	getSamples(): MetricSample[] {
		const out: MetricSample[] = [];
		for (const [k, s] of this.states) {
			const labels = this.parseKey(k);
			for (let i = 0; i < this.upperBounds.length; i++) {
				out.push({
					labels: { ...labels, le: String(this.upperBounds[i]) },
					value: s.buckets[i],
				});
			}
			out.push({ labels: { ...labels, le: "+Inf" }, value: s.count });
			out.push({ labels: { ...labels }, value: s.sum });
		}
		return out;
	}

	/** Render this histogram in Prometheus exposition format. */
	renderPrometheus(): string {
		const lines: string[] = [];
		if (this.help) lines.push(`# HELP ${this.name} ${this.help}`);
		lines.push(`# TYPE ${this.name} histogram`);
		for (const { labels, state } of this.enumerateStates()) {
			lines.push(this.renderState(labels, state));
		}
		return lines.join("\n");
	}

	/** Internal: produce Prometheus-formatted lines for a single state. */
	renderState(labels: Record<string, string>, state: HistogramState): string {
		const baseLabels = renderLabels(this.labelNames, labels);
		const lines: string[] = [];

		let cumulative = 0;
		for (let i = 0; i < this.upperBounds.length; i++) {
			cumulative = state.buckets[i];
			const le = this.upperBounds[i];
			const leStr = String(le);
			const lbl = baseLabels ? `${baseLabels},le="${leStr}"` : `le="${leStr}"`;
			lines.push(`${this.name}_bucket{${lbl}} ${cumulative}`);
		}
		{
			const lbl = baseLabels ? `${baseLabels},le="+Inf"` : `le="+Inf"`;
			lines.push(`${this.name}_bucket{${lbl}} ${state.count}`);
		}
		{
			const lbl = baseLabels ? `{${baseLabels}}` : "";
			lines.push(`${this.name}_sum${lbl} ${state.sum}`);
		}
		{
			const lbl = baseLabels ? `{${baseLabels}}` : "";
			lines.push(`${this.name}_count${lbl} ${state.count}`);
		}
		return lines.join("\n");
	}

	/** Internal: enumerate all states for the registry. */
	enumerateStates(): Array<{ labels: Record<string, string>; state: HistogramState }> {
		const out: Array<{ labels: Record<string, string>; state: HistogramState }> = [];
		for (const [k, s] of this.states) {
			out.push({ labels: this.parseKey(k), state: s });
		}
		return out;
	}

	private assertLabels(labels?: Record<string, string>): void {
		if (!labels && this.labelNames.length === 0) return;
		if (this.labelNames.length === 0) {
			throw new Error(`Histogram ${this.name} has no labels declared`);
		}
		if (!labels) {
			throw new Error(`Histogram ${this.name} requires labels: ${this.labelNames.join(", ")}`);
		}
		for (const required of this.labelNames) {
			if (!(required in labels)) {
				throw new Error(`Histogram ${this.name} missing label "${required}"`);
			}
		}
	}

	private key(labels?: Record<string, string>): string {
		if (!labels) return "";
		return this.labelNames.map((n) => `${n}=${escapeLabelValue(labels[n] ?? "")}`).join(",");
	}

	private parseKey(key: string): Record<string, string> {
		if (!key) return {};
		const out: Record<string, string> = {};
		for (const part of key.split(",")) {
			const [k, ...rest] = part.split("=");
			out[k] = rest.join("=");
		}
		return out;
	}
}
