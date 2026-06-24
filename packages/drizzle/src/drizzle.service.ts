/**
 * `DrizzleService` — the main entry point for database access.
 *
 * Wraps a Drizzle ORM client with:
 *   - `select()`, `insert()`, `update()`, `delete()` — passthroughs
 *   - `transaction(fn)` — ACID transaction support
 *   - `raw\`SELECT ...\`` — SQL-injection-safe raw queries
 *   - `migrate(folder)` — run schema migrations
 *   - `close()` — release the connection
 *
 *   const db = new DrizzleService({ dialect: 'bun-sqlite', connection: { filename: ':memory:' } });
 *   await db.open();
 *
 *   const users = pgTable('users', { id: serial('id').primaryKey(), email: text('email') });
 *   const rows = await db.select().from(users).all();
 */
import { Inject, Injectable } from "@nexusts/core";
import { type RawExecutor, resolveDriver } from "./drivers/index.js";
import { RawQuery } from "./raw-query.js";
import type { DrizzleConfig, MigrateResult, MigrationRecord } from "./types.js";

@Injectable()
export class DrizzleService {
	/** DI token. */
	static readonly TOKEN = Symbol.for("nexus:DrizzleService");

	driver: DrizzleDriverHandle | null = null;
	private _client: any = null;
	private _rawExecutor: RawExecutor | null = null;
	private _config: DrizzleConfig;
	private _opened = false;
	private _migratorFn: ((folder: string) => Promise<void>) | null = null;
	private _logger: ((q: string, p: unknown[]) => void) | null = null;
	private _migrationsTable = "__nexus_migrations";

	constructor(@Inject("DRIZZLE_CONFIG") config: DrizzleConfig) {
		this._config = config;
		// Auto-open synchronously so the client getter works
		// immediately. For bun-sqlite the Database constructor
		// is synchronous; for other drivers the first request
		// will fire the async open() and cache the result.
		if (config.dialect === "bun-sqlite" || (config.connection as any)?.filename) {
			// Synchronous path for bun-sqlite.
			this.openSync();
		}
	}

	/** Synchronous open for bun-sqlite. */
	private openSync(): void {
		try {
			const conn = this._config.connection as any;
			const { Database } = require("bun:sqlite" as any);
			const sqlite = new Database((conn as any)?.filename ?? (this._config as any).url ?? "app.db");
			const { drizzle } = require("drizzle-orm/bun-sqlite" as any);
			this._client = drizzle(sqlite, { logger: this._config.logging });
			this._rawExecutor = {
				query: async (sql: string, params: unknown[] = []) => {
					const stmt = sqlite.prepare(sql);
					const isSelect = /^\s*(select|pragma|with)\b/i.test(sql);
					if (isSelect) {
						const rows = stmt.all(...params);
						return { rows: rows as any[], affectedRows: 0 };
					}
					const r = stmt.run(...params);
					return {
						rows: [],
						affectedRows: Number(r.changes ?? 0),
						insertId: r.lastInsertRowid as number | string,
					};
				},
				placeholder: () => "?",
			};
			this.driver = {
				db: this._client,
				dialect: "bun-sqlite",
			} as any;
			this._opened = true;
		} catch {
			// Fall through — the async open() will handle it.
		}
	}

	/** Lazy-open the connection. */
	async open(): Promise<void> {
		if (this._opened) return;
		const drv = await resolveDriver(this._config);
		this.driver = drv;
		this._client = drv.db;
		this._rawExecutor = drv.rawExecutor ?? null;
		if (this._config.logging) {
			this._logger =
				typeof this._config.logging === "function"
					? this._config.logging
					: (q, p) => {
							const trimmed = q.replace(/\s+/g, " ").trim();
							if (p.length === 0) console.log(`[drizzle] ${trimmed}`);
							else console.log(`[drizzle] ${trimmed}  -- params: ${JSON.stringify(p)}`);
						};
		}
		if (drv.loadMigrator) {
			this._migratorFn = await drv.loadMigrator();
		}
		if (this._config.autoMigrate && this._config.migrationsFolder && this._migratorFn) {
			await this.migrate(this._config.migrationsFolder);
		}
		this._opened = true;
	}

	/** The raw Drizzle client. Use this for type-safe queries. */
	get client(): any {
		this._assertOpen();
		return this._client;
	}

	/** Configured dialect. */
	get dialect(): string {
		return this._config.dialect;
	}

