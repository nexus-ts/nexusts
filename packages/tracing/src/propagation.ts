/**
 * W3C Trace Context propagation.
 *
 * The OTel API ships a default W3C propagator, so most use cases
 * don't need anything here. This file provides:
 * 1. Constants for header names.
 * 2. Helpers to format / parse a `traceparent` value.
 * 3. A simple B3 single-header propagator for legacy systems.
 *
 * Format reference: https://www.w3.org/TR/trace-context/#traceparent-header
 */

import { type Context, context, propagation } from "@opentelemetry/api";

/* ------------------------------------------------------------------ *
 * Header constants
 * ------------------------------------------------------------------ */

export const TRACE_PARENT_HEADER = "traceparent";
export const TRACE_STATE_HEADER = "tracestate";
export const B3_TRACE_ID_HEADER = "x-b3-traceid";
export const B3_SPAN_ID_HEADER = "x-b3-spanid";
export const B3_SAMPLED_HEADER = "x-b3-sampled";

/* ------------------------------------------------------------------ *
 * traceparent parser
 * ------------------------------------------------------------------ */

export interface ParsedTraceParent {
	/** "00" (version 0) for now. */
	version: string;
	/** Full trace id (32 hex chars). */
	traceId: string;
	/** Parent span id (16 hex chars). */
	parentSpanId: string;
	/** Trace flags byte, hex. */
	flags: string;
	/** True if the trace is sampled (flags bit 0 set). */
	sampled: boolean;
}

/**
 * Parse a `traceparent` header value.
 * Returns `undefined` if the value is malformed.
 */
export function parseTraceParent(value: string | undefined | null): ParsedTraceParent | undefined {
	if (!value) return undefined;
	const parts = value.trim().split("-");
	if (parts.length !== 4) return undefined;
	const [version, traceId, parentSpanId, flags] = parts;
	if (!/^[0-9a-f]{2}$/i.test(version)) return undefined;
	if (!/^[0-9a-f]{32}$/i.test(traceId)) return undefined;
	if (traceId === "0".repeat(32)) return undefined;
	if (!/^[0-9a-f]{16}$/i.test(parentSpanId)) return undefined;
	if (parentSpanId === "0".repeat(16)) return undefined;
	if (!/^[0-9a-f]{2}$/i.test(flags)) return undefined;
	return {
		version,
		traceId: traceId.toLowerCase(),
		parentSpanId: parentSpanId.toLowerCase(),
		flags: flags.toLowerCase(),
		sampled: (parseInt(flags, 16) & 0x01) === 0x01,
	};
}

/**
 * Format a `traceparent` value from a known context.
 *   `00-<traceId>-<spanId>-<flags>`
 */
export function formatTraceParent(traceId: string, spanId: string, sampled = true): string {
	const flags = sampled ? "01" : "00";
	return `00-${traceId.toLowerCase()}-${spanId.toLowerCase()}-${flags}`;
}

/* ------------------------------------------------------------------ *
 * B3 single-header helpers (legacy Zipkin)
 * ------------------------------------------------------------------ */

/**
 * Extract context from a B3 single-header (`b3: <traceId>-<spanId>-1`).
 * Falls through to W3C if no B3 header is present.
 */
export function extractB3Context(
	headers: Record<string, string>,
): { traceId: string; spanId: string; sampled: boolean } | undefined {
	const b3 = headers["b3"] ?? headers["x-b3-traceid"];
	if (!b3) return undefined;
	if (b3.includes("-")) {
		// b3 single header: "traceId-spanId-sampled-parentSpanId"
		const [traceId, spanId, sampled] = b3.split("-");
		if (traceId && spanId) {
			return { traceId, spanId, sampled: sampled === "1" };
		}
	} else {
		// x-b3-traceid + x-b3-spanid pair
		const spanId = headers["x-b3-spanid"];
		const sampled = headers["x-b3-sampled"] === "1";
		if (spanId) return { traceId: b3, spanId, sampled };
	}
	return undefined;
}

/* ------------------------------------------------------------------ *
 * Re-export OTel's propagation API
 * ------------------------------------------------------------------ */

/** Inject the active context into the given carrier. */
export function inject(headers: Record<string, string>): Record<string, string> {
	const out: Record<string, string> = { ...headers };
	propagation.inject(context.active(), out);
	return out;
}

/** Extract a context from a header carrier. */
export function extract(headers: Record<string, string>): Context {
	return propagation.extract(context.active(), headers);
}
