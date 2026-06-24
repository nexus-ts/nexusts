/**
 * In-memory rate-limit storage. Sliding-window log by default.
 *
 * - `fixed-window`: counter reset every `durationMs` ms.
 * - `sliding-window`: counts requests in the trailing `durationMs` window.
 * - `token-bucket`: refills at `points / durationMs` tokens per ms.
 *
 * Not cluster-safe. For multi-pod deployments use `RedisStorage`.
 */
import type {
	RateLimitKey,
	RateLimitStorage,
	RateLimitStrategy,
} from "../types.js";

interface FixedBucket {
	resetAt: number;
	count: number;
}

interface SlidingLog {
	log: number[]; // unix-ms timestamps
}

interface TokenBucket {
	tokens: number;
	updatedAt: number;
}

export class MemoryRateLimitStorage implements RateLimitStorage {
	readonly kind = "memory" as const;
	private fixed = new Map<RateLimitKey, FixedBucket>();
	private sliding = new Map<RateLimitKey, SlidingLog>();
	private token = new Map<RateLimitKey, TokenBucket>();

	async consume(
		key: RateLimitKey,
		points: number,
		limit: number,
		durationMs: number,
		strategy: RateLimitStrategy = "sliding-window",
	) {
		const now = Date.now();
		switch (strategy) {
			case "fixed-window":
				return this.consumeFixed(key, points, limit, durationMs, now);
			case "sliding-window":
				return this.consumeSliding(key, points, limit, durationMs, now);
			case "token-bucket":
				return this.consumeToken(key, points, limit, durationMs, now);
			default: {
				// Exhaustive check
				const _: never = strategy;
				throw new Error(`Unknown strategy: ${_}`);
			}
		}
	}

	async reset(key: RateLimitKey): Promise<void> {
		this.fixed.delete(key);
		this.sliding.delete(key);
		this.token.delete(key);
	}

	private consumeFixed(
		key: RateLimitKey,
		points: number,
		limit: number,
		durationMs: number,
		now: number,
	) {
		let b = this.fixed.get(key);
		if (!b || b.resetAt <= now) {
			b = { resetAt: now + durationMs, count: 0 };
			this.fixed.set(key, b);
		}
		b.count += points;
		const allowed = b.count <= limit;
		return {
			allowed,
			remaining: Math.max(0, limit - b.count),
			limit,
			resetAt: b.resetAt,
			retryAfter: allowed ? 0 : Math.ceil((b.resetAt - now) / 1000),
		};
	}

	private consumeSliding(
		key: RateLimitKey,
		points: number,
		limit: number,
		durationMs: number,
		now: number,
	) {
		let s = this.sliding.get(key);
		if (!s) {
			s = { log: [] };
			this.sliding.set(key, s);
		}
		// Drop entries outside the trailing window.
		const cutoff = now - durationMs;
		s.log = s.log.filter((t) => t > cutoff);
		const inWindow = s.log.length + points;
		const allowed = inWindow <= limit;
		if (allowed) {
			for (let i = 0; i < points; i++) s.log.push(now);
		}
		const oldest = s.log[0] ?? now;
		return {
			allowed,
			remaining: Math.max(0, limit - s.log.length),
			limit,
			resetAt: now + durationMs,
			retryAfter: allowed ? 0 : Math.ceil((oldest + durationMs - now) / 1000),
		};
	}

	private consumeToken(
		key: RateLimitKey,
		points: number,
		limit: number,
		durationMs: number,
		now: number,
	) {
		let b = this.token.get(key);
		const refillPerMs = limit / durationMs;
		if (!b) {
			b = { tokens: limit, updatedAt: now };
			this.token.set(key, b);
		} else {
			const elapsed = now - b.updatedAt;
			b.tokens = Math.min(limit, b.tokens + elapsed * refillPerMs);
			b.updatedAt = now;
		}
		const allowed = b.tokens >= points;
		if (allowed) b.tokens -= points;
		return {
			allowed,
			remaining: Math.floor(b.tokens),
			limit,
			resetAt: now + durationMs,
			retryAfter: allowed
				? 0
				: Math.ceil((points - b.tokens) / refillPerMs / 1000),
		};
	}
}
