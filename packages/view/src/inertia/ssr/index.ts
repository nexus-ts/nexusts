/**
 * SSR adapter barrel.
 *
 * Each adapter is loaded dynamically by the Inertia response when
 * SSR is needed. The framework core stays framework-agnostic; users
 * install only the frontend packages they actually use.
 */

export * from "./react-adapter.js";
export * from "./registry.js";
export * from "./solid-adapter.js";
export * from "./svelte-adapter.js";
export * from "./vue-adapter.js";
