/**
 * HTTP server.
 *
 * Builds a Hono app, attaches framework-level middleware (logging, CORS,
 * error handler), and returns a configured server instance. The Hono app
 * is exposed for users who want to register additional routes/middleware.
 *
 * Server.start() chooses the correct runtime adapter (Bun, Node, or
 * Cloudflare) automatically based on the global environment.
 */
import "reflect-metadata";
import { Hono } from "hono";
import type { ApplicationContainer } from "../di/container.js";
import { requestScopeMiddleware } from "../di/request-middleware.js";
import { errorHandler, logger } from "./middleware.js";
import { createRouter, type NexusRouter } from "./router.js";

export interface NexusServerOptions {
	/** Enable request logging (default: true). */
	logging?: boolean;
	/**
	 * Enable the framework error handler (default: true). CORS is NOT
	 * installed automatically; use `app.use(cors({ origin }))` for explicit
	 * cross-origin setup.
	 */
	errorHandler?: boolean;
	/** Port for the underlying HTTP server (Bun/Node). */
	port?: number;
}

export class NexusServer {
	readonly app: Hono;
	readonly container: ApplicationContainer;
	readonly router: NexusRouter;
	private options: Required<NexusServerOptions>;

	constructor(
		container: ApplicationContainer,
		options: NexusServerOptions = {},
	) {
		this.container = container;
		this.app = new Hono();
		this.router = createRouter(this.app, container);
		this.options = {
			logging: options.logging ?? true,
			errorHandler: options.errorHandler ?? true,
			port: options.port ?? 3000,
		};
		this.bootstrap();
	}

	/** Install the framework's built-in middleware. */
	private bootstrap(): void {
		// Request-scope middleware MUST come first so that everything
		// downstream (logging, error handler, controllers) can read
		// from the request scope.
		this.app.use("*", requestScopeMiddleware(this.container as any));
		if (this.options.errorHandler) this.app.use("*", errorHandler());
		if (this.options.logging) this.app.use("*", logger());
		// CORS is intentionally NOT enabled by default. Use
		// `app.use(cors({ origin: 'https://example.com' }))` explicitly.
	}

	/** Register additional global middleware. */
	use(...handlers: any[]): this {
		for (const h of handlers) this.app.use("*", h);
		return this;
	}

	/** Override the port (use before start()). */
	setPort(port: number): this {
		(this.options as any).port = port;
		return this;
	}

	/**
	 * Start the HTTP server using the best available runtime adapter.
	 * Returns the underlying server handle (Bun.Server, Node http.Server, or
	 * a fetch-compatible Hono instance for Cloudflare Workers).
	 */
	async start(): Promise<any> {
		const runtime = await detectRuntime();
		if (runtime === "bun") {
			const { bunAdapter } = await import("../runtime/bun.js");
			return bunAdapter(this.app, this.options.port);
		}
		if (runtime === "node") {
			const { nodeAdapter } = await import("../runtime/node.js");
			return nodeAdapter(this.app, this.options.port);
		}
		if (runtime === "cloudflare") {
			const { cloudflareAdapter } = await import("../runtime/cloudflare.js");
			return cloudflareAdapter(this.app);
		}
		throw new Error(
			"No supported runtime detected (Bun, Node, or Cloudflare Workers).",
		);
	}

	/**
	 * For serverless / Edge runtimes: return a fetch handler that can be
	 * exported from a Workers entry point.
	 */
	get fetch(): (req: Request, env?: any, ctx?: any) => Promise<Response> {
		return async (req, env, ctx) => this.app.fetch(req, env, ctx);
	}
}

/**
 * Auto-detect the current runtime. Order matters:
 * - Bun first (most specific)
 * - Node next
 * - Cloudflare Workers last (no Bun/Node globals)
 */
export async function detectRuntime(): Promise<"bun" | "node" | "cloudflare"> {
	if (typeof (globalThis as any).Bun !== "undefined") return "bun";
	if (typeof process !== "undefined" && process.versions?.node) return "node";
	return "cloudflare";
}
