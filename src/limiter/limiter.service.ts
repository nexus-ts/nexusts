/**
 * `LimiterService` — single entry point for in-process rate-limit checks.
 *
 * Holds a `RateLimitStorage` and the global `LimiterConfig` so the
 * middleware and the `@RateLimit` decorator share one source of truth.
 *
 *   const svc = new LimiterService({ storage: new MemoryRateLimitStorage() });
 *   await svc.check('ip:1.2.3.4', { points: 5, duration: '1m' });
 */
import { Inject, Injectable } from "../core/decorators/index.js";
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

	storage: RateLimitStorage;
	rules: RateLimitRule[];
	defaultKey: NonNullable<LimiterConfig["defaultKey"]>;
	defaultReject: NonNullable<LimiterConfig["defaultReject"]>;

	constructor(@Inject("LIMITER_CONFIG") config: LimiterConfig = {}) {
		this.storage = config.storage ?? new MemoryRateLimitStorage();
		this.rules = config.rules ?? [];
		this.defaultKey =
			config.defaultKey ??
			((c: any) => {
				const fwd = c?.req?.header?.("x-forwarded-for");
				if (fwd) return fwd.split(",")[0]?.trim() ?? "unknown";
				return c?.req?.raw?.["conn"]?.remoteAddr?.hostname ?? "unknown";
			});
		this.defaultReject =
			config.defaultReject ??
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
