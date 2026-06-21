/**
 * SQL-safe raw query builder.
 *
 * Wraps Drizzle's `sql` template tag with:
 *   - Multi-dialect placeholder normalization (`$1` for postgres, `?` for sqlite/mysql)
 *   - Type-safe `execute<T>()`, `first<T>()`, `all<T>()` methods
 *   - Optional logging via the parent `DrizzleService`
 *   - Automatic parameter binding (Drizzle handles escaping)
 *
 * **Why this is SQL-injection safe:**
 *   - Drizzle's `sql\`...\`` parses the template literal into a parameterized
 *     statement. Every interpolated `${value}` becomes a bound parameter
 *     (`$1`, `?`, ...), not a string concatenation.
 *   - The values are sent separately from the SQL text — the database
 *     driver handles the protocol-level separation.
 *   - Identifier interpolation uses `sql.raw(...)` which is the *only*
 *     place where you must be careful (it's deliberately not allowed here).
 *
 *   const q = db.raw`SELECT * FROM users WHERE id = ${userId}`;
 *   const rows = await q.all<User>();
 */
import type { RawExecutor } from "./drivers/base.js";
import type { RawQueryResult } from "./types.js";

export class RawQuery {
	private sqlText: string;
	private params: unknown[];
	private executor: RawExecutor;
	private logger?: (q: string, p: unknown[]) => void;

	constructor(sqlText: string, params: unknown[], executor: RawExecutor, logger?: (q: string, p: unknown[]) => void) {
		this.sqlText = sqlText;
		this.params = params;
		this.executor = executor;
		this.logger = logger;
	}

	/** Execute and return all rows. */
	async all<T = Record<string, unknown>>(): Promise<T[]> {
		const r = await this.run<T>();
		return r.rows;
	}

	/** Execute and return the first row, or undefined. */
	async first<T = Record<string, unknown>>(): Promise<T | undefined> {
		const r = await this.run<T>();
		return r.rows[0];
	}

	/** Execute and return the full result (rows + affectedRows + insertId). */
	async execute<T = Record<string, unknown>>(): Promise<RawQueryResult<T>> {
		return this.run<T>();
	}

	/** Inspect the generated SQL (after dialect placeholders are normalized). */
	toSQL(): string {
		return this.sqlText;
	}

	getParameters(): unknown[] {
		return [...this.params];
	}

	private async run<T>(): Promise<RawQueryResult<T>> {
		if (this.logger) this.logger(this.sqlText, this.params);
		const r = await this.executor.query<T>(this.sqlText, this.params);
		return {
			rows: r.rows,
			affectedRows: r.affectedRows,
			insertId: r.insertId,
		};
	}
}
