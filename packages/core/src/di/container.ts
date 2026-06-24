/**
 * Dependency Injection Container.
 *
 * The container is the heart of the framework. It:
 * - Registers providers (classes, values, factories, aliases)
 * - Resolves dependencies recursively through reflect-metadata
 * - Manages instance lifecycles (singleton / request / transient)
 * - Detects circular dependencies and throws helpful errors
 *
 * Design notes:
 * - Modules each have their own container scope, but share the root
 *   container for global providers. Exports propagate tokens upward.
 * - The container is lazy: nothing is instantiated until first resolve.
 */
import "reflect-metadata";
import { METADATA_KEY } from "../constants.js";
import { RequestScopeStorage } from "./request-scope.js";
import type {
	FactoryProvider,
	InjectionToken,
	Provider,
	ProviderScope,
	Type,
	ValueProvider,
} from "./tokens.js";

interface ProviderRecord {
	token: InjectionToken<any>;
	provider: Provider<any>;
	scope: ProviderScope;
	/** Set of tokens this provider depends on (for cycle detection). */
	dependencies: Set<InjectionToken<any>>;
}

export class DIContainer {
	/** Token -> provider record. */
	private providers = new Map<InjectionToken<any>, ProviderRecord>();

	/** Token -> singleton instance (lazy). */
	private singletons = new Map<InjectionToken<any>, any>();

	/** Token -> "currently resolving" flag for cycle detection. */
	private resolving = new Set<InjectionToken<any>>();

	/** Parent container (for hierarchical lookup of exports). */
	private parent?: DIContainer;

	constructor(parent?: DIContainer) {
		this.parent = parent;
	}

	/** Create a child container (used by modules). */
	createChild(): DIContainer {
		return new DIContainer(this);
	}

	/** List all registered provider tokens (for diagnostics / REPL). */
	listProviders(): Array<{ token: InjectionToken<any> }> {
		const tokens: Array<{ token: InjectionToken<any> }> = [];
		const seen = new Set<InjectionToken<any>>();
		// Collect from this container.
		for (const token of this.providers.keys()) {
			if (!seen.has(token)) {
				seen.add(token);
				tokens.push({ token });
			}
		}
		// Collect from parent chain.
		let p = this.parent;
		while (p) {
			for (const token of (p as any).providers?.keys() ?? []) {
				if (!seen.has(token)) {
					seen.add(token);
					tokens.push({ token });
				}
			}
			p = (p as any).parent;
		}
		return tokens;
	}

	/** Register a provider or list of providers. */
	register(providers: Provider<any> | Provider<any>[]): void {
		const list = Array.isArray(providers) ? providers : [providers];
		for (const provider of list) {
			this.registerOne(provider);
		}
	}

	private registerOne(provider: Provider<any>): void {
		const record = this.normalizeProvider(provider);
		if (this.providers.has(record.token)) {
			throw new Error(
				`Duplicate provider for token "${this.tokenName(record.token)}". ` +
					`Each token may only be registered once per container.`,
			);
		}
		this.providers.set(record.token, record);
	}

	/**
	 * Normalize a provider union into a uniform ProviderRecord.
	 * - Type<...> → useClass equivalent
	 * - { useClass | useValue | useFactory | useExisting } → as-is
	 */
	private normalizeProvider(provider: Provider<any>): ProviderRecord {
		if (this.isClass(provider)) {
			const dependencies = this.readClassDependencies(provider);
			// Read scope from @Injectable({ scope }) metadata if present.
			const classScope = Reflect.getMetadata("nexus:di:scope", provider) as
				| ProviderScope
				| undefined;
			return {
				token: provider,
				provider,
				scope: classScope ?? "singleton",
				dependencies,
			};
		}

		const deps = this.readProviderDependencies(provider);
		const scope: ProviderScope =
			("scope" in provider && provider.scope) || "singleton";

		return {
			token: provider.provide,
			provider,
			scope,
			dependencies: deps,
		};
	}

	/** Read constructor parameter types from a class using reflect-metadata. */
	private readClassDependencies(cls: Type<any>): Set<InjectionToken<any>> {
		const paramTypes: any[] =
			Reflect.getMetadata(METADATA_KEY.PARAMTYPES, cls) || [];
		const set = new Set<InjectionToken<any>>();
		for (const t of paramTypes) {
			if (t && t !== Object) set.add(t);
		}
		return set;
	}

