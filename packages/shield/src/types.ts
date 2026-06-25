/**
 * `nexusjs/shield` — security middleware suite.
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

import { randomBytes } from "node:crypto";
import { EncryptionService } from "@nexusts/crypto";
import { safeGetMeta, safeDefineMeta, safeHasMeta } from "@nexusts/core/di/safe-reflect";

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

/** CORS configuration. */
export interface CorsConfig {
	/**
	 * Allowed origin(s). Default: `"*"` (all origins).
	 *   - `"*"` — reflect wildcard (credentials not supported)
	 *   - `string` — exact match
	 *   - `string[]` — whitelist
	 *   - `(origin) => boolean | string | null` — custom resolver
	 */
	origin?: string | string[] | ((origin: string) => boolean | string | null);
	/** Allowed HTTP methods. Default: GET POST PUT PATCH DELETE HEAD OPTIONS. */
	methods?: string[];
	/** Allowed request headers (`Access-Control-Allow-Headers`). */
	allowedHeaders?: string[];
	/** Headers exposed to the browser (`Access-Control-Expose-Headers`). */
	exposedHeaders?: string[];
	/** Set `Access-Control-Allow-Credentials: true`. Default: false. */
	credentials?: boolean;
	/** Preflight cache duration in seconds (`Access-Control-Max-Age`). */
	maxAge?: number;
}

/** Top-level Shield config. */
export interface ShieldConfig {
	cors?: CorsConfig | false;
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

/**
 * Sign `value` with `secret` using EncryptionService.
 *
 * Returns the signed value in `<value>.<signature>` format. The
 * HMAC is HKDF-derived from the secret + purpose tag ("csrf"), so
 * a CSRF token can't be replayed as another-purpose token.
 */
function sign(value: string, secret: string): string {
	const sig = new EncryptionService(secret).signRaw(value, "csrf");
	return `${value}.${sig}`;
}

/**
 * Verify a signed token. Returns the original value on success,
 * `null` on failure (tampered, wrong purpose, malformed).
 */
function verify(signed: string, secret: string): string | null {
	const lastDot = signed.lastIndexOf(".");
	if (lastDot < 1) return null;
	const value = signed.slice(0, lastDot);
	const sig = signed.slice(lastDot + 1);
	if (!new EncryptionService(secret).verifyRaw(value, sig, "csrf")) return null;
	return value;
}

export const ShieldInternals = {
	sign,
	verify,
	randomToken,
};
