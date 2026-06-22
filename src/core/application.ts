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
import { ApplicationContainer } from "./di/container.js";
import { ModuleScanner } from "./di/scanner.js";
import { NexusServer, type NexusServerOptions } from "./http/server.js";
import type { ViewAdapter } from "../view/types.js";
import { RenduAdapter } from "../view/rendu.js";
import { setViewPaths as setViewPathsModule } from "../view/view-engine.js";
import type { Type } from "./di/tokens.js";
import { Inertia, type InertiaConfig } from "../view/inertia/index.js";

export interface ApplicationOptions extends NexusServerOptions {
	/** Default view adapter. Defaults to Rendu. */
	viewAdapter?: ViewAdapter;
	/** Inertia configuration. If supplied, `app.inertia` is initialized. */
	inertia?: InertiaConfig;
}

export class Application {
	readonly container: ApplicationContainer;
	readonly server: NexusServer;
	/** Inertia adapter (or `null` if not configured). Always defined after ctor. */
	readonly inertia: Inertia | null;
	private viewAdapter: ViewAdapter;

	constructor(rootModule: Type<any>, options: ApplicationOptions = {}) {
		// Build the DI container and scan the module tree.
		this.container = new ApplicationContainer();
		const scanner = new ModuleScanner(this.container);
		const { root, modules } = scanner.scan(rootModule);

		// Create the HTTP server around the same container.
		this.server = new NexusServer(this.container, options);

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
	 * Typical setup:
	 *
	 *   import { setViewPaths } from 'nexusjs/view';
	 *   setViewPaths('views');
	 *
	 * or in `nx.config.ts`:
	 *
	 *   export default {
	 *     view: 'rendu',
	 *     viewPaths: 'views',
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
	 * Convenience: start the server using the auto-detected runtime adapter.
	 */
	async listen(port?: number): Promise<any> {
		if (port) {
			this.server.setPort(port);
		}
		return this.server.start();
	}

	/**
	 * For Cloudflare / Workers: return the fetch handler.
	 */
	get fetch() {
		return this.server.fetch;
	}

	/**
	 * Static factory that mirrors the typical `bootstrap()` pattern.
	 */
	static bootstrap(
		rootModule: Type<any>,
		options?: ApplicationOptions,
	): Application {
		return new Application(rootModule, options);
	}
}
