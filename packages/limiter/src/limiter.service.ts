/**
 * `LimiterService` — single entry point for in-process rate-limit checks.
 *
 * Holds a `RateLimitStorage` and the global `LimiterConfig` so the
 * middleware and the `@RateLimit` decorator share one source of truth.
 *
 *   const svc = new LimiterService({ storage: new MemoryRateLimitStorage() });
 *   await svc.check('ip:1.2.3.4', { points: 5, duration: '1m' });
 */
import { Inject, Injectable } from "@nexusts/core";
import { MemoryRateLimitStorage } from "./backends/memory.js";
import type {
	LimiterConfig,
	RateLimitResult,
	RateLimitRule,
	RateLimitStorage,
} from "./types.js";
import { durationToMs } from "./types.js";

@Injectable()
export class LimiterService {
	/** DI token — `@Inject(LimiterService.TOKEN)`. */
	static readonly TOKEN = Symbol.for("nexus:LimiterService");

	/** Rate-limit config — injected by DI container. */
	@Inject("LIMITER_CONFIG") declare private config: LimiterConfig;

	private _storage: RateLimitStorage | null = null;
	private _rules: RateLimitRule[] = [];
	private _defaultKey: NonNullable<LimiterConfig["defaultKey"]> | null = null;
	private _defaultReject: NonNullable<LimiterConfig["defaultReject"]> | null = null;

	constructor() {
		// DI sets @Inject fields before first use.
	}

	get storage(): RateLimitStorage {
		if (!this._storage) {
			this._storage = (this.config ?? {}).storage ?? new MemoryRateLimitStorage();
		}
		return this._storage;
	}

	get rules(): RateLimitRule[] {
		if (!this._rules.length && this.config?.rules) {
			this._rules = this.config.rules;
		}
		return this._rules;
	}

	get defaultKey(): NonNullable<LimiterConfig["defaultKey"]> {
		if (!this._defaultKey) {
			this._defaultKey =
				(this.config ?? {}).defaultKey ??
				((c: any) => {
					const fwd = c?.req?.header?.("x-forwarded-for");
					if (fwd) return fwd.split(",")[0]?.trim() ?? "unknown";
					return c?.req?.raw?.["conn"]?.remoteAddr?.hostname ?? "unknown";
				});
		}
		return this._defaultKey;
	}

	get defaultReject(): NonNullable<LimiterConfig["defaultReject"]> {
		if (!this._defaultReject) {
			this._defaultReject =
				(this.config ?? {}).defaultReject ??
				((_c, result) =>
					new Response(
						JSON.stringify({
							error: "Too Many Requests",
							limit: result.limit,
							remaining: 0,
							retryAfter: result.retryAfter,
						}),
						{
							status: 429,
							headers: {
								"Content-Type": "application/json",
								"Retry-After": String(result.retryAfter),
								"X-RateLimit-Limit": String(result.limit),
								"X-RateLimit-Remaining": "0",
								"X-RateLimit-Reset": String(Math.ceil(result.resetAt / 1000)),
							},
						},
					));
		}
		return this._defaultReject;
	}

	/**
	 * Check a single rule against `key`. Always consumes one point
	 * (or rejects).
	 */
	async check(key: string, rule: RateLimitRule): Promise<RateLimitResult> {
		const durationMs = durationToMs(rule.duration);
		return this.storage.consume(
			key,
			1,
			rule.points,
			durationMs,
			rule.strategy ?? "sliding-window",
		);
	}

	/** Reset the state for a given key. */
	async reset(key: string): Promise<void> {
		await this.storage.reset(key);
	}
}
