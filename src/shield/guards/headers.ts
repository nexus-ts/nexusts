/**
 * Security headers middleware. Sets HSTS, X-Frame-Options,
 * X-Content-Type-Options, Referrer-Policy, and CSP on every response.
 */
import type { CspConfig, HstsConfig } from "../types.js";

export class HeadersGuard {
	hsts: HstsConfig | false;
	csp: CspConfig | false;
	xFrameOptions: "DENY" | "SAMEORIGIN" | false;
	xContentTypeOptions: boolean;
	referrerPolicy: string | undefined;

	constructor(
		hsts: HstsConfig | false,
		csp: CspConfig | false,
		xFrameOptions: "DENY" | "SAMEORIGIN" | false,
		xContentTypeOptions: boolean,
		referrerPolicy: string | undefined,
	) {
		this.hsts = hsts;
		this.csp = csp;
		this.xFrameOptions = xFrameOptions;
		this.xContentTypeOptions = xContentTypeOptions;
		this.referrerPolicy = referrerPolicy;
	}

	/**
	 * Apply configured headers to the given `Headers` instance in place.
	 * Useful when you already have a Response and want to enrich it.
	 */
	apply(headers: Headers): void {
		if (this.hsts) {
			const h = this.buildHstsHeader(this.hsts);
			if (h) headers.set("Strict-Transport-Security", h);
		}
		if (this.csp) {
			const header = this.buildCspHeader(this.csp);
			const name = this.csp.reportOnly
				? "Content-Security-Policy-Report-Only"
				: "Content-Security-Policy";
			headers.set(name, header);
		}
		if (this.xFrameOptions) {
			headers.set("X-Frame-Options", this.xFrameOptions);
		}
		if (this.xContentTypeOptions) {
			headers.set("X-Content-Type-Options", "nosniff");
		}
		if (this.referrerPolicy) {
			headers.set("Referrer-Policy", this.referrerPolicy);
		}
	}

	middleware() {
		return async (_c: any, next: () => Promise<any>) => {
			// Apply headers to c.res BEFORE next() so the handler inherits them.
			this.apply(_c.res.headers as Headers);
			return next();
		};
	}

	private buildHstsHeader(cfg: HstsConfig): string {
		let v = `max-age=${cfg.maxAge}`;
		if (cfg.includeSubDomains) v += "; includeSubDomains";
		if (cfg.preload) v += "; preload";
		return v;
	}

	private buildCspHeader(cfg: CspConfig): string {
		const parts: string[] = [];
		for (const [name, values] of Object.entries(cfg.directives)) {
			if (!values || values.length === 0) continue;
			parts.push(`${camelToKebab(name)} ${values.join(" ")}`);
		}
		if (cfg.reportUri) parts.push(`report-uri ${cfg.reportUri}`);
		return parts.join("; ");
	}
}

/** Convert `defaultSrc` → `default-src`. Already-kebab names pass through. */
function camelToKebab(s: string): string {
	return s.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`);
}
