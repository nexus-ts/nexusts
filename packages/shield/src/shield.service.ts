/**
 * `ShieldService` — orchestrator. Aggregates the per-feature guards
 * into a single Hono middleware that can be mounted globally.
 */
import { Inject, Injectable } from "@nexusts/core";
import type { CorsConfig, CsrfConfig, ShieldConfig } from "./types.js";
import { CorsGuard, CsrfGuard, HeadersGuard } from "./guards/index.js";

@Injectable()
export class ShieldService {
	/** DI token. */
	static readonly TOKEN = Symbol.for("nexus:ShieldService");

	/** Shield config — injected by DI container. */
	@Inject("SHIELD_CONFIG") declare private _config: ShieldConfig;

	cors?: CorsGuard;
	csrf?: CsrfGuard;
	headers: HeadersGuard;
	private _initialized = false;

	private init(): void {
		if (this._initialized) return;
		this._initialized = true;
		const config = this._config ?? {};
		if (config.cors) {
			this.cors = new CorsGuard(config.cors as CorsConfig);
		}
		if (config.csrf) {
			const secret =
				config.secret ??
				process.env.NEXUS_SHIELD_SECRET ??
				"change-me-in-production-please";
			this.csrf = new CsrfGuard(config.csrf as CsrfConfig, secret);
		}
		this.headers = new HeadersGuard(
			config.hsts ?? false,
			config.csp ?? false,
			config.xFrameOptions ?? "SAMEORIGIN",
			config.xContentTypeOptions ?? true,
			config.referrerPolicy,
		);
	}

	/**
	 * Returns a Hono middleware that applies all configured guards.
	 *
	 * Order:
	 *   1. CSRF check on mutating requests (rejects with 403 + security headers)
	 *   2. Security headers applied to the final response
	 */
	middleware() {
		return async (c: any, next: () => Promise<any>) => {
			this.init();
			const requestOrigin = (c.req.header("origin") as string) ?? "";
			const method = (c.req.method as string).toUpperCase();

			// 0. CORS preflight — short-circuit before CSRF so OPTIONS doesn't 403.
			if (this.cors && method === "OPTIONS" && c.req.header("access-control-request-method")) {
				const headers = new Headers();
				const allowed = this.cors.applyPreflightHeaders(headers, requestOrigin);
				return new Response(null, { status: allowed ? 204 : 403, headers });
			}

			// 0b. Apply CORS headers to regular requests.
			if (this.cors) {
				this.cors.applyHeaders(c.res.headers as Headers, requestOrigin);
			}

			// 1. CSRF check — must run before `next()` so we can short-circuit.
			if (this.csrf) {
				const ignoreMethods = (this.csrf as any).config.ignoreMethods as string[];
				if (ignoreMethods.map((m) => m.toUpperCase()).includes(method)) {
					// Safe method: ensure a CSRF cookie is present.
					const cookieHeader = c.req.header("cookie") ?? "";
					const cookieName = (this.csrf as any).config.cookieName as string;
					if (!this.extractCookie(cookieHeader, cookieName)) {
						(this.csrf as any).issue(c.res.headers);
					}
				} else if (!(this.csrf as any).verify(c.req.raw)) {
					// 403 — apply security headers and return.
					const resp = c.text("Invalid CSRF token", 403);
					this.headers.apply(resp.headers as Headers);
					return resp;
				}
			}

			// 2. Apply security headers to c.res BEFORE the handler runs.
			//    Hono's c.text()/c.json() etc. create a new Response but
			//    inherit existing headers from c.res.headers.
			this.headers.apply(c.res.headers as Headers);

			// 3. Continue to next middleware/handler.
			return next();
		};
	}

	/** Generate a CSRF token and set the cookie. */
	issueToken(headers: Headers) {
		this.init();
		if (!this.csrf) throw new Error("CSRF guard is not enabled");
		return this.csrf.issue(headers);
	}

	private extractCookie(cookieHeader: string, name: string): string | null {
		for (const part of cookieHeader.split(";")) {
			const [k, ...rest] = part.trim().split("=");
			if (k === name) return rest.join("=");
		}
		return null;
	}
}
