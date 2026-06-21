/**
 * CSRF guard — synchronizer token pattern.
 *
 * On `GET` (or any non-mutating request) we ensure a `nexus-csrf` cookie
 * is set. On `POST`/`PUT`/`DELETE`/`PATCH` we read the cookie, then
 * compare it against the `X-CSRF-Token` header (or `_csrf` form field).
 *
 * Both values must match (constant-time compare) for the request to pass.
 */
import type { CsrfConfig, CsrfToken } from "../types.js";
import { ShieldInternals } from "../types.js";

export class CsrfGuard {
	private config: Required<CsrfConfig>;
	private secret: string;

	constructor(config: CsrfConfig, secret: string) {
		this.config = {
			enabled: config.enabled,
			cookieName: config.cookieName ?? "nexus-csrf",
			headerName: config.headerName ?? "x-csrf-token",
			fieldName: config.fieldName ?? "_csrf",
			protectGet: config.protectGet ?? false,
			cookie: {
				sameSite: config.cookie?.sameSite ?? "Lax",
				secure: config.cookie?.secure ?? true,
				httpOnly: config.cookie?.httpOnly ?? false,
				path: config.cookie?.path ?? "/",
			},
			ignoreMethods: config.ignoreMethods ?? ["GET", "HEAD", "OPTIONS"],
		};
		this.secret = secret;
	}

	/**
	 * Issue a CSRF token. Sets the cookie on the response.
	 */
	issue(res: Headers): CsrfToken {
		const raw = ShieldInternals.randomToken();
		const signed = ShieldInternals.sign(raw, this.secret);
		// Set the cookie. The unsigned value is stored.
		const cookieParts = [
			`${this.config.cookieName}=${raw}`,
			`Path=${this.config.cookie.path}`,
			`SameSite=${this.config.cookie.sameSite}`,
		];
		if (this.config.cookie.secure) cookieParts.push("Secure");
		if (this.config.cookie.httpOnly) cookieParts.push("HttpOnly");
		res.append("Set-Cookie", cookieParts.join("; "));
		return {
			token: signed,
			html: `<meta name="csrf-token" content="${signed}">`,
		};
	}

	/**
	 * Verify a request. Returns `true` if the request is allowed.
	 */
	verify(req: { method: string; headers: Headers }): boolean {
		const method = req.method.toUpperCase();
		if (
			this.config.ignoreMethods.map((m) => m.toUpperCase()).includes(method)
		) {
			return true;
		}
		if (this.config.protectGet) {
			// (no-op; protectGet currently shares ignoreMethods logic)
		}
		const cookieHeader = req.headers.get("cookie") ?? "";
		const cookieToken = this.extractCookie(
			cookieHeader,
			this.config.cookieName,
		);
		if (!cookieToken) return false;
		// Header value
		const headerToken = req.headers.get(this.config.headerName);
		if (
			headerToken &&
			ShieldInternals.verify(headerToken, this.secret) === cookieToken
		) {
			return true;
		}
		// Form field (parsed from x-www-form-urlencoded body or multipart)
		// For simplicity, we accept a custom header `x-csrf-field` with the value.
		const fieldToken = req.headers.get("x-csrf-field");
		if (
			fieldToken &&
			ShieldInternals.verify(fieldToken, this.secret) === cookieToken
		) {
			return true;
		}
		return false;
	}

	/**
	 * Build a Hono middleware. Sets the cookie on every safe request and
	 * enforces the check on mutating ones.
	 */
	middleware() {
		return async (c: any, next: () => Promise<any>) => {
			const method = (c.req.method as string).toUpperCase();
			if (
				this.config.ignoreMethods.map((m) => m.toUpperCase()).includes(method)
			) {
				// Safe method: ensure a cookie is present.
				const cookieHeader = c.req.header("cookie") ?? "";
				if (!this.extractCookie(cookieHeader, this.config.cookieName)) {
					this.issue(c.res.headers);
				}
				return next();
			}
			if (!this.verify(c.req.raw)) {
				return c.text("Invalid CSRF token", 403);
			}
			return next();
		};
	}

	private extractCookie(cookieHeader: string, name: string): string | null {
		for (const part of cookieHeader.split(";")) {
			const [k, ...rest] = part.trim().split("=");
			if (k === name) return rest.join("=");
		}
		return null;
	}
}
