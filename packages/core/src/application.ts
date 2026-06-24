/**
 * Application.
 *
 * The Application is the user-facing entry point: it owns the DI container,
 * the HTTP server, and the view engine. Typical bootstrap:
 *
 * ```ts
 * const app = await new Application(AppModule).bootstrap();
 * await app.listen(3000);
 * ```
 *
 * The class is intentionally small — every feature (DI, HTTP, ORM, view)
 * is a separate concern with its own module. Application composes them.
 */
import "reflect-metadata";
import type { ViewAdapter } from "@nexusts/view";
import { Inertia, type InertiaConfig, RenduAdapter, setViewPaths as setViewPathsModule } from "@nexusts/view";
import { ApplicationContainer } from "./di/container.js";
import { ModuleScanner } from "./di/scanner.js";
import type { Type } from "./di/tokens.js";
import { NexusServer, type NexusServerOptions } from "./http/server.js";
import {
	callBeforeApplicationDestroy,
	callOnApplicationDestroy,
	callOnApplicationInit,
	callOnModuleDestroy,
	callOnModuleInit,
} from "./lifecycle/index.js";

// Globally-registered hook for scanning schedule decorators at boot.
// Set by ScheduleModule; called by Application for each resolved provider.
let _scheduleScanner: ((instance: unknown) => void) | null = null;

/**
 * Register a callback that is invoked for every resolved provider instance
 * during application bootstrap. Used by the schedule module to auto-register
 * @Cron / @Interval / @Timeout decorated methods.
 * @internal
 */
export function setScheduleScanner(fn: ((instance: unknown) => void) | null): void {
	_scheduleScanner = fn;
}

import type { DIContainer } from "./di/container.js";

export interface ApplicationOptions extends NexusServerOptions {
	/** Default view adapter. Defaults to Rendu. */
	viewAdapter?: ViewAdapter;
	/** Inertia configuration. If supplied, `app.inertia` is initialized. */
	inertia?: InertiaConfig;
	/**
	 * Global middleware handlers to register BEFORE controller routes.
	 * Use this instead of `app.server.app.use()` because Hono processes
	 * middleware in registration order — middleware added after routes
	 * (via the `server.app` reference) will not execute before handlers.
	 *
	 * @example
	 * ```ts
	 * const app = new Application(AppModule, {
	 *   middleware: [authMiddleware, logger],
	 * });
	 * ```
	 */
	middleware?: Array<(c: any, next: any) => any | Promise<any>>;
}

export class Application {
	readonly container: ApplicationContainer;
	readonly server: NexusServer;
	/** Inertia adapter (or `null` if not configured). Always defined after ctor. */
	readonly inertia: Inertia | null;
	private viewAdapter: ViewAdapter;
	/** All scanned modules (stored for lifecycle hook iteration). */
	private modules: { controllers: Type[]; providers: any[]; container: DIContainer }[] = [];
	/** The root module scan result. */
	private rootModuleResult: { controllers: Type[]; container: DIContainer } | null = null;
	/** Track whether the app has started (for graceful shutdown). */
	private started = false;

	constructor(rootModule: Type<any>, options: ApplicationOptions = {}) {
		// Build the DI container and scan the module tree.
		this.container = new ApplicationContainer();
		// Stash container globally so modules (e.g. schedule) can resolve
		// providers during auto-init without importing @nexusts/core directly.
		(globalThis as any)["__nexus_container"] = this.container;
		const scanner = new ModuleScanner(this.container);
		const { root, modules } = scanner.scan(rootModule);

		// Store scan results for lifecycle hook iteration.
		this.rootModuleResult = root;
		this.modules = modules;

		// Create the HTTP server around the same container.
		this.server = new NexusServer(this.container, options);

		// Register user-defined global middleware BEFORE controller routes
		// so they execute before route handlers (Hono processes middleware
		// in registration order — middleware added after routes won't run).
		if (options.middleware) {
			for (const mw of options.middleware) {
				this.server.app.use("*", mw);
			}
		}

		// Register all controllers from every scanned module.
		for (const m of modules) {
			for (const controller of m.controllers) {
				this.server.router.registerController(controller, m.container);
			}
		}
		// Root module providers/controllers were already added in the scan.
		for (const controller of root.controllers) {
			this.server.router.registerController(controller, root.container);
		}

		this.viewAdapter = options.viewAdapter ?? new RenduAdapter();

		// Initialize the Inertia adapter if configured. The instance is
		// also registered into the container under its symbol token so
		// controllers can inject it via `@Inject(Inertia.TOKEN)`.
		if (options.inertia) {
			this.inertia = new Inertia(options.inertia);
			this.container.register({
				provide: Inertia.TOKEN,
				useValue: this.inertia,
			});
		} else {
			this.inertia = null;
		}

		// Auto-load nx.config.ts at boot so viewPaths (and future config)
		// take effect without an explicit app.setViewPaths() call.
		this.tryLoadNxConfig();

		// Surface debug info in dev.
		if (process.env["NEXUS_DEBUG"] === "1") {
			console.log("[nexus] Modules:", modules.length);
			console.log(
				"[nexus] Controllers:",
				modules.flatMap((m) => m.controllers).map((c) => c.name),
			);
			console.log("[nexus] Providers (root):", this.container.list());
			console.log("[nexus] Inertia:", this.inertia ? "enabled" : "disabled");
		}
	}

