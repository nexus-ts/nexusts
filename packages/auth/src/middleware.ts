/**
 * `authMiddleware` — populate `c.var.user` and `c.var.session` on
 * every request, optionally enforcing a "must be logged in" policy.
 *
 * This is a Hono middleware that wraps better-auth's `getSession`.
 * It runs after the better-auth handler has set its own cookies, so
 * subsequent reads are cheap (a single DB lookup).
 *
 * Three modes:
 *   - optional  → always allow; populate user/session if present
 *   - required  → 401 if no user
 *   - scoped    → require user only for paths matching a regex
 *
 * Usage:
 *   import { authMiddleware } from 'nexusjs/auth';
 *   app.use('*', authMiddleware(auth, { mode: 'optional' }));
 *   app.use('/api/*', authMiddleware(auth, { mode: 'required' }));
 */

import type { Auth } from "better-auth";
import type { Context, MiddlewareHandler } from "hono";
import type { AuthVariables } from "./types.js";

export type AuthMiddlewareMode = "optional" | "required" | "scoped";

export interface AuthMiddlewareOptions {
	/** Auth mode. Default: `'optional'`. */
	mode?: AuthMiddlewareMode;
	/** Path matcher (only used in `'scoped'` mode). */
	scope?: RegExp;
	/** Path matcher for `'scoped'` mode's protected set. */
	protectedPaths?: RegExp | RegExp[];
	/** Path matcher for paths that should be skipped entirely. */
	ignoredPaths?: RegExp | RegExp[];
	/** Customize the 401 response. */
	onUnauthenticated?: (c: Context) => Response | Promise<Response>;
	/** Customize the 403 response when a scope check fails. */
	onForbidden?: (c: Context) => Response | Promise<Response>;
}

export function authMiddleware(
	auth: Auth,
	options: AuthMiddlewareOptions = {},
): MiddlewareHandler<{ Variables: AuthVariables }> {
	const {
		mode = "optional",
		scope,
		protectedPaths,
		ignoredPaths,
		onUnauthenticated = defaultUnauthenticated,
		onForbidden: _onForbidden = defaultForbidden,
	} = options;

	const ignored = toMatcher(ignoredPaths);
	const protected_ =
		mode === "scoped"
			? toMatcher(scope ?? protectedPaths ?? /^\/.+/) // everything
			: null;

	return async (c, next) => {
		const path = c.req.path;

		// Skip ignored paths entirely (e.g. health checks).
		if (ignored?.test(path)) {
			return next();
		}

		// Populate the session.
		const session = await auth.api.getSession({
			headers: c.req.raw.headers,
		});

		if (session) {
			c.set("user", session.user as never);
			c.set("session", session.session as never);
		} else {
			c.set("user", null);
			c.set("session", null);
		}

		// Apply mode.
		if (mode === "required" || (protected_?.test(path) && session === null)) {
			if (session === null) return onUnauthenticated(c);
		}

		// Scope-based forbidden check (e.g. "user must have a specific role").
		// Skipped here — the route handler can call `requireRole(...)` itself.

		return next();
	};
}

function toMatcher(input?: RegExp | RegExp[]): RegExp | null {
	if (!input) return null;
	if (Array.isArray(input)) {
		return new RegExp(input.map((r) => `(?:${r.source})`).join("|"));
	}
	return input;
}

function defaultUnauthenticated(c: Context): Response {
	return c.json(
		{ error: "Unauthorized", message: "Authentication required." },
		401,
	);
}

function defaultForbidden(c: Context): Response {
	return c.json(
		{ error: "Forbidden", message: "Insufficient permissions." },
		403,
	);
}

/**
 * `authHandler` — mount better-auth's catch-all handler at a path.
 *
 * Use this instead of writing the `app.on(['POST', 'GET'], path, ...)`
 * boilerplate yourself.
 *
 *   app.use('/api/auth/*', cors({ ... }));
 *   app.all('/api/auth/*', authHandler(auth));
 */
export function authHandler(auth: Auth): MiddlewareHandler {
	return async (c) => auth.handler(c.req.raw);
}
