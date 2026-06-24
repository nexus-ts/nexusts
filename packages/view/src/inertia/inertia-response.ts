/**
 * InertiaResponse.
 *
 * The controller returns one of these via `inertia.render(...)`. When
 * the router sees it (a marker property), it asks the response to
 * serialize itself for the current request. The serialization differs
 * for Inertia XHR requests (JSON) and first-page loads (HTML shell).
 */
import type { Context } from "hono";
import { renderDefaultRoot } from "./default-ssr.js";
import { isInertiaHelper } from "./helpers.js";
import type {
	InertiaAdapter,
	InertiaPage,
	InertiaRequestInfo,
} from "./types.js";

/** Discriminator: the router detects InertiaResponse by this tag. */
export const INERTIA_RESPONSE_TAG = "__nexus_inertia_response__";

export class InertiaResponse {
	/** Discriminator tag — the router checks this before serializing. */
	readonly [INERTIA_RESPONSE_TAG] = true;

	private readonly options: {
		encryptHistory?: boolean;
		clearHistory?: boolean;
	} = {};

	/**
	 * Per-response memoization cache for `lazy()` props. Keyed by
	 * `LazyProp.tag`. Populated as factories resolve and reused on
	 * subsequent lookups in the same request.
	 */
	private readonly lazyCache = new Map<string, any>();

	constructor(
		private readonly adapter: InertiaAdapter,
		private readonly component: string,
		private readonly props: Record<string, any>,
	) {}

	/** Override `encryptHistory` for this response. */
	withEncryptHistory(encrypt: boolean = true): this {
		this.options.encryptHistory = encrypt;
		return this;
	}

	/** Override `clearHistory` for this response. */
	withClearHistory(clear: boolean = true): this {
		this.options.clearHistory = clear;
		return this;
	}

	/**
	 * Serialize the response. The router calls this; you typically don't.
	 */
	async toResponse(c: Context): Promise<Response> {
		const url = c.req.url;
		const info = this.parseInertiaRequest(c);

		// 1. Asset-version mismatch → 409 + X-Inertia-Location.
		if (info.isInertia && info.clientVersion !== undefined) {
			const serverVersion = await this.adapter.resolveVersion();
			if (serverVersion !== undefined && info.clientVersion !== serverVersion) {
				return this.assetVersionMismatch(c.req.url);
			}
		}

		// 2. Build the page object.
		const page = await this.buildPage(url, info, c);

		// 3. Branch on request type.
		if (info.isInertia) {
			return this.jsonResponse(page);
		}
		return this.htmlResponse(c, page);
	}

	// ============================================================================
	// Internals
	// ============================================================================

	private async buildPage(
		url: string,
		info: InertiaRequestInfo,
		c: Context,
	): Promise<InertiaPage> {
		// 1. Merge shared data (config-level shared + app-level shared).
		const shared = await this.adapter.getSharedFor(c);
		const allProps = { ...shared, ...this.props };

		// 2. Annotate helper wrappers and resolve them.
		const resolved: Record<string, any> = {};
		const deferredProps: Record<string, string[]> = {};
		const mergeProps: string[] = [];
		const deepMergeProps: string[] = [];
		const matchPropsOn: string[][] = [];

		for (const [key, value] of Object.entries(allProps)) {
			if (isInertiaHelper(value)) {
				const helper = value;
				switch (helper.__inertiaKind) {
					case "deferred": {
						const d = helper as any;
						const group: string = d.group ?? "default";
						deferredProps[group] ??= [];
						deferredProps[group].push(key);
						// Placeholder: must be `null` per spec.
						resolved[key] = null;
						break;
					}
					case "always": {
						resolved[key] = await Promise.resolve(helper.resolve());
						break;
					}
					case "optional": {
						const v = await Promise.resolve(helper.resolve());
						const o = helper as any;
						const threshold: number = o.threshold ?? 0;
						if (Array.isArray(v) && v.length <= threshold) {
							// On partial reload, drop; on full load, keep.
							if (this.isPartialReload(info)) {
								continue;
							}
						}
						resolved[key] = v;
						break;
					}
					case "merge": {
						const v = await Promise.resolve(helper.resolve());
						mergeProps.push(key);
						const m = helper as any;
						if (m.matchPropsOn && m.matchPropsOn.length > 0) {
							deepMergeProps.push(key);
							matchPropsOn.push(m.matchPropsOn);
						}
						resolved[key] = v;
						break;
					}
					case "deepMerge": {
						resolved[key] = await Promise.resolve(helper.resolve());
						mergeProps.push(key);
						deepMergeProps.push(key);
						break;
					}
					case "once": {
						if (info.isInertia) {
							// Already loaded once — skip.
							continue;
						}
						resolved[key] = await Promise.resolve(helper.resolve());
						break;
					}
					case "lazy": {
						// Lazy props are memoised per response. If multiple
						// keys share the same LazyProp tag, the factory
						// runs only once and every key receives the result.
						const lz = helper as any;
						const tag = lz.tag;
						if (this.lazyCache.has(tag)) {
							resolved[key] = this.lazyCache.get(tag);
						} else {
							const v = await Promise.resolve(helper.resolve());
							this.lazyCache.set(tag, v);
							resolved[key] = v;
						}
						break;
					}
					default: {
						// Future helper kinds: just resolve and send.
						resolved[key] = await Promise.resolve(helper.resolve());
					}
				}
			} else {
				resolved[key] = value;
			}
		}

		// 3. Apply partial-reload filters (only/except).
		const sharedKeys = new Set(Object.keys(shared));
		this.applyPartialFilter(resolved, info, sharedKeys);

		// 4. Resolve final metadata.
		const version = await this.adapter.resolveVersion();
		return {
			component: this.component,
			props: resolved,
			url,
			version: version ?? "",
			encryptHistory:
				this.options.encryptHistory ?? this.adapter.encryptHistory(),
			clearHistory: this.options.clearHistory ?? false,
			deferredProps:
				Object.keys(deferredProps).length > 0 ? deferredProps : undefined,
			mergeProps: mergeProps.length > 0 ? mergeProps : undefined,
			deepMergeProps: deepMergeProps.length > 0 ? deepMergeProps : undefined,
			matchPropsOn: matchPropsOn.length > 0 ? matchPropsOn : undefined,
			scrollRegions: {},
		};
	}

