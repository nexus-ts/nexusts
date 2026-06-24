/**
 * `Gauge` — point-in-time value that can go up or down.
 *
 * Ideal for: queue size, memory usage, active connections, in-flight
 * requests, etc.
 *
 * The value is stored per label combination. `inc()` and `dec()` are
 * convenience helpers; `set()` replaces the value outright.
 *
 * Example:
 *   const g = new Gauge({
 *     name: "active_connections",
 *     collect: () => { return; },
 *   });
 *   g.inc();
 *   g.dec(2);
 *   g.set(42);
 */

import { escapeLabelValue, renderLabels } from "./counter.js";
import type { GaugeOptions, Gauge as IGauge, MetricSample } from "./types.js";

export class GaugeImpl implements IGauge {
	readonly name: string;
	readonly help?: string;
	readonly labelNames: string[];
	private values = new Map<string, number>();

	constructor(opts: GaugeOptions) {
		this.name = opts.name;
		this.help = opts.help;
		this.labelNames = opts.labelNames ?? [];
	}

	set(value: number, labels?: Record<string, string>): void {
		this.assertLabels(labels);
		this.values.set(this.key(labels), value);
	}

	inc(n: number = 1, labels?: Record<string, string>): void {
		this.assertLabels(labels);
		const k = this.key(labels);
		this.values.set(k, (this.values.get(k) ?? 0) + n);
	}

	dec(n: number = 1, labels?: Record<string, string>): void {
		this.assertLabels(labels);
		const k = this.key(labels);
		this.values.set(k, (this.values.get(k) ?? 0) - n);
	}

	setToCurrentTime(labels?: Record<string, string>): void {
		this.set(Date.now() / 1000, labels);
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

	/** Render this gauge in Prometheus exposition format. */
	renderPrometheus(): string {
		const lines: string[] = [];
		if (this.help) lines.push(`# HELP ${this.name} ${this.help}`);
		lines.push(`# TYPE ${this.name} gauge`);
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
			throw new Error(`Gauge ${this.name} has no labels declared`);
		}
		if (!labels) {
			throw new Error(`Gauge ${this.name} requires labels: ${this.labelNames.join(", ")}`);
		}
		for (const required of this.labelNames) {
			if (!(required in labels)) {
				throw new Error(`Gauge ${this.name} missing label "${required}"`);
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