	/** Read dependencies from a structured provider's `inject` array (factory). */
	private readProviderDependencies(
		provider: Provider<any>,
	): Set<InjectionToken<any>> {
		const set = new Set<InjectionToken<any>>();
		if (
			"inject" in provider &&
			Array.isArray((provider as FactoryProvider).inject)
		) {
			for (const dep of (provider as FactoryProvider).inject!) {
				if (dep && typeof dep === "object" && "token" in dep) {
					set.add((dep as any).token);
				} else if (dep) {
					set.add(dep as InjectionToken<any>);
				}
			}
		} else if ("useClass" in provider) {
			const cls = (provider as any).useClass;
			return this.readClassDependencies(cls);
		}
		return set;
	}

	/**
	 * Resolve a token to an instance. Walks up the parent chain on miss.
	 * Returns undefined when nothing is registered and the token is optional.
	 */
	resolve<T = any>(token: InjectionToken<T>): T {
		if (this.resolving.has(token)) {
			throw new Error(
				`Circular dependency detected while resolving "${this.tokenName(token)}". ` +
					`Resolution stack: ${[...this.resolving].map((t) => this.tokenName(t)).join(" -> ")}`,
			);
		}

		// Singletons are memoized at the container level where they were registered.
		const cached = this.singletons.get(token);
		if (cached !== undefined) return cached;

		// Request-scoped providers are memoized per active request. The
		// request scope is held in AsyncLocalStorage so any deep call
		// (services, repositories, ...) sees the same instance.
		const record0 = this.providers.get(token);
		if (record0 && record0.scope === "request") {
			const scope = RequestScopeStorage.get();
			if (scope) {
				const r2 = scope.container.singletons.get(token);
				if (r2 !== undefined) return r2;
				const inst = this.instantiate(record0);
				scope.container.singletons.set(token, inst);
				return inst;
			}
		}

		const record = this.providers.get(token);
		if (!record) {
			if (this.parent) {
				try {
					return this.parent.resolve<T>(token);
				} catch {
					// Fall through to throw a richer error below.
				}
			}
			const name = this.tokenName(token);
			const hint =
				name === "undefined" || name === ""
					? " Possible cause: @Inject on a constructor parameter property " +
					  "(e.g. `constructor(@Inject(Svc) private svc: Svc)`) can cause " +
					  "Bun to lose the token — use explicit assignment instead: " +
					  "`svc: Svc; constructor(@Inject(Svc) svc: Svc) { this.svc = svc; }`."
					: "";
			throw new Error(
				`No provider for "${name}". ` +
					`Register it via DIContainer.register() or @Module({ providers: [...] }).` +
					hint,
			);
		}

		// Singletons resolve from the registering container so identity is stable.
		const owningContainer = this.providers.get(token) === record ? this : this;

		this.resolving.add(token);
		try {
			const instance = owningContainer.instantiate(record);
			if (record.scope === "singleton") {
				owningContainer.singletons.set(token, instance);
			}
			return instance;
		} finally {
			this.resolving.delete(token);
		}
	}

	/** Try to resolve; return undefined instead of throwing when missing. */
	tryResolve<T = any>(token: InjectionToken<T>): T | undefined {
		try {
			return this.resolve<T>(token);
		} catch {
			return undefined;
		}
	}

