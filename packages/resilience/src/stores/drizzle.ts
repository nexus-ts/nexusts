import type { CircuitSnapshot, ResilienceStore } from "../types.js";

export interface DrizzleResilienceStoreOptions {
	/** Table name. Default: `"nexus_circuit_state"`. */
	tableName?: string;
}

/**
 * Cross-pod circuit state backed by a Drizzle-connected database.
 * Accepts any `DrizzleService`-compatible object.
 *
 *   const store = new DrizzleResilienceStore(db);
 *   ResilienceModule.forRoot({ store });
 *
 * Creates `nexus_circuit_state` automatically on first use.
 */
export class DrizzleResilienceStore implements ResilienceStore {
	#db: any;
	#table: string;
	#ready: Promise<void>;

	constructor(db: any, opts: DrizzleResilienceStoreOptions = {}) {
		this.#db = db;
		this.#table = opts.tableName ?? "nexus_circuit_state";
		this.#ready = this.#ensureTable();
	}

	async #ensureTable(): Promise<void> {
		await this.#db.rawQuery(
			`CREATE TABLE IF NOT EXISTS ${this.#table} (
				name        TEXT    PRIMARY KEY,
				state       TEXT    NOT NULL DEFAULT 'closed',
				opened_at   INTEGER NOT NULL DEFAULT 0,
				failures    INTEGER NOT NULL DEFAULT 0,
				successes   INTEGER NOT NULL DEFAULT 0,
				updated_at  INTEGER NOT NULL DEFAULT 0
			)`,
			[],
		);
	}

	async getSnapshot(name: string): Promise<CircuitSnapshot | null> {
		await this.#ready;
		const rows = (await this.#db.rawQuery(
			`SELECT state, opened_at, failures, successes, updated_at FROM ${this.#table} WHERE name = ?`,
			[name],
		)) as Array<{
			state: string;
			opened_at: number;
			failures: number;
			successes: number;
			updated_at: number;
		}>;
		const row = rows[0];
		if (!row) return null;
		return {
			state: row.state as CircuitSnapshot["state"],
			openedAt: row.opened_at,
			failures: row.failures,
			successes: row.successes,
			updatedAt: row.updated_at,
		};
	}

	async saveSnapshot(name: string, snapshot: CircuitSnapshot): Promise<void> {
		await this.#ready;
		await this.#db.rawQuery(
			`INSERT INTO ${this.#table} (name, state, opened_at, failures, successes, updated_at)
			 VALUES (?, ?, ?, ?, ?, ?)
			 ON CONFLICT(name) DO UPDATE SET
			   state      = excluded.state,
			   opened_at  = excluded.opened_at,
			   failures   = excluded.failures,
			   successes  = excluded.successes,
			   updated_at = excluded.updated_at`,
			[name, snapshot.state, snapshot.openedAt, snapshot.failures, snapshot.successes, snapshot.updatedAt],
		);
	}
}
