/**
 * `nexusjs/limiter` — rate limiting.
 *
 * Two ways to apply limits:
 *
 *   1. **Global** via `LimiterModule.forRoot({ rules: [...] })`:
 *      limits matched against request path / method.
 *
 *   2. **Per-route** via the `@RateLimit` decorator:
 *
 *      ```ts
 *      @Controller('/auth')
 *      class AuthController {
 *        @Post('/login')
 *        @RateLimit({ points: 5, duration: '1m' })
 *        login() {}
 *      }
 *      ```
 *
 * Key derivation: by default we use `c.req.header('x-forwarded-for')`
 * or the remote address. Decorator `key` option overrides with a
 * function (e.g. user ID, API key).
 *
 * Backends:
 *   - `MemoryStorage` (default, single-process)
 *   - `RedisStorage` (optional, multi-process / multi-pod)
 */

import { METADATA_KEY } from "@nexusts/core";
import { safeGetMeta, safeDefineMeta, safeHasMeta } from "@nexusts/core/di/safe-reflect";

/** Identifier of the request — IP, user ID, API key, etc. */
export type RateLimitKey = string;

/** Strategy used to count requests. */
export type RateLimitStrategy =
	| "fixed-window"
	| "sliding-window"
	| "token-bucket";

/**
 * Numeric size of a window. Either a millisecond count or one of
 * `'1s'`, `'1m'`, `'1h'`, `'1d'` for convenience.
 */
export type DurationLike = number | `${number}${"s" | "m" | "h" | "d"}`;

/** Result of a single rate-limit check. */
export interface RateLimitResult {
	/** Whether the request is allowed. */
	allowed: boolean;
	/** Remaining points in the current window. */
	remaining: number;
	/** Total points in the current window. */
	limit: number;
	/** Unix-ms timestamp when the window resets. */
	resetAt: number;
	/** Number of seconds the client should wait (only when `allowed=false`). */
	retryAfter: number;
}

/** Storage backend for limiter state. */
export interface RateLimitStorage {
	/**
	 * Consume `points` units for `key`, allowing at most `limit` units
	 * per `durationMs` window. Returns the limit result.
	 * Implementations must be atomic across concurrent callers.
	 */
	consume(
		key: RateLimitKey,
		points: number,
		limit: number,
		durationMs: number,
		strategy: RateLimitStrategy,
	): Promise<RateLimitResult>;

	/** Reset all state for a key. Useful in tests. */
	reset(key: RateLimitKey): Promise<void>;
}

/** Per-rule configuration. */
export interface RateLimitRule {
	/** Path pattern. Glob: `*` matches a single segment, `**` any depth. */
	path: string;
	/** HTTP methods to apply to; default = all. */
	methods?: string[];
	/** Number of allowed requests per window. */
	points: number;
	/** Window size. */
	duration: DurationLike;
	/** Override key derivation. */
	key?: (c: any) => string | undefined | Promise<string | undefined>;
	/** Bucket strategy. Default `'sliding-window'`. */
	strategy?: RateLimitStrategy;
	/** Custom rejection response. */
	reject?: (c: any, result: RateLimitResult) => Response | Promise<Response>;
	/** Skip when this returns true. */
	skip?: (c: any) => boolean | Promise<boolean>;
}

/** Top-level configuration. */
export interface LimiterConfig {
	/** Storage backend. Default: in-memory. */
	storage?: RateLimitStorage;
	/** Global rules applied before the per-route ones. */
	rules?: RateLimitRule[];
	/** Default key derivation when a rule omits one. Default: IP address. */
	defaultKey?: (c: any) => string | undefined | Promise<string | undefined>;
	/** Default response when a request is rejected. */
	defaultReject?: (
		c: any,
		result: RateLimitResult,
	) => Response | Promise<Response>;
}

export const LIMITER_RULE_KEY = Symbol.for("nexus:RateLimitRule");

/** Decorator: attach a per-route rate limit. */
export function RateLimit(
	rule: RateLimitRule,
): MethodDecorator & ClassDecorator {
	return (
		target: any,
		propertyKey?: string | symbol,
		descriptor?: PropertyDescriptor,
	) => {
		// Class-level: applied to all routes of the controller.
		if (descriptor === undefined) {
			const existing: RateLimitRule[] =
				safeGetMeta(LIMITER_RULE_KEY, target) ?? [];
			existing.push({ ...rule, path: "**" });
			safeDefineMeta(LIMITER_RULE_KEY, existing, target);
			return target;
		}
		// Method-level: bound to the route.
		const existing: RateLimitRule[] =
			safeGetMeta(LIMITER_RULE_KEY, target.constructor) ?? [];
		existing.push({ ...rule, path: propertyKey === undefined ? "**" : `**` });
		safeDefineMeta(LIMITER_RULE_KEY, existing, target.constructor);
	};
}

/** Read all `@RateLimit` rules from a controller or method. */
export function getLimiterRules(target: any): RateLimitRule[] {
	return safeGetMeta(LIMITER_RULE_KEY, target) ?? [];
}

/** Convert a `DurationLike` to milliseconds. */
export function durationToMs(d: DurationLike): number {
	if (typeof d === "number") return d;
	const m = /^(\d+)([smhd])$/.exec(d);
	if (!m) throw new Error(`Invalid duration: ${d}`);
	const n = Number(m[1]);
	const unit = m[2] as "s" | "m" | "h" | "d";
	const mult: Record<typeof unit, number> = {
		s: 1000,
		m: 60_000,
		h: 3_600_000,
		d: 86_400_000,
	};
	return n * mult[unit];
}