	/**
	 * Instantiate a single provider record. Calls itself recursively
	 * for each constructor parameter.
	 */
	private instantiate(record: ProviderRecord): any {
		const provider = record.provider;

		if (this.isClass(provider)) {
			const paramTypes: any[] =
				Reflect.getMetadata(METADATA_KEY.PARAMTYPES, provider) || [];
			// Bun's TypeScript transformer does NOT emit `design:paramtypes`,
			// so we also accept explicit @Inject() tokens per parameter as a
			// portable fallback. If @Inject metadata exists for a given index,
			// it overrides the (missing) type metadata.
			const injectMap: Map<number, any> =
				Reflect.getMetadata(METADATA_KEY.INJECT, provider) ?? new Map();

			// Use the larger of paramTypes.length and the highest @Inject key,
			// because esbuild/Bun may emit empty paramTypes while @Inject metadata
			// still describes real dependencies.
			const maxInjectIndex =
				injectMap.size > 0 ? Math.max(...Array.from(injectMap.keys())) + 1 : 0;
			const totalParams = Math.max(paramTypes.length, maxInjectIndex);
			const params: any[] = new Array(totalParams);

			for (let index = 0; index < totalParams; index++) {
				if (injectMap.has(index)) {
					params[index] = this.resolve(injectMap.get(index));
					continue;
				}
				const type = paramTypes[index];
				if (!type || type === Object) {
					throw new Error(
						`Cannot inject parameter at index ${index} of "${provider.name || "<anonymous>"}" ` +
							`(type is "Object" or "undefined"). This usually means ` +
							`reflect-metadata was not emitted by your toolchain (Bun's ` +
							`native transpiler doesn't emit decorator metadata). Use the ` +
							`@Inject(Token) parameter decorator to specify the dependency ` +
							`explicitly, e.g. \`constructor(@Inject(UserService) private users: UserService)\`.`,
					);
				}
				params[index] = this.resolve(type);
			}

			return new provider(...params);
		}

		if ("useValue" in provider) {
			return (provider as ValueProvider<any>).useValue;
		}

		if ("useClass" in provider) {
			const ClassRef = (provider as any).useClass as Type<any>;
			// Same logic as the bare-class branch: prefer @Inject tokens, fall
			// back to design:paramtypes, throw on missing metadata.
			const paramTypes: any[] =
				Reflect.getMetadata(METADATA_KEY.PARAMTYPES, ClassRef) || [];
			const injectMap: Map<number, any> =
				Reflect.getMetadata(METADATA_KEY.INJECT, ClassRef) ?? new Map();
			const maxInjectIndex =
				injectMap.size > 0 ? Math.max(...Array.from(injectMap.keys())) + 1 : 0;
			const totalParams = Math.max(paramTypes.length, maxInjectIndex);
			const params: any[] = new Array(totalParams);
			for (let index = 0; index < totalParams; index++) {
				if (injectMap.has(index)) {
					params[index] = this.resolve(injectMap.get(index));
					continue;
				}
				const type = paramTypes[index];
				if (!type || type === Object) {
					throw new Error(
						`Cannot inject parameter at index ${index} of "${ClassRef.name}" ` +
							`(type is "Object" or "undefined"). Add explicit type annotations or ` +
							`use @Inject(Token).`,
					);
				}
				params[index] = this.resolve(type);
			}
			return new ClassRef(...params);
		}

		if ("useFactory" in provider) {
			const factoryProvider = provider as FactoryProvider<any>;
			const inject = factoryProvider.inject ?? [];
			const args = inject.map((dep) => {
				if (dep && typeof dep === "object" && "token" in dep) {
					const { token, optional } = dep as any;
					return optional ? this.tryResolve(token) : this.resolve(token);
				}
				return this.resolve(dep as InjectionToken<any>);
			});
			return factoryProvider.useFactory(...args);
		}

		if ("useExisting" in provider) {
			const existing = (provider as any).useExisting as InjectionToken<any>;
			return this.resolve(existing);
		}

		throw new Error(
			`Unknown provider shape for token "${this.tokenName(record.token)}"`,
		);
	}

	/** Check whether a token is registered locally (does not consult parent). */
	has(token: InjectionToken<any>): boolean {
		return this.providers.has(token);
	}

	/** Inspect the registered tokens (debug aid). */
	list(): string[] {
		return [...this.providers.keys()].map((t) => this.tokenName(t));
	}

	private isClass(value: any): value is Type<any> {
		return typeof value === "function";
	}

	private tokenName(token: InjectionToken<any>): string {
		if (typeof token === "function") return token.name || "<anonymous class>";
		if (typeof token === "symbol") return token.toString();
		return String(token);
	}
}

/**
 * Root application container. Modules created via @Module register their
 * providers into child containers of this root.
 */
export class ApplicationContainer extends DIContainer {
	private moduleContainers = new Map<Type<any>, DIContainer>();

	registerModule(moduleClass: Type<any>, container: DIContainer): void {
		this.moduleContainers.set(moduleClass, container);
	}

	getModuleContainer(moduleClass: Type<any>): DIContainer | undefined {
		return this.moduleContainers.get(moduleClass);
	}
}
