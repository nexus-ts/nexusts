/**
 * Module scanner.
 *
 * Reads the @Module({...}) metadata and recursively registers all
 * providers/controllers from imports, registering exports into the
 * parent container so cross-module injection works.
 *
 * Supports @Global() modules: a module decorated with @Global() exports
 * its providers to ALL modules automatically without explicit import.
 */
import { METADATA_KEY } from "../constants.js";
import { isGlobalModule } from "../decorators/global.js";
import type { ApplicationContainer, DIContainer } from "./container.js";
import type { InjectionToken, ModuleOptions, Provider, Type } from "./tokens.js";

interface ScanResult {
	/** The original module class constructor. */
	moduleClass?: Type<any>;
	/** Controllers registered by this module. */
	controllers: Type[];
	/** Providers registered locally (classes + non-class providers). */
	providers: Provider[];
	/** Tokens exported by this module. */
	exports: any[];
	/** Container holding the module's locally-scoped providers. */
	container: DIContainer;
}

export class ModuleScanner {
	private scanned = new Map<Type<any>, ScanResult>();
	/** Track global modules encountered during scan so their exports
	 *  are automatically injected into every subsequent module. */
	private globalExports = new Map<InjectionToken<any>, { container: DIContainer }>();

	constructor(private root: ApplicationContainer) {}

	/**
	 * Scan a module tree starting from `rootModule`, registering all
	 * providers and controllers into the appropriate containers.
	 */
	scan(rootModule: Type<any>): { root: ScanResult; modules: ScanResult[] } {
		const rootResult = this.scanModule(rootModule, this.root);
		const all = [...this.scanned.values()];
		return { root: rootResult, modules: all };
	}

	/**
	 * Scan one module. Recurses into its `imports`, then registers its
	 * providers and controllers. Exports are exposed to the parent
	 * container.
	 *
	 * If the module is marked @Global(), its exports are also registered
	 * in the globalExports registry, making them available to all modules
	 * scanned afterward.
	 */
	private scanModule(
		moduleClass: Type<any>,
		parentContainer: DIContainer,
	): ScanResult {
		if (this.scanned.has(moduleClass)) {
			return this.scanned.get(moduleClass)!;
		}

		const options = this.readModuleOptions(moduleClass);
		const container = parentContainer.createChild();
		this.root.registerModule(moduleClass, container);

		// Pre-fill the slot to break import cycles when modules reference each other.
		const placeholder: ScanResult = {
			moduleClass,
			controllers: [],
			providers: [],
			exports: [],
			container,
		};
		this.scanned.set(moduleClass, placeholder);

		// Global module exports are already registered in the parent container.
		// The DIContainer hierarchy resolves them automatically via parent chain.

		// Recurse into imports first so dependent tokens exist.
		for (const imported of options.imports ?? []) {
			const importedResult = this.scanModule(imported, parentContainer);
			// Expose imports' exports to the parent's container so the importing
			// module can resolve them.
			for (const exp of importedResult.exports) {
				if (!parentContainer.has(exp)) {
					parentContainer.register({
						provide: exp,
						useFactory: () => importedResult.container.resolve(exp),
					});
				}
			}
		}

		// Register global module exports so subsequent modules can resolve them.
		for (const [token, info] of this.globalExports) {
			if (!container.has(token) && !parentContainer.has(token)) {
				parentContainer.register({
					provide: token,
					useFactory: () => info.container.resolve(token),
				});
			}
		}

		// Register providers (and controllers as providers for DI).
		const providers = [
			...(options.providers ?? []),
			...(options.controllers ?? []),
		];
		container.register(providers);

		// Expose declared exports from this module's container to the parent.
		for (const exp of options.exports ?? []) {
			if (!parentContainer.has(exp)) {
				parentContainer.register({
					provide: exp,
					useFactory: () => container.resolve(exp),
				});
			}
		}

		// If this module is @Global(), register its exports globally
		// so subsequent modules (in any branch) can resolve them.
		if (isGlobalModule(moduleClass as Function)) {
			for (const exp of options.exports ?? []) {
				if (!this.globalExports.has(exp as any)) {
					this.globalExports.set(exp as any, { container });
				}
			}
		}

		const result: ScanResult = {
			moduleClass,
			controllers: options.controllers ?? [],
			providers: options.providers ?? [],
			exports: options.exports ?? [],
			container,
		};
		this.scanned.set(moduleClass, result);
		return result;
	}

	private readModuleOptions(moduleClass: Type<any>): ModuleOptions {
		const meta = Reflect.getMetadata(METADATA_KEY.MODULE, moduleClass) as
			| ModuleOptions
			| undefined;
		if (!meta) {
			throw new Error(
				`Class "${moduleClass.name}" is missing the @Module() decorator.`,
			);
		}
		return meta;
	}

	/** Get a previously-scanned module's result (debug aid). */
	get(moduleClass: Type<any>): ScanResult | undefined {
		return this.scanned.get(moduleClass);
	}

	/** Get all global module exports (debug aid). */
	getGlobalExports(): Map<any, { container: DIContainer }> {
		return new Map(this.globalExports);
	}
}

