/**
 * `Summary` — quantile estimation over a sliding window of values.
 *
 * Summary is similar to Histogram but computes client-side quantiles
 * (via t-digest-style sorting). It's useful when you need a small
 * number of percentiles (50/90/99) without the storage cost of
 * histograms.
 *
 * Quantile computation uses a simple sorted-window approach: each
 * label combination keeps a circular buffer of the last N values.
 *
 * Example:
 *   const s = new Summary({
 *     name: "http_request_size_bytes",
 *     percentiles: [0.5, 0.9, 0.99],
 *   });
 *   s.observe(1024);
 */

import { escapeLabelValue, renderLabels } from "./counter.js";
import type { Summary as ISummary, MetricSample, SummaryOptions } from "./types.js";

/** Default percentiles. */
export const DEFAULT_PERCENTILES = [0.5, 0.9, 0.99];
/** Default sliding window size. */
export const DEFAULT_MAX_AGE_SECONDS = 600;
export const DEFAULT_AGE_BUCKETS = 5;

interface SummaryState {
	/** For each age bucket, an array of (sum, count) pairs. */
	buckets: Array<{ values: number[]; sum: number; count: number }>;
	/** Index of the next bucket to rotate. */
	currentBucket: number;
	/** Last rotation time. */
	lastRotation: number;
}

export class SummaryImpl implements ISummary {
	readonly name: string;
	readonly help?: string;
	readonly labelNames: string[];
	private readonly percentiles: number[];
	private readonly maxAgeSeconds: number;
	private readonly ageBuckets: number;
	private readonly bucketSize: number;
	/** Map from "label1=v1,label2=v2" -> state. */
	private states = new Map<string, SummaryState>();

	constructor(opts: SummaryOptions) {
		this.name = opts.name;
		this.help = opts.help;
		this.labelNames = opts.labelNames ?? [];
		this.percentiles = opts.percentiles ?? DEFAULT_PERCENTILES;
		this.maxAgeSeconds = opts.maxAgeSeconds ?? DEFAULT_MAX_AGE_SECONDS;
		this.ageBuckets = opts.ageBuckets ?? DEFAULT_AGE_BUCKETS;
		this.bucketSize = Math.ceil(this.maxAgeSeconds / this.ageBuckets);
	}

	observe(value: number, labels?: Record<string, string>): void {
		this.assertLabels(labels);
		const k = this.key(labels);
		let s = this.states.get(k);
		if (!s) {
			s = this.newState();
			this.states.set(k, s);
		}
		this.maybeRotate(s);
		const b = s.buckets[s.currentBucket];
		b.values.push(value);
		b.sum += value;
		b.count++;
	}

	async time<T>(
		fn: () => Promise<T> | T,
		labels?: Record<string, string>,
	): Promise<T> {
		const start = performance.now();
		try {
			return await fn();
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
		for (const [k] of this.states) {
			out.push({ labels: this.parseKey(k), value: 0 });
		}
		return out;
	}

	/** Render this summary in Prometheus exposition format. */
	renderPrometheus(): string {
		const lines: string[] = [];
		if (this.help) lines.push(`# HELP ${this.name} ${this.help}`);
		lines.push(`# TYPE ${this.name} summary`);

		for (const [k, s] of this.states) {
			const labels = this.parseKey(k);
			this.maybeRotate(s);
			const totals = this.totals(s);

			for (const q of this.percentiles) {
				const qval = this.quantile(s, q);
				const qstr = clampQuantileLabel(q);
				// The "quantile" label is always present, even if no
				// labelNames are declared. It's a special summary label.
				const fullLabels: Record<string, string> = { ...labels, quantile: qstr };
				const baseStr = renderLabels(this.labelNames, fullLabels);
				const lbl = baseStr ? `${baseStr},quantile="${qstr}"` : `quantile="${qstr}"`;
				lines.push(`${this.name}{${lbl}} ${qval}`);
			}
			{
				const lbl = renderLabels(this.labelNames, labels);
				lines.push(`${this.name}_sum${lbl ? `{${lbl}}` : ""} ${totals.sum}`);
				lines.push(`${this.name}_count${lbl ? `{${lbl}}` : ""} ${totals.count}`);
			}
		}
		return lines.join("\n");
	}

	/* ----------------- internals ----------------- */

	private newState(): SummaryState {
		const buckets: SummaryState["buckets"] = [];
		for (let i = 0; i < this.ageBuckets; i++) {
			buckets.push({ values: [], sum: 0, count: 0 });
		}
		return { buckets, currentBucket: 0, lastRotation: Date.now() };
	}

	private maybeRotate(s: SummaryState): void {
		const now = Date.now();
		const elapsed = (now - s.lastRotation) / 1000;
		if (elapsed >= this.bucketSize) {
			const rotations = Math.floor(elapsed / this.bucketSize);
			for (let i = 0; i < rotations; i++) {
				s.currentBucket = (s.currentBucket + 1) % this.ageBuckets;
				s.buckets[s.currentBucket] = { values: [], sum: 0, count: 0 };
			}
			s.lastRotation = now;
		}
	}

	private totals(s: SummaryState): { sum: number; count: number } {
		let sum = 0;
		let count = 0;
		for (const b of s.buckets) {
			sum += b.sum;
			count += b.count;
		}
		return { sum, count };
	}

	private quantile(s: SummaryState, q: number): number {
		// Collect all values across buckets
		const all: number[] = [];
		for (const b of s.buckets) {
			for (const v of b.values) all.push(v);
		}
		if (all.length === 0) return 0;
		all.sort((a, b) => a - b);
		const idx = Math.min(all.length - 1, Math.max(0, Math.floor(q * all.length)));
		return all[idx];
	}

	private assertLabels(labels?: Record<string, string>): void {
		if (!labels && this.labelNames.length === 0) return;
		if (this.labelNames.length === 0) {
			throw new Error(`Summary ${this.name} has no labels declared`);
		}
		if (!labels) {
			throw new Error(`Summary ${this.name} requires labels: ${this.labelNames.join(", ")}`);
		}
		for (const required of this.labelNames) {
			if (!(required in labels)) {
				throw new Error(`Summary ${this.name} missing label "${required}"`);
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

function clampQuantileLabel(q: number): string {
	// Use Number's default string representation, which handles JS
	// float precision better than toFixed(17). E.g. 0.9 -> "0.9",
	// 0.99 -> "0.99", 0.5 -> "0.5".
	const s = String(q);
	// If JS gives us a long decimal like "0.90000000000000002",
	// round it to a reasonable precision.
	if (s.includes(".") && s.length > 8) {
		return q.toFixed(6).replace(/0+$/, "").replace(/\.$/, "");
	}
	return s;
}
