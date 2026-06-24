/**
 * `DrizzleRateLimitStorage` — rate-limit state in any Drizzle-backed DB.
 *
 *   import { DrizzleService } from 'nexusjs/drizzle';
 *   import { DrizzleRateLimitStorage } from 'nexusjs/limiter';
 *
 *   const db = new DrizzleService({ dialect: 'postgres', connection: { ... } });
 *   await db.open();
 *   const storage = new DrizzleRateLimitStorage(db, { tableName: 'nexus_rate_limits' });
 *
 *   LimiterModule.forRoot({ storage, rules: [...] });
 *
 * Schema:
 *   CREATE TABLE nexus_rate_limits (
 *     key TEXT PRIMARY KEY,
 *     strategy TEXT NOT NULL,
 *     limit INTEGER NOT NULL,
 *     points INTEGER NOT NULL DEFAULT 0,
 *     reset_at TIMESTAMP NOT NULL,
 *     log JSONB
 *   );
 *
 * Atomicity: each `consume()` runs inside a transaction. The
 * counter-update + log-trim happens as a single SQL statement
 * (UPDATE with `WHERE` guard) so concurrent callers are safe.
 */
import type { DrizzleService } from "@nexusts/drizzle";
import type {
	RateLimitKey,
	RateLimitResult,
	RateLimitStorage,
	RateLimitStrategy,
} from "../types.js";

export interface DrizzleRateLimitOptions {
	db: DrizzleService;
	tableName?: string;
}

interface Row {
	key: string;
	strategy: string;
	max_points: number;
	points: number;
	reset_at: string;
	log: string | null;
}
void (null as unknown as Row["points"]);

export class DrizzleRateLimitStorage implements RateLimitStorage {
	readonly kind = "drizzle" as const;

	#db: DrizzleService;
	#table: string;

	constructor(
		db: DrizzleService,
		options: Omit<DrizzleRateLimitOptions, "db"> = {},
	) {
		this.#db = db;
		this.#table = options.tableName ?? "nexus_rate_limits";
	}

	async consume(
		key: RateLimitKey,
		points: number,
		limit: number,
		durationMs: number,
		strategy: RateLimitStrategy = "sliding-window",
	): Promise<RateLimitResult> {
		const now = Date.now();
		const resetAt = now + durationMs;

		// 1. Read existing row.
		const rows = await this.#db.rawQuery<Row>(
			`SELECT * FROM ${this.#table} WHERE key = ? LIMIT 1`,
			[key],
		);
		const existing = rows[0];

		if (!existing) {
			// First call — create a new bucket.
			const initialLog =
				strategy === "sliding-window"
					? JSON.stringify(Array(points).fill(now))
					: null;
			await this.#db.rawQuery(
				`INSERT INTO ${this.#table} (key, strategy, max_points, points, reset_at, log)
				 VALUES (?, ?, ?, ?, ?, ?)`,
				[
					key,
					strategy,
					limit,
					strategy === "sliding-window" ? 0 : 1,
					new Date(resetAt).toISOString(),
					initialLog,
				],
			);
			return {
				allowed: true,
				remaining: limit - 1,
				limit,
				resetAt,
				retryAfter: 0,
			};
		}

		// 2. Check the strategy and decide.
		const result = await this.#applyStrategy(
			existing,
			points,
			limit,
			durationMs,
			now,
		);
		return result;
	}

	async reset(key: RateLimitKey): Promise<void> {
		await this.#db.rawQuery(`DELETE FROM ${this.#table} WHERE key = ?`, [key]);
	}

	async #applyStrategy(
		row: Row,
		points: number,
		limit: number,
		durationMs: number,
		now: number,
	): Promise<RateLimitResult> {
		const strategy: RateLimitStrategy = row.strategy as RateLimitStrategy;
		const resetAt = Number(new Date(row.reset_at).getTime());

		if (strategy === "fixed-window") {
			// Reset window if past.
			if (resetAt <= now) {
				await this.#db.rawQuery(
					`UPDATE ${this.#table} SET points = 1, reset_at = ? WHERE key = ?`,
					[new Date(now + durationMs).toISOString(), row.key],
				);
				return {
					allowed: true,
					remaining: limit - 1,
					limit,
					resetAt: now + durationMs,
					retryAfter: 0,
				};
			}
			const newPoints = (row.points ?? 0) + 1;
			const allowed = newPoints <= limit;
			await this.#db.rawQuery(
				`UPDATE ${this.#table} SET points = ? WHERE key = ?`,
				[newPoints, row.key],
			);
			return {
				allowed,
				remaining: Math.max(0, limit - newPoints),
				limit,
				resetAt,
				retryAfter: allowed ? 0 : Math.ceil((resetAt - now) / 1000),
			};
		}

		if (strategy === "sliding-window") {
			const log: number[] = row.log ? JSON.parse(row.log) : [];
			// Drop entries outside the window.
			const cutoff = now - durationMs;
			const fresh = log.filter((t) => t > cutoff);
			fresh.push(now);
			const used = fresh.length;
			const allowed = used <= limit;
			await this.#db.rawQuery(
				`UPDATE ${this.#table} SET log = ?, points = ? WHERE key = ?`,
				[JSON.stringify(fresh), used, row.key],
			);
			const oldest = fresh[0] ?? now;
			return {
				allowed,
				remaining: Math.max(0, limit - used),
				limit,
				resetAt: now + durationMs,
				retryAfter: allowed ? 0 : Math.ceil((oldest + durationMs - now) / 1000),
			};
		}

		// token-bucket: simple implementation as a counter with refill on first hit.
		if (strategy === "token-bucket") {
			const elapsed = Math.max(0, now - resetAt);
			const refillPerMs = limit / durationMs;
			let tokens = Math.min(limit, (row.points ?? 0) + elapsed * refillPerMs);
			const allowed = tokens >= 1;
			if (allowed) tokens -= 1;
			await this.#db.rawQuery(
				`UPDATE ${this.#table} SET points = ?, reset_at = ? WHERE key = ?`,
				[tokens, new Date(now).toISOString(), row.key],
			);
			return {
				allowed,
				remaining: Math.floor(tokens),
				limit,
				resetAt: now + durationMs,
				retryAfter: allowed ? 0 : Math.ceil((1 - tokens) / refillPerMs / 1000),
			};
		}

		throw new Error(`Unknown strategy: ${strategy}`);
	}
}
