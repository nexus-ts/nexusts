/**
 * Inertia form middleware.
 *
 * Hooks into the request lifecycle for form actions (POST/PUT/PATCH/
 * DELETE) to do two things:
 *
 * 1. **Pre-parse form bodies.** When the client posts URL-encoded or
 *    multipart data, parsing the body consumes the request stream.
 *    The framework's `@Body()` parameter decorator parses JSON bodies
 *    by default; this middleware additionally caches the parsed form
 *    under `c.var.nexus.formBody` so controllers can read it via
 *    `c.get('formBody')` without re-parsing.
 *
 * 2. **CSRF token validation.** If `validateCsrf` is enabled the
 *    middleware looks for a token either in a header (`csrfHeader`) or
 *    a form field (`csrfField`), compares it to the token registered
 *    in shared props (`csrfSharedKey`), and returns 419 on mismatch.
 *
 * The middleware does NOT enforce a specific redirect strategy — the
 * `InertiaFormBuilder` handles that at the action level (303 + PRG).
 */

import type { Middleware } from "@nexusts/core";
import type { Context, Next } from "hono";

export interface InertiaFormMiddlewareOptions {
	/**
	 * Whether to enforce CSRF validation. Off by default; turn on for
	 * any deployment that exposes session-cookie auth.
	 */
	validateCsrf?: boolean;

	/** Header name carrying the CSRF token. Default: `X-CSRF-Token`. */
	csrfHeader?: string;

	/** Form field name carrying the CSRF token. Default: `_token`. */
	csrfField?: string;

	/**
	 * Key under `sharedProps` where the canonical CSRF token lives.
	 * Default: `csrfToken`. The middleware reads this from
	 * `c.var.nexus?.shared` (populated by `inertia.share(...)`).
	 */
	csrfSharedKey?: string;

	/**
	 * Provide a custom CSRF resolver. Overrides the default shared-prop
	 * lookup. Useful when the token is rotated per request via a
	 * dedicated provider.
	 */
	getCsrfToken?: (c: Context) => string | undefined;

	/**
	 * Status code to return on CSRF mismatch. Default: 419 (Laravel's
	 * "Page Expired" convention).
	 */
	csrfFailureStatus?: number;
}

/** Methods that may carry form bodies and are CSRF-sensitive. */
const FORM_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

export function inertiaFormMiddleware(
	options: InertiaFormMiddlewareOptions = {},
): Middleware {
	const csrfHeader = (options.csrfHeader ?? "X-CSRF-Token").toLowerCase();
	const csrfField = options.csrfField ?? "_token";
	const csrfSharedKey = options.csrfSharedKey ?? "csrfToken";
	const csrfStatus = options.csrfFailureStatus ?? 419;

	return async (c: Context, next: Next) => {
		const method = c.req.method;

		// 1. Skip non-form methods. We still want this middleware in the
		//    chain so the user doesn't have to think about ordering.
		if (!FORM_METHODS.has(method)) {
			await next();
			return;
		}

		// 2. CSRF check (optional). Done before parsing the body so we
		//    don't waste cycles on requests we'll reject.
		if (options.validateCsrf) {
			const expected = options.getCsrfToken
				? options.getCsrfToken(c)
				: (c.get("nexusjs") as any)?.shared?.[csrfSharedKey];

			if (typeof expected === "string" && expected.length > 0) {
				const submittedHeader = c.req.header(csrfHeader);
				const submittedField = await readFieldFromBody(c, csrfField);
				const submitted = submittedHeader ?? submittedField;

				if (submitted !== expected) {
					return c.json({ message: "CSRF token mismatch" }, csrfStatus as any);
				}
			}
		}

		// 3. Pre-parse form body. We only parse when the Content-Type
		//    indicates a form encoding — JSON is handled by the
		//    `@Body()` parameter decorator.
		const contentType = c.req.header("content-type") ?? "";
		if (
			contentType.includes("application/x-www-form-urlencoded") ||
			contentType.includes("multipart/form-data")
		) {
			try {
				const parsed = await c.req.parseBody();
				// Expose to downstream handlers via Hono's `c.set` so any
				// middleware in the chain (e.g. logging) can see it.
				c.set("formBody" as any, parsed as Record<string, any>);
			} catch {
				// Malformed body — let the controller deal with it. We
				// don't want to 400 here because the user might have
				// shipped a controller that validates manually.
			}
		}

		await next();
		return;
	};
}

/**
 * Look for a single field in a form body. We avoid a full body parse
 * if Hono hasn't already cached one. In practice the `parseBody` call
 * upstream is the expensive bit; reading a field from the result is
 * constant time.
 */
async function readFieldFromBody(
	c: Context,
	field: string,
): Promise<string | undefined> {
	const cached = c.get("formBody" as any) as Record<string, any> | undefined;
	if (cached && Object.hasOwn(cached, field)) {
		const v = cached[field];
		return Array.isArray(v) ? v[0] : v;
	}
	try {
		const body = await c.req.parseBody();
		if (body && Object.hasOwn(body, field)) {
			const v = (body as any)[field];
			return Array.isArray(v) ? v[0] : v;
		}
	} catch {
		// Body was JSON or malformed; CSRF token cannot live there.
	}
	return undefined;
}