	/**
	 * Partial-reload filtering. Props not in `only` (or in `except`) are
	 * dropped, except for:
	 * - `AlwaysProp`-wrapped props
	 * - Shared props (configured via `inertia.share(...)` or `sharedProps`)
	 * - Deferred props (placeholders are kept so the client knows what to fetch)
	 */
	private applyPartialFilter(
		resolved: Record<string, any>,
		info: InertiaRequestInfo,
		sharedKeys: Set<string>,
	): void {
		if (!this.isPartialReload(info)) return;

		if (info.partialOnly) {
			for (const key of Object.keys(resolved)) {
				const isAlways = sharedKeys.has(key); // shared + always treated equally
				if (!info.partialOnly.includes(key) && !isAlways) {
					delete resolved[key];
				}
			}
		}

		if (info.partialExcept) {
			for (const key of Object.keys(resolved)) {
				const isAlways = sharedKeys.has(key);
				if (info.partialExcept.includes(key) && !isAlways) {
					delete resolved[key];
				}
			}
		}
	}

	private isPartialReload(info: InertiaRequestInfo): boolean {
		return info.isInertia && (!!info.partialOnly || !!info.partialExcept);
	}

	private parseInertiaRequest(c: Context): InertiaRequestInfo {
		const isInertia = c.req.header("x-inertia") === "true";
		const partialOnlyHeader = c.req.header("x-inertia-partial-data");
		const partialExceptHeader = c.req.header("x-inertia-partial-except");
		const resetHeader = c.req.header("x-inertia-reset");

		return {
			isInertia,
			clientVersion: c.req.header("x-inertia-version") ?? undefined,
			partialComponent:
				c.req.header("x-inertia-partial-component") ?? undefined,
			partialOnly: this.csv(partialOnlyHeader),
			partialExcept: this.csv(partialExceptHeader),
			reset: this.csv(resetHeader),
			isHardReload: c.req.header("x-inertia-hard-reload") === "true",
		};
	}

	private csv(value: string | undefined): string[] | undefined {
		if (!value) return undefined;
		const parts = value
			.split(",")
			.map((s) => s.trim())
			.filter(Boolean);
		return parts.length > 0 ? parts : undefined;
	}

	private jsonResponse(page: InertiaPage): Response {
		return new Response(JSON.stringify(page), {
			status: 200,
			headers: {
				"Content-Type": "application/json",
				Vary: "X-Inertia",
				"X-Inertia": "true",
			},
		});
	}

	private htmlResponse(
		c: Context,
		page: InertiaPage,
	): Promise<Response> | Response {
		const ssr = this.adapter.ssr();
		return renderDefaultRoot(
			this.adapter,
			ssr ?? null,
			this.component,
			page,
			c,
		);
	}

	private assetVersionMismatch(url: string): Response {
		return new Response(null, {
			status: 409,
			headers: {
				"X-Inertia-Location": url,
			},
		});
	}
}
