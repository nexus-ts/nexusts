/**
 * Public types for `nexus/metrics`.
 *
 * `nexus/metrics` is a Prometheus-compatible metrics collection
 * library. It implements the four standard metric types (counter,
 * gauge, histogram, summary), label support, and the Prometheus /
 * OpenMetrics text exposition formats.
 *
 * No external dependencies. ~5kb gzipped.
 */

/* ------------------------------------------------------------------ *
 * Metric value type
 * ------------------------------------------------------------------ */

/** A single sample recorded against a metric. */
export interface MetricSample {
	/** Optional label values. The keys must match the metric's `labelNames`. */
	labels?: Record<string, string>;
	/** Numeric value. */
	value: number;
	/** Optional timestamp (epoch ms). */
	timestamp?: number;
}

/* ------------------------------------------------------------------ *
 * Counter
 * ------------------------------------------------------------------ */

export interface CounterOptions {
	/** Human-readable metric name (e.g. "http_requests_total"). */
	name: string;
	/** Help text shown in /metrics. */
	help?: string;
	/** Label names (dimensions). Order is significant. */
	labelNames?: string[];
}

export interface Counter {
	/** Read-only metric name. */
	readonly name: string;
	/** Increment by 1. */
	inc(labels?: Record<string, string>): void;
	/** Increment by `n` (must be >= 0). */
	incBy(n: number, labels?: Record<string, string>): void;
	/** Reset to 0. */
	reset(): void;
	/** Return all samples. */
	getSamples(): MetricSample[];
}

/* ------------------------------------------------------------------ *
 * Gauge
 * ------------------------------------------------------------------ */

export interface GaugeOptions {
	name: string;
	help?: string;
	labelNames?: string[];
	/** Optional collect() callback for time-varying values. */
	collect?: () => void;
}

export interface Gauge {
	readonly name: string;
	/** Set the value. */
	set(value: number, labels?: Record<string, string>): void;
	/** Increment by `n` (can be negative). */
	inc(n?: number, labels?: Record<string, string>): void;
	/** Decrement by `n` (defaults to 1). */
	dec(n?: number, labels?: Record<string, string>): void;
	/** Set the value to current unix epoch seconds. */
	setToCurrentTime(labels?: Record<string, string>): void;
	reset(): void;
	getSamples(): MetricSample[];
}

/* ------------------------------------------------------------------ *
 * Histogram
 * ------------------------------------------------------------------ */

export interface HistogramOptions {
	name: string;
	help?: string;
	labelNames?: string[];
	/** Bucket upper bounds. Default: Prometheus default. */
	buckets?: number[];
}

export interface Histogram {
	readonly name: string;
	/** Observe a value. */
	observe(value: number, labels?: Record<string, string>): void;
	/** Time an async function and observe its duration in seconds. */
	time<T>(fn: (start: number) => Promise<T> | T, labels?: Record<string, string>): Promise<T>;
	reset(): void;
	getSamples(): MetricSample[];
}

/* ------------------------------------------------------------------ *
 * Summary
 * ------------------------------------------------------------------ */

export interface SummaryOptions {
	name: string;
	help?: string;
	labelNames?: string[];
	/** Percentiles to compute. Default: [0.5, 0.9, 0.99]. */
	percentiles?: number[];
	/** Max number of samples to keep per label combination. Default: 100. */
	maxAgeSeconds?: number;
	/** Number of buckets for sliding window. Default: 5. */
	ageBuckets?: number;
}

export interface Summary {
	readonly name: string;
	observe(value: number, labels?: Record<string, string>): void;
	time<T>(fn: () => Promise<T> | T, labels?: Record<string, string>): Promise<T>;
	reset(): void;
	getSamples(): MetricSample[];
}

/* ------------------------------------------------------------------ *
 * Module config
 * ------------------------------------------------------------------ */

export interface MetricsConfig {
	/** Default histogram buckets. Default: Prometheus default. */
	defaultBuckets?: number[];
	/** Default summary percentiles. Default: [0.5, 0.9, 0.99]. */
	defaultPercentiles?: number[];
	/** Mount path for the /metrics endpoint. Default: "/metrics". */
	path?: string;
	/** Whether to collect default Node.js process metrics. Default: true. */
	enableDefaultMetrics?: boolean;
	/** Whether to auto-mount the controller. Default: true. */
	mountController?: boolean;
	/** Custom labels added to every metric. */
	globalLabels?: Record<string, string>;
}

/* ------------------------------------------------------------------ *
 * Exposition format
 * ------------------------------------------------------------------ */

export type ExpositionFormat = "prometheus" | "openmetrics";

export interface ExpositionResult {
	/** Content type for the HTTP response. */
	contentType: string;
	/** Body. */
	body: string;
}
