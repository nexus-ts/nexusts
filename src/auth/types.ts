/**
 * Auth types — the contract between NexusJS and better-auth.
 *
 * Better-auth provides a comprehensive set of authentication primitives
 * (email/password, OAuth, magic links, passkeys, JWT). We don't try to
 * re-implement any of that — we adapt better-auth's surface to fit
 * NexusJS's DI / decorator model.
 *
 * Most types are re-exported from `better-auth` so consumers can use
 * them directly. The few we define here are NexusJS-specific helpers.
 */

import type { Auth } from "better-auth";

// ---------------------------------------------------------------------------
// Re-exports from better-auth
// ---------------------------------------------------------------------------

export type { Auth } from "better-auth";

/** Per-request session payload (user + session). */
export type AuthSession = {
	user: AuthUser;
	session: AuthSessionRecord;
} | null;

export type AuthUser = {
	id: string;
	email: string;
	emailVerified: boolean;
	name: string;
	image?: string | null;
	createdAt: Date;
	updatedAt: Date;
	[key: string]: unknown;
};

export type AuthSessionRecord = {
	id: string;
	userId: string;
	token: string;
	expiresAt: Date;
	ipAddress?: string | null;
	userAgent?: string | null;
	createdAt: Date;
	updatedAt: Date;
	[key: string]: unknown;
};

/** Configuration knobs for the auth subsystem. */
export interface AuthConfig {
	/**
	 * Better-auth handler mount path.
	 * Default: `'/api/auth/*'`.
	 */
	basePath?: string;

	/** Enable email + password authentication. Default: true. */
	emailAndPassword?: {
		enabled?: boolean;
		requireEmailVerification?: boolean;
		minPasswordLength?: number;
		maxPasswordLength?: number;
	};

	/** Social providers keyed by provider name (github, google, etc.). */
	socialProviders?: Record<string, SocialProviderConfig>;

	/** JWT plugin settings (token + JWKS endpoint). */
	jwt?: JwtConfig;

	/** Passkey (WebAuthn) plugin settings. */
	passkey?: PasskeyConfig;

	/** Session expiry in seconds. Default: 7 days. */
	sessionExpiresInSeconds?: number;

	/** Cookie domain. Useful for subdomains. */
	cookieDomain?: string;

	/** Cross-subdomain cookies (turn on for `*.example.com`). */
	crossSubDomainCookies?: {
		enabled: boolean;
		domain?: string;
	};

	/**
	 * Cookie attribute strategy for cross-origin requests.
	 * - 'lax'      → same-site only (default, safest)
	 * - 'none'     → cross-site; requires `secure: true`
	 * - 'strict'   → same-origin only
	 */
	cookieSameSite?: "lax" | "strict" | "none";

	/** `Secure` flag on cookies. Default: true in production. */
	cookieSecure?: boolean;

	/** A custom `BETTER_AUTH_SECRET` (otherwise read from env). */
	secret?: string;

	/** Custom `BETTER_AUTH_URL` (otherwise read from env). */
	baseUrl?: string;
}

export interface SocialProviderConfig {
	clientId: string;
	clientSecret: string;
	scope?: string[];
	redirectURI?: string;
}

export interface JwtConfig {
	enabled: boolean;
	/** Path for JWKS endpoint. Default: `/api/auth/jwks`. */
	jwksPath?: string;
	/** Issuer claim. Default: baseUrl. */
	issuer?: string;
	/** Audience claim. Default: baseUrl. */
	audience?: string;
	/** Token TTL in seconds. Default: 15 min. */
	expiresIn?: number;
}

export interface PasskeyConfig {
	enabled: boolean;
	/** Relying Party name (displayed by the browser). */
	rpName: string;
	/** Relying Party ID (typically the domain). */
	rpId: string;
	/** Allowed origins (e.g. `https://example.com`). */
	origin: string | string[];
}

/** Per-request authentication context attached to the Hono context. */
export interface AuthContext {
	user: AuthUser | null;
	session: AuthSessionRecord | null;
}

// ---------------------------------------------------------------------------
// Hono context variable typings
// ---------------------------------------------------------------------------

/**
 * Type augmentation so the Hono context has `user` and `session` keys.
 *
 * Usage in user code:
 *   import type { AuthVariables } from 'nexus/auth';
 *   const app = new Hono<{ Variables: AuthVariables }>();
 */
export type AuthVariables = {
	user: AuthUser | null;
	session: AuthSessionRecord | null;
};

/**
 * A loose type that matches what `betterAuth.handler` returns for
 * `getSession()`. Re-exported so users don't need to import from
 * `better-auth` directly when extending the auth instance.
 */
export type SecondaryStorage = NonNullable<
	Auth extends { options: { secondaryStorage?: infer S } } ? S : never
>;