	/** Try to load nx.config.ts and apply runtime-relevant settings. */
	private tryLoadNxConfig(): void {
		// Bun provides require() even in ESM. On other runtimes (Node,
		// Cloudflare Workers) nx.config.ts may not be loadable — that's
		// fine, the user can set viewPaths explicitly via
		// app.setViewPaths().
		if (typeof require === "undefined") return;
		try {
			const mod = require(process.cwd() + "/nx.config.ts");
			const cfg = mod.default ?? mod;
			if (cfg && typeof cfg.viewPaths === "string" && cfg.viewPaths.length > 0) {
				setViewPathsModule(cfg.viewPaths);
			}
		} catch {
			// nx.config.ts not found or unparseable — that's fine.
		}
	}

	/** Replace the default view adapter. */
	setViewAdapter(adapter: ViewAdapter): this {
		this.viewAdapter = adapter;
		return this;
	}

	/**
	 * Set the directories to search when a controller returns
	 * `{ view: 'about.html' }`. Defaults to `[]` (no file-based
	 * views; controllers must pass inline template source).
	 *
	 * The Application auto-loads nx.config.ts at construction time, so if
	 * you already set viewPaths there, no explicit call is needed.
	 * This method exists to override the config-file value at runtime.
	 *
	 * Typical setup in nx.config.ts (auto-detected):
	 *
	 *   export default {
	 *     view: 'rendu',
	 *     viewPaths: 'resources/views',
	 *   };
	 *
	 * After this, `@Get('/about') return { view: 'about.html', data }`
	 * loads `views/about.html` from disk instead of treating the
	 * string as inline template source.
	 *
	 * Edge-only runtimes (Cloudflare Workers) should leave this
	 * empty and pass inline template strings.
	 */
	setViewPaths(path: string): this {
		setViewPathsModule(path);
		return this;
	}

	/** Render a view using the configured adapter. */
	async render(view: string, data: Record<string, any> = {}): Promise<string> {
		return this.viewAdapter.render(view, data);
	}

	/**
	 * Bootstrap the application: run lifecycle hooks.
	 *
	 * Flow:
	 *   1. Call onModuleInit() on all providers that implement it.
	 *   2. Call onApplicationInit() on all providers that implement it.
	 *
	 * Does NOT start the HTTP server — use listen() or server.start() for that.
	 */
	async bootstrap(): Promise<void> {
		if (this.started) return;

		// Phase 1: onModuleInit for all providers in the module tree.
		await this.callLifecycleOnAll(async (instance) => {
			await callOnModuleInit(instance);
		});

		// Phase 2: onApplicationInit for all providers.
		await this.callLifecycleOnAll(async (instance) => {
			await callOnApplicationInit(instance);
		});

		this.started = true;
		this.registerShutdownHandlers();
	}

	/**
	 * Bootstrap + start the HTTP server.
	 */
	async listen(port?: number): Promise<any> {
		if (port) {
			this.server.setPort(port);
		}
		await this.bootstrap();
		return this.server.start();
	}

	/**
	 * Graceful shutdown. Calls lifecycle hooks in reverse order.
	 */
	async shutdown(signal?: string): Promise<void> {
		if (!this.started) return;

		// Phase 1: beforeApplicationDestroy (pre-shutdown notifications).
		await this.callLifecycleOnAll(async (instance) => {
			await callBeforeApplicationDestroy(instance, signal);
		});

		// Phase 2: onModuleDestroy.
		await this.callLifecycleOnAll(async (instance) => {
			await callOnModuleDestroy(instance);
		});

		// Phase 3: onApplicationDestroy.
		await this.callLifecycleOnAll(async (instance) => {
			await callOnApplicationDestroy(instance, signal);
		});

		this.started = false;
	}

	/**
	 * Iterate all providers across all modules and call a lifecycle fn.
	 * We resolve each provider from its module's container to ensure
	 * the instance is created (lazy instantiation).
	 */
	private async callLifecycleOnAll(
		fn: (instance: unknown) => Promise<void>,
	): Promise<void> {
		const visited = new Set<unknown>();

		// Root module providers.
		if (this.rootModuleResult) {
			const container = this.rootModuleResult.container;
			for (const token of (container as any).providers?.keys() ?? []) {
				try {
					const instance = container.resolve(token);
					if (!visited.has(instance)) {
						visited.add(instance);
						// Call lifecycle hook
						await fn(instance);
						// Call schedule scanner if registered
						if (_scheduleScanner) _scheduleScanner(instance);
					}
				} catch {
					// Skip providers that can't be resolved yet (lazy).
				}
			}
		}

		// All sub-module providers.
		for (const mod of this.modules) {
			const container = mod.container;
			for (const token of (container as any).providers?.keys() ?? []) {
				try {
					const instance = container.resolve(token);
					if (!visited.has(instance)) {
						visited.add(instance);
						await fn(instance);
					}
				} catch {
					// Skip providers that can't be resolved yet.
				}
			}
		}
	}

	/**
	 * Register SIGTERM / SIGINT handlers for graceful shutdown.
	 */
	private registerShutdownHandlers(): void {
		const handleSignal = async (signal: string) => {
			console.log(`[nexus] Received ${signal}, shutting down gracefully...`);
			await this.shutdown(signal);
			process.exit(0);
		};

		process.on("SIGTERM", () => handleSignal("SIGTERM"));
		process.on("SIGINT", () => handleSignal("SIGINT"));
	}

	/**
	 * For Cloudflare / Workers: return the fetch handler.
	 * Call bootstrap() first to initialize lifecycle hooks.
	 */
	get fetch() {
		// Bootstrap must be called explicitly for Worker environments.
		return this.server.fetch;
	}

	/**
	 * Static factory that mirrors the typical `bootstrap()` pattern.
	 * Run `await app.bootstrap()` after construction to trigger
	 * lifecycle hooks.
	 */
	static bootstrap(
		rootModule: Type<any>,
		options?: ApplicationOptions,
	): Application {
		return new Application(rootModule, options);
	}
}
