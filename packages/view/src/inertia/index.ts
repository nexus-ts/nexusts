/**
 * Inertia adapter barrel.
 *
 * Public exports for the server-side Inertia.js v3/v3 adapter. The
 * adapter implements the Inertia protocol: JSON responses for XHR,
 * HTML shell with embedded page data for first-page loads, deferred /
 * merge / always / once / lazy prop helpers, asset versioning, shared
 * data, form helpers, and a pluggable SSR adapter interface.
 */

export * from "./default-ssr.js";
export * from "./form-helper.js";
export * from "./form-middleware.js";
export * from "./helpers.js";
export * from "./inertia-adapter.js";
export * from "./inertia-response.js";
export * from "./ssr/index.js";
export * from "./types.js";
