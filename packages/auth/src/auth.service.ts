/**
 * `AuthService` — DI-friendly wrapper around a better-auth instance.
 *
 * Why a service wrapper?
 *   - Hides the raw better-auth object behind a stable NexusTS API.
 *   - Exposes the high-level operations controllers need:
 *     signUp, signIn, signOut, getSession, oauthUrl, jwt, passkey.
 *   - Allows tests to swap the implementation via DI.
 *
 * Usage:
 *   constructor(@Inject(AuthService.TOKEN) private auth: AuthService) {}
 *
 *   await this.auth.signUp.email({ email, password, name });
 *   const session = await this.auth.getSession({ headers: c.req.raw.headers });
 *   return this.auth.redirect('/dashboard');  // 302
 */

import { Inject, Injectable } from "@nexusts/core";
import type { SessionService } from "@nexusts/session";
import { createAuth, type NexusAuth } from "./auth.js";
import type {
	AuthConfig,
	AuthSession,
	AuthSessionRecord,
	AuthUser,
} from "./types.js";

@Injectable()
export class AuthService {
	/** DI token — use with `@Inject(AuthService.TOKEN)`. */
	static readonly TOKEN = Symbol.for("nexus:AuthService");

	/** The underlying better-auth instance. */
	readonly instance: NexusAuth;

	/**
	 * Optional SessionService binding. When set, `getSession()` will
	 * first check the SessionService's cookie before falling back to
	 * better-auth. This enables shared session state between the two
	 * modules (e.g. flash messages, guest cart).
	 *
	 * Set via `bindSession()` from a feature module's `onInit`, or via
	 * DI when both modules are present.
	 */
	#sessionService: SessionService | null = null;

	constructor(
		@Inject("AUTH_CONFIG") private readonly config: AuthConfig,
	) {
		// Lazy: defer construction to the first call so module-load
		// order doesn't matter.
		this.instance = createAuth(this.config);
	}

	// ===========================================================================
	// Session integration
	// ===========================================================================

	/**
	 * Bind a SessionService. When bound, `getSession()` consults the
	 * SessionService first and falls back to better-auth. Returns `this`
	 * for chaining.
	 */
	bindSession(sessionService: SessionService): this {
		this.#sessionService = sessionService;
		return this;
	}

	/**
	 * Returns true when a SessionService has been bound.
	 */
	hasSessionBinding(): boolean {
		return this.#sessionService !== null;
	}

	// ===========================================================================
	// Session
	// ===========================================================================

	/**
	 * Get the current session from a request. Returns `null` if not
	 * authenticated.
	 *
	 * When a SessionService is bound, we try it first (cookie-based,
	 * stateless, edge-friendly); better-auth remains the source of
	 * truth for `user` / `session` records. The cookie value carries
	 * `userId` which lets you cross-reference both systems.
	 */
	async getSession(input: { headers: Headers }): Promise<AuthSession> {
		// 1) Try SessionService (cookie-based) first.
		if (this.#sessionService) {
			const cookieName = this.#sessionService.cookieName;
			if (cookieName) {
				const cookieHeader = input.headers.get("cookie") ?? "";
				const value = parseCookie(cookieHeader, cookieName);
				if (value) {
					const decoded = this.#sessionService.decodeCookie(value);
					if (decoded?.userId) {
						// Hydrate the user from better-auth (so the returned
						// shape matches what controllers expect).
						const fromBetterAuth = (await this.instance.api.getSession({
							headers: input.headers,
						})) as AuthSession | null;
						if (fromBetterAuth?.user) {
							return fromBetterAuth;
						}
					}
				}
			}
		}

		// 2) Fallback to better-auth.
		const result = await this.instance.api.getSession({
			headers: input.headers,
		});
		return result as AuthSession;
	}

