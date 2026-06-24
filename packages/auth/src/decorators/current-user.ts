/**
 * `@CurrentUser()` — controller parameter decorator that injects the
 * authenticated user (and optionally the session) into a handler.
 *
 * Usage:
 *   @Get('/me')
 *   me(@CurrentUser() user: AuthUser) {
 *     return user;
 *   }
 *
 *   @Get('/profile')
 *   profile(@CurrentUser({ session: true }) ctx: { user: AuthUser; session: AuthSessionRecord }) {
 *     return ctx;
 *   }
 *
 *   @Get('/dashboard')
 *   dashboard(@CurrentUser({ required: true }) user: AuthUser) {
 *     // 401 is thrown before the handler if no user is present.
 *     return this.dashboardService.forUser(user.id);
 *   }
 */

import "reflect-metadata";
import { createParamDecorator, PARAM_TYPES } from "@nexusts/core";
import type { AuthSessionRecord, AuthUser } from "../types.js";

export interface CurrentUserOptions {
	/**
	 * Include the session in the injected value. Default: `false`.
	 * When true, the value is `{ user, session }` instead of just the user.
	 */
	session?: boolean;
	/**
	 * Throw 401 if no user is present. Default: `false`.
	 * When true, the framework returns a 401 response without invoking
	 * the handler.
	 */
	required?: boolean;
	/**
	 * Throw 403 if the user does not satisfy the predicate.
	 */
	assert?: (user: AuthUser) => boolean | Promise<boolean>;
}

/**
 * Inject the authenticated user (or `{ user, session }` if `session: true`).
 */
export function CurrentUser(
	options: CurrentUserOptions = {},
): ParameterDecorator {
	return createParamDecorator(PARAM_TYPES.USER, options as never);
}

/**
 * Convenience: throw 401 with a JSON body when no user is present.
 * Exposed for users who want to enforce auth inside the handler.
 */
export class UnauthenticatedError extends Error {
	readonly status = 401;
	constructor(message = "Authentication required.") {
		super(message);
		this.name = "UnauthenticatedError";
	}
}

export class ForbiddenError extends Error {
	readonly status = 403;
	constructor(message = "Insufficient permissions.") {
		super(message);
		this.name = "ForbiddenError";
	}
}

// Re-export session record type for convenience.
export type { AuthSessionRecord as AuthSession };
