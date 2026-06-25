/**
 * The Inertia adapter.
 *
 * One instance lives on `app.inertia`. Controllers call
 * `inertia.render('Users/Index', { users: ... })` to build a page
 * response; the router detects the marker tag and routes the response
 * through the appropriate XHR / HTML pipeline.
 *
 * The adapter also exposes:
 * - `share(...)` for global per-page props (current user, flash, CSRF)
 * - `setVersion(...)` for asset versioning
 * - `setSsrAdapter(...)` for plugging in React/Vue/Svelte SSR
 * - `location(...)` for full-page reloads (e.g. on logout)
 * - `back()` to navigate one step in history
 */
import type { Context } from "hono";
import type {
	InertiaConfig,
	InertiaAdapter,
	InertiaVersion,
	SsrAdapter,
} from "./types.js";
import {
	AlwaysProp,
	DeepMergeProp,
	DeferredProp,
	MergeProp,
	OptionalProp,
	OnceProp,
	annotateProps,
	type isInertiaHelper,
} from "./helpers.js";
import { InertiaResponse, INERTIA_RESPONSE_TAG } from "./inertia-response.js";
import { InertiaFormBuilder } from "./form-helper.js";
import { safeGetMeta, safeDefineMeta, safeHasMeta } from "@nexusts/core/di/safe-reflect";

const INERTIA_TOKEN = Symbol.for("nexus:Inertia");

export class Inertia implements InertiaAdapter {
	private config: InertiaConfig;
	/** Static, in-process shared data. Resolved via `share(...)`. */
	private shared: Record<string, any> = {};

	constructor(config: InertiaConfig = {}) {
		this.config = {
			encryptHistory: false,
			...config,
		};
	}

	// ============================================================================
	// Public API — the controller-facing surface
	// ============================================================================

	/**
	 * Render an Inertia page. Supports two call shapes:
	 *
	 *   render(component, props)              — simple form
	 *   render(component, deferred, props)    — advanced form with deferred map
	 *
	 * Props can be plain values or helper wrappers (`defer()`, `always()`, ...).
	 */
	render(component: string, props: Record<string, any>): InertiaResponse;
	render(
		component: string,
		deferred: Record<string, DeferredProp>,
		props: Record<string, any>,
	): InertiaResponse;
	render(
		component: string,
		propsOrDeferred: Record<string, any>,
		maybeProps?: Record<string, any>,
	): InertiaResponse {
		const { component: comp, props } = this.normalizeRenderArgs(
			component,
			propsOrDeferred,
			maybeProps,
		);
		return new InertiaResponse(this, comp, props);
	}

	/**
	 * Build a redirect-style response that forces the client to do a full
	 * page navigation (NOT a client-side visit). Useful for logout, asset
	 * revalidation, or any time you want to bypass Inertia's history.
	 */
	location(url: string): Response {
		return new Response(null, {
			status: 409,
			headers: {
				"X-Inertia-Location": url,
			},
		});
	}

	/** Render a redirect that the Inertia client can follow. */
	redirect(url: string, status: number = 302): Response {
		// Inertia treats 302/303 as client-side visits; use 409 for hard
		// redirects (bypassing Inertia history).
		return new Response(null, {
			status,
			headers: { Location: url },
		});
	}

	/** Special "back" navigation — the client steps back in its history. */
	back(): Response {
		return new Response(null, {
			status: 302,
			headers: { Location: "back" },
		});
	}

	/**
	 * Begin a `<Form>` server-side flow. Returns a builder that the
	 * controller chains onto (validate → on-error render, on-success
	 * redirect). See `form-helper.ts` for the full lifecycle.
	 *
	 * @example
	 * ```ts
	 * const form = inertia.form('Users/Create');
	 * const r = UserSchema.safeParse(input);
	 * if (!r.success) return form.withErrors(r.error.flatten().fieldErrors).render();
	 * return form.redirect('/users');
	 * ```
	 */
	form(
		component: string,
		initialProps: Record<string, any> = {},
	): InertiaFormBuilder {
		return new InertiaFormBuilder(this, component, initialProps);
	}

	// ============================================================================
	// Configuration
	// ============================================================================

