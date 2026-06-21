/**
 * `nexus/shield` — security middleware suite.
 *
 * Inspired by AdonisJS Shield. Provides:
 *   - CSRF protection (synchronizer token pattern)
 *   - Security headers (X-Frame-Options, X-Content-Type-Options, Referrer-Policy)
 *   - HSTS (Strict-Transport-Security)
 *   - CSP (Content-Security-Policy) — optional
 *   - XSS filter (browser-level, for legacy browsers)
 *
 *   @Module({
 *     imports: [
 *       ShieldModule.forRoot({
 *         csrf: { enabled: true },
 *         hsts: { maxAge: 31_536_000, includeSubDomains: true },
 *         csp: { directives: { defaultSrc: ["'self'"] } },
 *       }),
 *     ],
 *   })
 *   export class AppModule {}
 */

import "reflect-metadata";
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/** CSRF protection configuration. */
export interface CsrfConfig {
	enabled: boolean;
	/** Cookie name. Default: 'nexus-csrf'. */
	cookieName?: string;
	/** Header name expected from clients. Default: 'x-csrf-token'. */
	headerName?: string;
	/** Form field name. Default: '_csrf'. */
	fieldName?: string;
	/** Whether to require the token on GET. Default: false. */
	protectGet?: boolean;
	/** Cookie attributes. */
	cookie?: {
		sameSite?: "Strict" | "Lax" | "None";
		secure?: boolean;
		httpOnly?: boolean;
		path?: string;
	};
	/** Methods that bypass CSRF check. Default: ['GET', 'HEAD', 'OPTIONS']. */
	ignoreMethods?: string[];
}

/** HSTS configuration. */
export interface HstsConfig {
	maxAge: number;
	includeSubDomains?: boolean;
	preload?: boolean;
}

/** CSP configuration. */
export interface CspConfig {
	directives: Record<string, string[]>;
	reportOnly?: boolean;
	reportUri?: string;
}

/** Top-level Shield config. */
export interface ShieldConfig {
	csrf?: CsrfConfig | false;
	hsts?: HstsConfig | false;
	csp?: CspConfig | false;
	xFrameOptions?: "DENY" | "SAMEORIGIN" | false;
	xContentTypeOptions?: boolean;
	referrerPolicy?: string;
	/** Secret used to sign CSRF tokens. */
	secret?: string;
}

/** CSRF token (synchronizer pattern). */
export interface CsrfToken {
	/** The token to embed in forms/headers. */
	token: string;
	/** A pre-formed <meta> tag. */
	html: string;
}

/** Generate a random base64url string. */
function randomToken(bytes = 24): string {
	return randomBytes(bytes).toString("base64url");
}

/** Sign `value` with `secret` using HMAC-SHA256. Returns `value.signature`. */
function sign(value: string, secret: string): string {
	const sig = createHmac("sha256", secret).update(value).digest("base64url");
	return `${value}.${sig}`;
}

/** Verify a signed token. */
function verify(signed: string, secret: string): string | null {
	const lastDot = signed.lastIndexOf(".");
	if (lastDot < 1) return null;
	const value = signed.slice(0, lastDot);
	const sig = signed.slice(lastDot + 1);
	const expected = createHmac("sha256", secret).update(value).digest("base64url");
	try {
		const a = Buffer.from(sig);
		const b = Buffer.from(expected);
		if (a.length !== b.length) return null;
		if (!timingSafeEqual(a, b)) return null;
		return value;
	} catch {
		return null;
	}
}

export const ShieldInternals = {
	sign,
	verify,
	randomToken,
};
