/**
 * Inertia.js v3/v3 server-side adapter types.
 *
 * The server speaks the Inertia protocol: it returns either a JSON
 * page object (for XHR requests) or a full HTML shell with the page
 * object embedded (for first-page loads). See:
 * https://inertiajs.com/the-protocol
 */
import type { Context } from "hono";

/** Asset version provider. Either a static string or a resolver. */
export type InertiaVersion = string | (() => string | Promise<string>);

/**
 * SSR adapter contract. Each frontend (React, Vue, Svelte, Solid) ships
 * its own implementation that knows how to render a component tree to
 * HTML.
 *
 * The framework only defines the interface; concrete adapters live in
 * separate packages (e.g. `nexus-inertia-react`).
 */
export interface SsrAdapter {
	/** Engine name (for diagnostics). */
	readonly name: string;

	/**
	 * Render the page tree for the given component + props. The returned
	 * HTML is injected into `<div id="app">` for client hydration.
	 */
	render(
		component: string,
		props: Record<string, any>,
	): Promise<SsrRenderResult>;

	/** Optional: provide extra `<head>` tags (CSS, fonts, etc). */
	head?(): Promise<string[]> | string[];
}

/** Result of an SSR render. */
export interface SsrRenderResult {
	/** Rendered HTML for the page body. */
	html: string;
	/** Additional `<head>` tags the engine wants to inject. */
	head?: string[];
	/** Extra data to merge into the `data-page` JSON. */
	data?: Record<string, any>;
}

/** Top-level config for the Inertia adapter. */
export interface InertiaConfig {
	/**
	 * Default SSR adapter. When omitted, the adapter falls back to a
	 * minimal HTML shell (client-side rendering only).
	 */
	ssr?: SsrAdapter;

	/**
	 * Asset version. Mismatch with the client's `X-Inertia-Version`
	 * header triggers a 409 response that forces the client to do a full
	 * page reload (re-fetching CSS / JS bundles).
	 */
	version?: InertiaVersion;

	/** Encrypt URL history on the client. v3 feature. */
	encryptHistory?: boolean;

	/**
	 * Default `<title>` for the HTML shell. Override per-response with
	 * `inertia.title(...)`.
	 */
	title?: string;

	/**
	 * Global data merged into every response's props. Either a static
	 * object or a function (async supported) for per-request shared data
	 * like the current user.
	 */
	sharedProps?: InertiaSharedProps;

	/**
	 * Client-side JavaScript bundles to load via `<script>` tags.
	 * These are included in the HTML shell for first-page loads.
	 * Example: `['/static/app.js']`
	 */
	scripts?: string[];
}

export type InertiaSharedProps =
	| Record<string, any>
	| (() => Record<string, any> | Promise<Record<string, any>>);

/** The page object that ships to the client. */
export interface InertiaPage {
	/** Component name (matches a Vue/React/Svelte page component). */
	component: string;
	/** Resolved props for this response. */
	props: Record<string, any>;
	/** Request URL (preserves query strings). */
	url: string;
	/** Asset version (echoed back to client). */
	version: string;
	/** Encrypt URL history (v3). */
	encryptHistory: boolean;
	/** Clear history on navigation (v3). */
	clearHistory: boolean;
	/** Groups of deferred prop names: { groupName: [prop, ...] }. */
	deferredProps?: Record<string, string[]>;
	/** Top-level prop names the client should merge with previous values. */
	mergeProps?: string[];
	/** Subset of mergeProps that should be deep-merged. */
	deepMergeProps?: string[];
	/** Per-mergeProp array of paths used to identify matching items. */
	matchPropsOn?: string[][];
	/** Scroll positions for the page (regions). */
	scrollRegions?: Record<string, { top: number; left: number }>;
}

/** Options extracted from Inertia request headers. */
export interface InertiaRequestInfo {
	isInertia: boolean;
	clientVersion?: string;
	partialComponent?: string;
	partialOnly?: string[];
	partialExcept?: string[];
	reset?: string[];
	/** Whether the client wants a fresh, full reload. */
	isHardReload: boolean;
}

/** Internal context shared with the InertiaResponse. */
export interface InertiaRequestCtx {
	hono: Context;
	info: InertiaRequestInfo;
	url: string;
}

/**
 * Adapter contract — the framework implements this so the response
 * builder can ask for shared data, version, SSR, and config. Users
 * typically don't implement this; they get an instance via
 * `app.inertia` (or DI with the `'Inertia'` token).
 */
export interface InertiaAdapter {
	/** Default `<title>` for HTML responses. */
	title(): string;
	/** Asset version (async or sync). */
	resolveVersion(): Promise<string | undefined> | string | undefined;
	/** Whether to encrypt URL history by default. */
	encryptHistory(): boolean;
	/** Shared props for the current request. */
	getSharedFor(c: Context): Promise<Record<string, any>>;
	/** Configured SSR adapter, if any. */
	ssr(): SsrAdapter | null;

	/** Client-side script URLs to include in the HTML shell. */
	scripts(): string[];
}
