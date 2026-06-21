/**
 * `Counter` — monotonically increasing value.
 *
 * Counters can only go up (use `Gauge` for values that can decrease).
 * They're ideal for: request counts, error counts, bytes sent, etc.
 *
 * The standard Prometheus naming convention is to suffix counters
 * with `_total`.
 *
 * Example:
 *   const c = new Counter({ name: "http_requests_total" });
 *   c.inc();
 *   c.incBy(5, { method: "GET" });
 */

import type { CounterOptions, Counter as ICounter, MetricSample } from "./types.js";

/** Internal helper used by all metric types. */
export function renderLabels(
	declared: string[],
	values: Record<string, string>,
): string {
	if (declared.length === 0) return "";
	return declared
		.map((n) => `${n}="${escapeLabelValue(values[n] ?? "")}"`)
		.join(",");
}

export class CounterImpl implements ICounter {
	readonly name: string;
	readonly help?: string;
	readonly labelNames: string[];
	/** Map from "label1=value1,label2=value2" -> value. */
	private values = new Map<string, number>();

	constructor(opts: CounterOptions) {
		this.name = opts.name;
		this.help = opts.help;
		this.labelNames = opts.labelNames ?? [];
	}

	inc(labels?: Record<string, string>): void {
		this.incBy(1, labels);
	}

	incBy(n: number, labels?: Record<string, string>): void {
		if (n < 0) {
			throw new Error(`Counter ${this.name} can only increase (got ${n})`);
		}
		this.assertLabels(labels);
		const key = this.key(labels);
		this.values.set(key, (this.values.get(key) ?? 0) + n);
	}

	reset(): void {
		this.values.clear();
	}

	getSamples(): MetricSample[] {
		const out: MetricSample[] = [];
		for (const [k, v] of this.values) {
			out.push({ labels: this.parseKey(k), value: v });
		}
		return out;
	}

	/** Render this counter in Prometheus exposition format. */
	renderPrometheus(): string {
		const lines: string[] = [];
		if (this.help) lines.push(`# HELP ${this.name} ${this.help}`);
		lines.push(`# TYPE ${this.name} counter`);
		for (const [k, v] of this.values) {
			const labels = this.parseKey(k);
			const lbl = renderLabels(this.labelNames, labels);
			lines.push(lbl ? `${this.name}{${lbl}} ${v}` : `${this.name} ${v}`);
		}
		return lines.join("\n");
	}

	private assertLabels(labels?: Record<string, string>): void {
		if (!labels && this.labelNames.length === 0) return;
		if (this.labelNames.length === 0) {
			throw new Error(`Counter ${this.name} has no labels declared`);
		}
		if (!labels) {
			throw new Error(`Counter ${this.name} requires labels: ${this.labelNames.join(", ")}`);
		}
		for (const required of this.labelNames) {
			if (!(required in labels)) {
				throw new Error(`Counter ${this.name} missing label "${required}"`);
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

export function escapeLabelValue(v: string): string {
	return v.replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/"/g, "\\\"");
}
