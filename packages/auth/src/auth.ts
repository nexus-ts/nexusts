/**
 * `createAuth()` — wrap better-auth's `betterAuth()` factory with
 * NexusTS-friendly defaults.
 *
 * This is the **only** place that talks to better-auth directly. Every
 * other NexusTS auth module consumes the resulting `Auth` instance via
 * DI or the registered token.
 *
 * Why an adapter layer instead of calling `betterAuth()` directly?
 *   1. NexusTS users write `auth.config.ts`, not raw better-auth options.
 *      The adapter translates between the two.
 *   2. Plugin selection (jwt, passkey) is toggled by boolean flags,
 *      not by importing plugin objects.
 *   3. Cookie / CORS / cross-subdomain defaults match Hono's `cors()`
 *      middleware so the two never conflict.
 *
 * Usage:
 *   // src/auth/auth.ts
 *   import { createAuth } from 'nexusjs/auth';
 *   export const auth = createAuth({
 *     basePath: '/api/auth',
 *     emailAndPassword: { enabled: true },
 *     socialProviders: {
 *       github: {
 *         clientId: process.env.GITHUB_CLIENT_ID!,
 *         clientSecret: process.env.GITHUB_CLIENT_SECRET!,
 *       },
 *     },
 *   });
 */

import { betterAuth } from "better-auth";
import type { AuthConfig } from "./types.js";

type BetterAuthInstance = ReturnType<typeof betterAuth>;

/**
 * Create a better-auth instance with NexusTS-friendly defaults.
 *
 * @param config NexusTS-shaped config (see types.ts).
 * @returns A `better-auth` Auth instance.
 */
export function createAuth(config: AuthConfig = {}): BetterAuthInstance {
	const secret = config.secret ?? process.env.BETTER_AUTH_SECRET;
	const baseURL = config.baseUrl ?? process.env.BETTER_AUTH_URL;

	if (!secret) {
		throw new Error(
			"[nexus/auth] BETTER_AUTH_SECRET is required. " +
				"Generate one with `openssl rand -base64 32` and add it to .env.",
		);
	}
	if (!baseURL) {
		throw new Error(
			"[nexus/auth] BETTER_AUTH_URL is required (e.g. http://localhost:3000).",
		);
	}

	const plugins: Array<unknown> = [];

	// JWT plugin — opt-in.
	if (config.jwt?.enabled) {
		// Lazy import so the plugin's transitive dependencies don't load
		// when the user hasn't asked for JWT.
		// eslint-disable-next-line @typescript-eslint/no-require-imports
		const { jwt } = require("better-auth/plugins");
		plugins.push(
			jwt({
				jwks: {
					path: config.jwt.jwksPath ?? "/api/auth/jwks",
				},
				issuer: config.jwt.issuer ?? baseURL,
				audience: config.jwt.audience ?? baseURL,
				expiresIn: config.jwt.expiresIn ?? 60 * 15,
			}),
		);
	}

	// Passkey plugin — opt-in.
	if (config.passkey?.enabled) {
		// eslint-disable-next-line @typescript-eslint/no-require-imports
		const { passkey } = require("better-auth/plugins");
		plugins.push(
			passkey({
				rpName: config.passkey.rpName,
				rpID: config.passkey.rpId,
				origin: config.passkey.origin,
			}),
		);
	}

	return betterAuth({
		secret,
		baseURL,
		basePath: config.basePath ?? "/api/auth",
		emailAndPassword: {
			enabled: config.emailAndPassword?.enabled ?? true,
			requireEmailVerification:
				config.emailAndPassword?.requireEmailVerification ?? false,
			minPasswordLength: config.emailAndPassword?.minPasswordLength ?? 8,
			maxPasswordLength: config.emailAndPassword?.maxPasswordLength ?? 128,
		},
		session: {
			expiresIn: config.sessionExpiresInSeconds ?? 60 * 60 * 24 * 7, // 7 days
		},
		socialProviders: config.socialProviders as never,
		advanced: {
			cookies: {
				sessionToken: {
					attributes: {
						sameSite: (config.cookieSameSite ?? "lax") as
							| "lax"
							| "strict"
							| "none",
						secure:
							config.cookieSecure ?? process.env.NODE_ENV === "production",
						...(config.cookieDomain ? { domain: config.cookieDomain } : {}),
					},
				},
			},
			crossSubDomainCookies: config.crossSubDomainCookies?.enabled
				? {
						enabled: true,
						domain: config.crossSubDomainCookies.domain,
					}
				: undefined,
		},
		plugins,
	} as never) as unknown as BetterAuthInstance;
}

/**
 * Type alias for the returned auth instance — convenient for DI token
 * typings.
 */
export type NexusAuth = ReturnType<typeof createAuth>;
