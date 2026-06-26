/**
 * Hono middleware factory. Applies all matching global rules in order;
 * the first one that rejects wins. Used by the framework's mount pipeline.
 */
import { Inject, Injectable } from "@nexusts/core";
import { LimiterService } from "./limiter.service.js";
import type { RateLimitRule } from "./types.js";

@Injectable()
export class LimiterMiddleware {
	/** DI token. */
	static readonly TOKEN = Symbol.for("nexus:LimiterMiddleware");

	@Inject(LimiterService.TOKEN) declare private readonly limiter: LimiterService;

	/** Returns a Hono middleware. */
	middleware() {
		return async (c: any, next: () => Promise<any>) => {
			const method = c.req.method.toUpperCase();
			for (const rule of this.limiter.rules) {
				if (!this.matches(rule, method, c.req.path)) continue;
				if (rule.skip && (await rule.skip(c))) continue;
				const keyFn = rule.key ?? this.limiter.defaultKey;
				const key = (await keyFn(c)) ?? "unknown";
				const result = await this.limiter.check(key, rule);
				c.header?.("X-RateLimit-Limit", String(result.limit));
				c.header?.("X-RateLimit-Remaining", String(result.remaining));
				c.header?.("X-RateLimit-Reset", String(Math.ceil(result.resetAt / 1000)));
				if (!result.allowed) {
					const reject = rule.reject ?? this.limiter.defaultReject;
					return reject(c, result);
				}
			}
			return next();
		};
	}

	private matches(rule: RateLimitRule, method: string, path: string): boolean {
		if (rule.methods && rule.methods.length > 0) {
			if (!rule.methods.map((m) => m.toUpperCase()).includes(method)) return false;
		}
		if (rule.path === "**") return true;
		return matchGlob(rule.path, path);
	}
}

/** Glob match: `*` = one segment, `**` = any depth. */
function matchGlob(pattern: string, path: string): boolean {
	const regex = new RegExp(
		"^" +
			pattern
				.replace(/[.+^${}()|[\]\\]/g, "\\$&")
				.replace(/\*\*/g, "::DOUBLESTAR::")
				.replace(/\*/g, "[^/]+")
				.replace(/::DOUBLESTAR::/g, ".*") +
			"/?$",
	);
	return regex.test(path);
}