	setVersion(version: InertiaVersion): this {
		this.config.version = version;
		return this;
	}

	setSsrAdapter(adapter: SsrAdapter | null): this {
		this.config.ssr = adapter ?? undefined;
		return this;
	}

	setTitle(title: string): this {
		this.config.title = title;
		return this;
	}

	setEncryptHistory(encrypt: boolean = true): this {
		this.config.encryptHistory = encrypt;
		return this;
	}

	setSharedProps(shared: InertiaConfig["sharedProps"]): this {
		this.config.sharedProps = shared;
		return this;
	}

	// ============================================================================
	// Shared data
	// ============================================================================

	/**
	 * Share data with every response. Two call shapes:
	 * - `share('key', value)` — single key/value
	 * - `share({ a: 1, b: 2 })` — batch update
	 */
	share(key: string | Record<string, any>, value?: any): void {
		if (typeof key === "string") {
			this.shared[key] = value;
		} else if (key && typeof key === "object") {
			Object.assign(this.shared, key);
		}
	}

	/** Remove a previously shared key. */
	unshare(key: string): void {
		delete this.shared[key];
	}

	/** Read the currently shared static data. */
	getShared(): Record<string, any> {
		return { ...this.shared };
	}

	// ============================================================================
	// InertiaAdapter interface — used by InertiaResponse
	// ============================================================================

	title(): string {
		return this.config.title ?? "Nexus";
	}

	encryptHistory(): boolean {
		return this.config.encryptHistory ?? false;
	}

	ssr(): SsrAdapter | null {
		return this.config.ssr ?? null;
	}

	scripts(): string[] {
		return this.config.scripts ?? [];
	}

	async resolveVersion(): Promise<string | undefined> {
		const v = this.config.version;
		if (typeof v === "function") return await v();
		return v;
	}

	async getSharedFor(_c: Context): Promise<Record<string, any>> {
		const static_ = this.getShared();
		const configured = this.config.sharedProps;
		if (typeof configured === "function") {
			const dyn = await configured();
			return { ...static_, ...dyn };
		}
		return { ...static_, ...(configured ?? {}) };
	}

	// ============================================================================
	// DI token — so users can inject the Inertia instance.
	// ============================================================================

	/** Symbol used as the DI token for the Inertia instance. */
	static readonly TOKEN = INERTIA_TOKEN;

	// ============================================================================
	// Internals
	// ============================================================================

	/**
	 * Normalize the two call shapes into `{ component, props }`. The
	 * `deferred` map (3-arg form) is folded into the props here so the
	 * InertiaResponse sees a single props map.
	 */
	private normalizeRenderArgs(
		component: string,
		propsOrDeferred: Record<string, any>,
		maybeProps?: Record<string, any>,
	): {
		component: string;
		props: Record<string, any>;
	} {
		if (maybeProps !== undefined) {
			// 3-arg form: render(component, deferred, props)
			const deferred: Record<string, DeferredProp> = {};
			for (const [k, v] of Object.entries(propsOrDeferred)) {
				if (v instanceof DeferredProp) deferred[k] = v;
				else
					throw new Error(
						`Inertia.render: 3-arg form expects the second argument to be a map of deferred props. ` +
							`Got non-deferred value at key "${k}".`,
					);
			}
			return { component, props: { ...deferred, ...maybeProps } };
		}

		// 2-arg form: render(component, props) — helpers are left in place
		// so the response builder can recognize and resolve them.
		return { component, props: propsOrDeferred ?? {} };
	}
}

// ============================================================================
// Re-exports for convenience (so users can do `import { Inertia, defer }`)
// ============================================================================

export {
	AlwaysProp,
	DeepMergeProp,
	type DeferredProp,
	MergeProp,
	OptionalProp,
	OnceProp,
	annotateProps,
	type isInertiaHelper,
};
export type {
	AlwaysProp as AlwaysPropType,
	DeepMergeProp as DeepMergePropType,
	DeferredProp as DeferredPropType,
	MergeProp as MergePropType,
	OptionalProp as OptionalPropType,
	OnceProp as OncePropType,
} from "./helpers.js";

export { InertiaResponse, INERTIA_RESPONSE_TAG };
