/**
 * `KyselyService` — typed SQL query builder service.
 *
 * Wraps a Kysely instance with:
 *   - `selectFrom()`, `insertInto()`, `updateTable()`, `deleteFrom()` — passthroughs
 *   - `transaction(fn)` — ACID transaction support via Kysely
 *   - `sql\`SELECT ...\`` — Kysely's raw SQL template tag
 *   - `schema` — Kysely schema builder for DDL
 *   - `migrate()` — run schema migrations via Kysely Migrator
 *   - `close()` — release the connection
 *
 * Usage:
 *   import { SqliteDialect } from "kysely";
 *   import Database from "better-sqlite3";
 *
 *   interface DB {
 *     users: { id: Generated<number>; email: string; name: string };
 *   }
 *
 *   const db = new KyselyService<DB>({
 *     dialect: new SqliteDialect({ database: new Database(":memory:") }),
 *   });
 *
 *   const rows = await db.selectFrom("users")
 *     .where("email", "=", "a@b.com")
 *     .selectAll()
 *     .execute();
 */
import type { KyselyConfig, Kysely, Transaction } from "kysely";
import { Injectable } from "@nexusts/core";
import type { KyselyServiceOptions, MigrateResult, DatabaseSchema } from "./types.js";

@Injectable()
export class KyselyService<DB extends DatabaseSchema = any> {
  /** DI token. */
  static readonly TOKEN = Symbol.for("nexus:KyselyService");

  /** The underlying Kysely instance. */
  private _db: Kysely<DB> | null = null;
  private _config: KyselyConfig;
  private _options: KyselyServiceOptions;
  private _opened = false;
  private _logger: ((query: string, params: unknown[]) => void) | null = null;

  constructor(
    config: KyselyConfig,
    options?: KyselyServiceOptions,
  ) {
    this._config = config;
    this._options = options ?? {};

    if (options?.logging) {
      const log = options.logging;
      this._logger = typeof log === "function" ? log : (q, p) => {
        const trimmed = q.replace(/\s+/g, " ").trim();
        if (p.length === 0) console.log(`[kysely] ${trimmed}`);
        else console.log(`[kysely] ${trimmed}  -- params: ${JSON.stringify(p)}`);
      };
    }

    // Auto-open synchronously when Kysely is already available (e.g.
    // from an in-memory or bun:sqlite dialect). The dynamic import
    // will succeed instantly if the package is in node_modules.
    this._autoOpenSync();
  }

  /** Try to open synchronously — useful for bun:sqlite dialects. */
  private _autoOpenSync(): void {
    try {
      // We need to dynamically require "kysely" here. We use require
      // (not import) because we're in a synchronous context.
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const mod = require("kysely");
      if (!mod?.Kysely) return;
      const { Kysely } = mod;

      const mergedConfig: any = { ...this._config };
      if (this._logger) {
        mergedConfig.log = (event: any) => {
          if (event.level === "query" && event.query) {
            this._logger?.(event.query.sql, event.query.parameters as unknown[]);
          }
        };
      }

      this._db = new Kysely<DB>(mergedConfig);
      this._opened = true;
    } catch {
      // If require fails (e.g. kysely is not installed yet, or the
      // module is ESM-only), fall through to lazy async open().
    }
  }

  /** Lazy-initialize the Kysely instance. */
  async open(): Promise<void> {
    if (this._opened) return;

    // Dynamically import Kysely — it's an optional peer dep.
    const { Kysely } = await loadKysely();

    // Build config with optional logging via Kysely's built-in log option.
    const mergedConfig: any = { ...this._config };
    if (this._logger) {
      mergedConfig.log = (event: any) => {
        if (event.level === "query" && event.query) {
          this._logger?.(event.query.sql, event.query.parameters as unknown[]);
        }
      };
    }

    this._db = new Kysely<DB>(mergedConfig);
    this._opened = true;

    // Auto-migrate if configured.
    if (this._options.migrations?.autoMigrate) {
      await this.migrate();
    }
  }