	// ===========================================================================
	// Query API (passthrough to Drizzle)
	// ===========================================================================
	//
	// Generic so that call sites get full type inference for
	// `select({ ... }).from(table)`, etc. The return type is whatever
	// Drizzle's QueryBuilder produces — usually a chainable builder
	// that ends in `.all()`, `.get()`, or `.run()`.

	select<T = unknown>(): T {
		return this.client.select() as T;
	}

	insert<T = unknown>(table: any): T {
		return this.client.insert(table) as T;
	}

	update<T = unknown>(table: any): T {
		return this.client.update(table) as T;
	}

	delete<T = unknown>(table: any): T {
		return this.client.delete(table) as T;
	}

	// ===========================================================================
	// Transactions
	// ===========================================================================

	async transaction<T>(fn: (tx: DrizzleService) => Promise<T>): Promise<T> {
		this._assertOpen();
		return this.client.transaction(async (tx: any) => {
			const txService = Object.create(this) as DrizzleService;
			Object.defineProperty(txService, "_client", { value: tx, writable: false });
			return fn(txService);
		});
	}

	// ===========================================================================
	// Raw SQL (SQL-injection safe)
	// ===========================================================================

	/**
	 * Tagged-template raw query.
	 *
	 *   const id = "user-42";
	 *   const rows = await db.raw`SELECT * FROM users WHERE id = ${id}`.all();
	 *
	 * Interpolation values are sent as bound parameters — never
	 * concatenated into the SQL text. This is the same primitive as
	 * Drizzle's `sql\`...\`` but exposed through the service so logging
	 * and dialect placeholders are handled consistently.
	 */
	raw(strings: TemplateStringsArray, ...values: unknown[]): RawQuery {
		if (!this._rawExecutor) {
			throw new Error("[drizzle] driver does not support raw queries");
		}
		const text = buildSqlText(strings);
		return new RawQuery(text, values, this._rawExecutor, this._logger ?? undefined);
	}

	/** Direct parameterized query (no template tag). */
	async rawQuery<T = Record<string, unknown>>(
		sql: string,
		params: unknown[] = [],
	): Promise<T[]> {
		if (!this._rawExecutor) {
			throw new Error("[drizzle] driver does not support raw queries");
		}
		const r = new RawQuery(sql, params, this._rawExecutor, this._logger ?? undefined);
		return r.all<T>();
	}

	// ===========================================================================
	// Migrations
	// ===========================================================================

	async migrate(folder: string): Promise<MigrateResult> {
		if (!this._migratorFn) {
			throw new Error(
				`[drizzle] this dialect (${this._config.dialect}) does not ship a built-in migrator. ` +
					`Run migrations manually using drizzle-kit.`,
			);
		}
		await this._migratorFn(folder);
		const applied = await this.appliedMigrations();
		return { applied, total: applied.length };
	}

	async appliedMigrations(): Promise<MigrationRecord[]> {
		try {
			const r = await this.rawQuery<{ id: number; hash: string; created_at: string | number }>(
				`SELECT id, hash, created_at FROM ${this._migrationsTable} ORDER BY id`,
			);
			return r.map((row) => ({
				id: Number(row.id),
				hash: String(row.hash),
				appliedAt: parseTimestamp(row.created_at),
			}));
		} catch {
			return [];
		}
	}

	// ===========================================================================
	// Lifecycle
	// ===========================================================================

	async close(): Promise<void> {
		if (!this._opened) return;
		if (this.driver?.close) await this.driver.close();
		this._opened = false;
		this._client = null;
		this._rawExecutor = null;
	}

	attachLogger(fn: (q: string, p: unknown[]) => void): void {
		this._logger = fn;
	}

	// ===========================================================================
	// Internal
	// ===========================================================================

	private _assertOpen(): void {
		if (!this._opened) {
			throw new Error("[drizzle] service not opened. Call open() first.");
		}
	}
}

/** Internal: an open driver. */
type DrizzleDriverHandle = Awaited<ReturnType<typeof resolveDriver>>;

/** Build SQL text with `?` placeholders. */
function buildSqlText(strings: TemplateStringsArray): string {
	let s = strings[0] ?? "";
	for (let i = 0; i < strings.length - 1; i++) {
		s += "?";
		s += strings[i + 1];
	}
	return s;
}

function parseTimestamp(v: string | number | Date): Date {
	if (v instanceof Date) return v;
	if (typeof v === "number") return new Date(v);
	return new Date(String(v));
}
