/**
 * Runtime adapter barrel.
 *
 * These adapters are dynamic-imported by the server because they target
 * different runtimes; importing all of them at startup would pull in
 * Node-specific modules (http, etc.) on Cloudflare Workers, which fail.
 */
export * from "./bun.js";
export * from "./cloudflare.js";
export * from "./node.js";
