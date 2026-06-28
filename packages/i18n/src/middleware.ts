/**
 * Hono middleware that detects the active locale for a request
 * and stores it in the Hono context (`c.var.locale`).
 *
 * Detection priority:
 *   1. Query string: `?lang=ko`
 *   2. Cookie: `lang=ko`
 *   3. `Accept-Language` header
 *   4. Default locale
 *
 * The middleware uses `I18nService.negotiateLocale()` to pick
 * the best locale based on the request headers and the
 * service's registered catalog.
 */

import type { Context, MiddlewareHandler, Next } from "hono";
import type { I18nService } from "./service.js";
import type { DetectOptions, Locale } from "./types.js";

/** Augment Hono's `c.var` with the active locale. */
declare module "hono" {
	interface ContextVariableMap {
		locale?: Locale;
		i18n?: I18nService;
	}
}

export function i18nMiddleware(
	service: I18nService,
	options: DetectOptions = {},
): MiddlewareHandler {
	const queryKey = options.queryKey ?? "lang";
	const cookieKey = options.cookieKey ?? "lang";
	const defaultLocale = options.defaultLocale ?? service.getDefaultLocale();

	return async (c: Context, next: Next) => {
		const fromQuery = c.req.query(queryKey);
		const fromCookie = getCookie(c, cookieKey);
		const acceptLanguage = c.req.header("accept-language");

		const preferred: Locale[] = [];
		if (fromQuery) preferred.push(fromQuery);
		if (fromCookie) preferred.push(fromCookie);
		if (acceptLanguage) {
			preferred.push(...parseAcceptLanguage(acceptLanguage));
		}
		preferred.push(defaultLocale);

		const locale = service.negotiateLocale(preferred, acceptLanguage);
		c.set("locale", locale);
		c.set("i18n", service);
		await next();
	};
}

/* ------------------------------------------------------------------ *
 * Helpers
 * ------------------------------------------------------------------ */

function getCookie(c: Context, name: string): string | undefined {
	// Hono parses cookies lazily via `c.req.header("cookie")`. We
	// parse a small subset here; for production apps with many
	// cookies, prefer `hono/cookie`.
	const raw = c.req.header("cookie");
	if (!raw) return undefined;
	for (const part of raw.split(";")) {
		const [k, ...rest] = part.trim().split("=");
		if (k === name) return decodeURIComponent(rest.join("="));
	}
	return undefined;
}

function parseAcceptLanguage(header: string): Locale[] {
	return header
		.split(",")
		.map((part) => {
			const [tag, qPart] = part.trim().split(";");
			const q = qPart?.startsWith("q=") ? Number(qPart.slice(2)) : 1;
			return { tag: tag?.trim() ?? "", q: Number.isFinite(q) ? q : 1 };
		})
		.filter((e) => e.tag.length > 0)
		.sort((a, b) => b.q - a.q)
		.map((e) => e.tag);
}
