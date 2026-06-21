/**
 * DrizzleHealthIndicator — runs a `SELECT 1` against the database.
 *
 *   new DrizzleHealthIndicator('database', drizzleService, { timeoutMs: 3000 })
 */
import type { HealthIndicator, HealthIndicatorResult } from "../types.js";

export class DrizzleHealthIndicator implements HealthIndicator {
	readonly name: string;
	#db: { rawQuery<T = unknown>(sql: string, params?: unknown[]): Promise<T[]> };
	#timeoutMs: number;
	/** Optional probe SQL. Default: 'SELECT 1'. */
	#probe: string;

	constructor(
		name: string,
		db: { rawQuery<T = unknown>(sql: string, params?: unknown[]): Promise<T[]> },
		options: { timeoutMs?: number; probe?: string } = {},
	) {
		this.name = name;
		this.#db = db;
		this.#timeoutMs = options.timeoutMs ?? 3000;
		this.#probe = options.probe ?? "SELECT 1";
	}

	async check(): Promise<HealthIndicatorResult> {
		const start = Date.now();
		try {
			const probe = this.#probe;
			await Promise.race([
				this.#db.rawQuery(probe),
				new Promise<never>((_, reject) =>
					setTimeout(
						() => reject(new Error(`probe timed out after ${this.#timeoutMs}ms`)),
						this.#timeoutMs,
					),
				),
			]);
			return {
				status: "up",
				data: { latencyMs: Date.now() - start, probe: this.#probe },
			};
		} catch (err) {
			return {
				status: "down",
				message: err instanceof Error ? err.message : String(err),
				data: { latencyMs: Date.now() - start, probe: this.#probe },
			};
		}
	}
}