  /**
   * The underlying Kysely instance. Use this for direct Kysely API access.
   * Opens lazily on first access if not already opened.
   */
  async getDb(): Promise<Kysely<DB>> {
    if (!this._opened) await this.open();
    return this._db!;
  }

  /**
   * Synchronous access to Kysely — throws if not opened.
   * Used internally when we know open() has been called.
   */
  private get db(): Kysely<DB> {
    if (!this._db) {
      throw new Error("[kysely] service not opened. Call open() or await getDb() first.");
    }
    return this._db;
  }

  // ===========================================================================
  // Query API (passthrough to Kysely)
  // ===========================================================================

  /**
   * Start a SELECT query for the given table.
   *
   *   const users = await db.selectFrom("users")
   *     .where("id", "=", 42)
   *     .selectAll()
   *     .execute();
   */
  selectFrom<TB extends keyof DB & string>(table: TB) {
    this.ensureOpen();
    return this.db.selectFrom(table);
  }

  /**
   * Start an INSERT INTO query.
   *
   *   await db.insertInto("users")
   *     .values({ email: "a@b.com", name: "Alice" })
   *     .execute();
   */
  insertInto<TB extends keyof DB & string>(table: TB) {
    this.ensureOpen();
    return this.db.insertInto(table);
  }

  /**
   * Start an UPDATE query for the given table.
   *
   *   await db.updateTable("users")
   *     .set({ name: "Bob" })
   *     .where("id", "=", 42)
   *     .execute();
   */
  updateTable<TB extends keyof DB & string>(table: TB) {
    this.ensureOpen();
    return this.db.updateTable(table);
  }

  /**
   * Start a DELETE FROM query.
   *
   *   await db.deleteFrom("users")
   *     .where("id", "=", 42)
   *     .execute();
   */
  deleteFrom<TB extends keyof DB & string>(table: TB) {
    this.ensureOpen();
    return this.db.deleteFrom(table);
  }

  // ===========================================================================
  // Schema API
  // ===========================================================================

  /**
   * Access Kysely's schema builder for DDL operations.
   *
   *   await db.schema
   *     .createTable("users")
   *     .addColumn("id", "integer", (col) => col.primaryKey().autoIncrement())
   *     .addColumn("email", "varchar(255)", (col) => col.notNull().unique())
   *     .execute();
   */
  get schema() {
    this.ensureOpen();
    return this.db.schema;
  }

  // ===========================================================================
  // Raw SQL
  // ===========================================================================

  /**
   * Execute a raw SQL query via Kysely's sql template tag.
   *
   *   const { rows } = await db.executeRaw(
   *     sql\`SELECT * FROM users WHERE email = ${email}\`
   *   );
   */
  async executeRaw<R = any>(query: any): Promise<R[]> {
    this.ensureOpen();
    const result = await query.execute(this.db);
    return result.rows as R[];
  }

  // ===========================================================================
  // Transactions
  // ===========================================================================

  /**
   * Run a callback inside a Kysely transaction.
   *
   *   const result = await db.transaction(async (trx) => {
   *     const user = await trx.insertInto("users")
   *       .values({ email: "a@b.com", name: "Alice" })
   *       .returningAll()
   *       .executeTakeFirst();
   *     return user;
   *   });
   */
  async transaction<T>(fn: (trx: KyselyTransaction<DB>) => Promise<T>): Promise<T> {
    this.ensureOpen();
    return this.db.transaction().execute(async (trx: Transaction<DB>) => {
      const txWrapper: KyselyTransaction<DB> = {
        selectFrom: (table) => trx.selectFrom(table),
        insertInto: (table) => trx.insertInto(table),
        updateTable: (table) => trx.updateTable(table),
        deleteFrom: (table) => trx.deleteFrom(table),
        executeRaw: async (query) => {
          const result = await query.execute(trx);
          return result.rows as any[];
        },
      };
      return fn(txWrapper);
    });
  }

