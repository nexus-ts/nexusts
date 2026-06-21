/**
 * `ShieldService` — orchestrator. Aggregates the per-feature guards
 * into a single Hono middleware that can be mounted globally.
 */
import { Inject, Injectable } from "../core/decorators/index.js";
import type { CsrfConfig, ShieldConfig } from "./types.js";
import { CsrfGuard, HeadersGuard } from "./guards/index.js";

@Injectable()
export class ShieldService {
	/** DI token. */
	static readonly TOKEN = Symbol.for("nexus:ShieldService");

	csrf?: CsrfGuard;
	headers: HeadersGuard;

	constructor(@Inject("SHIELD_CONFIG") config: ShieldConfig = {}) {
		if (config.csrf) {
			const secret =
				config.secret ??
				process.env["NEXUS_SHIELD_SECRET"] ??
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
			// 1. CSRF check — must run before `next()` so we can short-circuit.
			if (this.csrf) {
				const method = (c.req.method as string).toUpperCase();
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

	/** Generate a CSRF token and set the cookie. Useful for forms. */
	issueToken(headers: Headers) {
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