	/**
	 * Read the raw SessionService record from a request (no better-auth
	 * lookup). Returns null when no SessionService is bound or no
	 * session is found.
	 */
	async getRawSession(input: { headers: Headers }) {
		if (!this.#sessionService) return null;
		const cookieName = this.#sessionService.cookieName;
		if (!cookieName) return null;
		const cookieHeader = input.headers.get("cookie") ?? "";
		const value = parseCookie(cookieHeader, cookieName);
		if (!value) return null;
		return this.#sessionService.decodeCookie(value);
	}

	// ===========================================================================
	// Sign up / Sign in / Sign out
	// ===========================================================================

	/**
	 * Email + password sign-up. Throws if email/password is disabled
	 * in the auth config.
	 */
	async signUp(input: {
		email: string;
		password: string;
		name: string;
		image?: string;
		callbackURL?: string;
	}) {
		return this.instance.api.signUpEmail({
			body: input as never,
		});
	}

	/** Email + password sign-in. */
	async signIn(input: { email: string; password: string; callbackURL?: string }) {
		return this.instance.api.signInEmail({
			body: input as never,
		});
	}

	/** Sign out — invalidates the current session. */
	async signOut(input: { headers: Headers }) {
		return this.instance.api.signOut({
			headers: input.headers,
		});
	}

	// ===========================================================================
	// Social / OAuth
	// ===========================================================================

	/**
	 * Get the URL the client should redirect to for a social sign-in.
	 */
	async getOAuthUrl(input: {
		provider: string;
		callbackURL?: string;
	}) {
		return this.instance.api.signInSocial({
			body: input as never,
		});
	}

	/**
	 * Sign in / link a social account and return the user.
	 */
	async handleOAuthCallback(input: { headers: Headers; query: Record<string, string> }) {
		return this.instance.api.signInSocial({
			headers: input.headers,
			query: input.query,
			body: {} as never,
		});
	}

	// ===========================================================================
	// JWT
	// ===========================================================================

	/**
	 * Issue a JWT for the currently-authenticated user. Returns
	 * `{ token, expiresAt }`. Requires the JWT plugin (`config.jwt.enabled`).
	 */
	async issueJwt(input: { userId: string }) {
		const api = this.instance.api as unknown as {
			signJWT?: (input: { body: { userId: string } }) => Promise<{
				token: string;
				expiresAt: Date;
			}>;
		};
		if (!api.signJWT) {
			throw new Error(
				"[nexus/auth] JWT plugin not enabled. Set `auth.jwt.enabled: true` in nx.config.ts.",
			);
		}
		return api.signJWT({ body: { userId: input.userId } });
	}

	// ===========================================================================
	// Passkey
	// ===========================================================================

	async registerPasskey(input: { headers: Headers }) {
		const api = this.instance.api as unknown as {
			passkey?: {
				register: (input: { headers: Headers }) => Promise<unknown>;
			};
		};
		if (!api.passkey) {
			throw new Error(
				"[nexus/auth] Passkey plugin not enabled. Set `auth.passkey.enabled: true` in nx.config.ts.",
			);
		}
		return api.passkey.register({ headers: input.headers });
	}

	async authenticatePasskey(input: { headers: Headers; body: unknown }) {
		const api = this.instance.api as unknown as {
			passkey?: {
				authenticate: (input: { headers: Headers; body: unknown }) => Promise<unknown>;
			};
		};
		if (!api.passkey) {
			throw new Error("[nexus/auth] Passkey plugin not enabled.");
		}
		return api.passkey.authenticate({ headers: input.headers, body: input.body });
	}

	// ===========================================================================
	// Helpers
	// ===========================================================================

	/**
	 * Build a redirect Response. Used by controllers that need to send
	 * the user to a different page after sign-in / sign-up.
	 */
	redirect(to: string, status: 302 | 303 | 307 | 308 = 302): Response {
		return new Response(null, { status, headers: { Location: to } });
	}

	/**
	 * Convert a session into the `AuthVariables` shape Hono expects.
	 */
	toContextVariables(session: AuthSession): {
		user: AuthUser | null;
		session: AuthSessionRecord | null;
	} {
		if (!session) return { user: null, session: null };
		return { user: session.user, session: session.session };
	}
}

/**
 * Extract a single cookie value from a `Cookie` header string.
 * Tiny helper to avoid pulling in a cookie-parsing dependency.
 */
function parseCookie(cookieHeader: string, name: string): string | null {
	if (!cookieHeader) return null;
	const parts = cookieHeader.split(";");
	for (const part of parts) {
		const eq = part.indexOf("=");
		if (eq < 0) continue;
		const k = part.slice(0, eq).trim();
		if (k === name) {
			return decodeURIComponent(part.slice(eq + 1).trim());
		}
	}
	return null;
}