  // ===========================================================================
  // Migrations
  // ===========================================================================

  /**
   * Run all pending migrations. Requires `migrations.provider` in config.
   *
   *   const result = await db.migrate();
   *   console.log(`Applied ${result.applied.length} migrations`);
   */
  async migrate(): Promise<MigrateResult> {
    if (!this._options.migrations?.provider) {
      throw new Error(
        "[kysely] No migration provider configured. " +
        "Pass `migrations: { provider: new FileMigrationProvider(...) }` to KyselyModule.forRoot().",
      );
    }

    this.ensureOpen();

    const { Migrator } = await importKysely();
    const migrator = new Migrator({
      db: this.db,
      provider: this._options.migrations.provider,
      ...(this._options.migrations.tableName ? { migrationTableName: this._options.migrations.tableName } : {}),
    });

    const { results, error } = await migrator.migrateToLatest();

    if (error) {
      throw error;
    }

    const applied = (results ?? [])
      .filter((r: any) => r.status === "Success" || r.status === "MigratedAbove")
      .map((r: any) => ({
        name: r.migrationName ?? String(r.name ?? ""),
        appliedAt: new Date(),
      }));

    const errors = (results ?? [])
      .filter((r: any) => r.status === "Error")
      .map((r: any) => ({
        name: r.migrationName ?? String(r.name ?? ""),
        error: r.error ?? new Error("Unknown migration error"),
      }));

    return {
      applied,
      total: (results ?? []).length,
      errors,
    };
  }

  // ===========================================================================
  // Lifecycle
  // ===========================================================================

  /** Close the database connection. */
  async close(): Promise<void> {
    if (this._db) {
      await this._db.destroy();
    }
    this._db = null;
    this._opened = false;
  }

  // ===========================================================================
  // Internal
  // ===========================================================================

  private ensureOpen(): void {
    if (!this._db) {
      throw new Error("[kysely] service not opened. Call open() or await getDb() first.");
    }
  }
}

/**
 * Transaction-scoped query builder.
 * Provides a subset of KyselyService methods within a transaction.
 */
export interface KyselyTransaction<DB extends DatabaseSchema = any> {
  selectFrom<TB extends keyof DB & string>(table: TB): ReturnType<Kysely<DB>["selectFrom"]>;
  insertInto<TB extends keyof DB & string>(table: TB): ReturnType<Kysely<DB>["insertInto"]>;
  updateTable<TB extends keyof DB & string>(table: TB): ReturnType<Kysely<DB>["updateTable"]>;
  deleteFrom<TB extends keyof DB & string>(table: TB): ReturnType<Kysely<DB>["deleteFrom"]>;
  executeRaw<R = any>(query: any): Promise<R[]>;
}

// ===========================================================================
// Lazy imports (optional peer dependencies)
// ===========================================================================

let _kyselyMod: any = null;
let _kyselyAttempted = false;

async function loadKysely(): Promise<{ Kysely: any }> {
  if (_kyselyMod) return _kyselyMod;
  if (_kyselyAttempted) {
    throw new Error(
      "[@nexusts/kysely] `kysely` failed to load. Install with `bun add kysely`.",
    );
  }
  _kyselyAttempted = true;
  try {
    const mod = await import("kysely");
    _kyselyMod = { Kysely: mod.Kysely };
    return _kyselyMod;
  } catch (err) {
    throw new Error(
      "[@nexusts/kysely] `kysely` is required. Install with `bun add kysely`.\n" +
      "Original error: " + (err as Error).message,
    );
  }
}

let _kyselyFullMod: any = null;
async function importKysely(): Promise<any> {
  if (_kyselyFullMod) return _kyselyFullMod;
  try {
    _kyselyFullMod = await import("kysely");
    return _kyselyFullMod;
  } catch (err) {
    throw new Error(
      "[@nexusts/kysely] `kysely` is required. Install with `bun add kysely`.\n" +
      "Original error: " + (err as Error).message,
    );
  }
}
