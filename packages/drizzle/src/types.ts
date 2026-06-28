/**
import { safeGetMeta, safeDefineMeta, safeHasMeta } from "@nexusts/core/di/safe-reflect";
 * `@nexusts/drizzle` — Drizzle ORM integration. Default ORM for NexusTS.
 *
 *   @Module({
 *     imports: [
 *       DrizzleModule.forRoot({
 *         dialect: 'postgres',
 *         url: process.env.DATABASE_URL!,
 *       }),
 *     ],
 *   })
 *
 *   class UserService {
 *     @Inject(DrizzleService.TOKEN) declare private db: DrizzleService;
 *     list() { return this.db.select().from(users).all(); }
 *   }
 *
 * Drivers:
 *   - `postgres`  — node-postgres / postgres.js
 *   - `mysql`     — mysql2
 *   - `sqlite`    — better-sqlite3 / libsql
 *   - `sqlite`— bun:sqlite (built-in)
 *   - `d1`        — Cloudflare D1 (Workers)
 *
 * Lucid gap closure:
 *   - `DrizzleRepository<TTable, TRow>` — repository pattern (model + queries)
 *   - `DrizzleModel`                    — base class for entity models
 *   - `@Table()`, `@Column()`, `@PrimaryKey()` decorators
 *   - `db.migrate(folder)`              — automatic migrations
 *   - `db.transaction(fn)`              — ACID transactions
 *
 * Raw queries:
 *   - `db.raw\`SELECT * FROM users WHERE id = ${id}\`` — parameterized, safe.
 */


// ---------------------------------------------------------------------------
// Dialect
// ---------------------------------------------------------------------------

export type DrizzleDialect =
	| "postgres"
	| "mysql"
	| "sqlite"
	| "d1";

// ---------------------------------------------------------------------------
// Connection options
// ---------------------------------------------------------------------------

export interface PostgresConnectionOptions {
	/** Postgres connection URL. */
	url?: string;
	/** Individual connection fields (alternative to `url`). */
	host?: string;
	port?: number;
	user?: string;
	password?: string;
	database?: string;
	/** SSL mode. */
	ssl?: boolean | "require" | "prefer" | "allow";
	/** Pool settings. */
	pool?: { max?: number; idleTimeoutMs?: number; connectionTimeoutMs?: number };
	/** Schema (default 'public'). */
	schema?: string;
}

export interface MysqlConnectionOptions {
	url?: string;
	host?: string;
	port?: number;
	user?: string;
	password?: string;
	database?: string;
	pool?: { max?: number; idleTimeoutMs?: number; connectionTimeoutMs?: number };
}

export interface SqliteConnectionOptions {
	/** File path or ':memory:'. */
	filename: string;
	/** Optional readonly mode. */
	readonly?: boolean;
}

export interface D1ConnectionOptions {
	/** A Cloudflare D1 binding (D1Database). */
	binding: unknown;
}

export type ConnectionOptions =
	| { dialect: "postgres"; connection: PostgresConnectionOptions }
	| { dialect: "mysql"; connection: MysqlConnectionOptions }
	| { dialect: "sqlite"; connection: SqliteConnectionOptions }
	| { dialect: "d1"; connection: D1ConnectionOptions };

// ---------------------------------------------------------------------------
// Top-level config
// ---------------------------------------------------------------------------

export interface DrizzleConfig {
	dialect: DrizzleDialect;
	/** Connection details. Dialect-specific. */
	connection:
		| PostgresConnectionOptions
		| MysqlConnectionOptions
		| SqliteConnectionOptions
		| D1ConnectionOptions;
	/** Enable query logging. */
	logging?: boolean | ((query: string, params: unknown[]) => void);
	/** Schema name (Postgres only). Default: 'public'. */
	schema?: string;
	/** Migration folder. Used by `db.migrate(folder)`. */
	migrationsFolder?: string;
	/** Whether to auto-run migrations on boot. */
	autoMigrate?: boolean;
}

// ---------------------------------------------------------------------------
// Migrations
// ---------------------------------------------------------------------------

export interface MigrationMeta {
	/** Folder filename (e.g. '0001_init.sql'). */
	filename: string;
	/** Hash of the file content. */
	hash: string;
}

export interface MigrationRecord {
	id: number;
	hash: string;
	/** When this migration was applied. */
	appliedAt: Date;
}

export interface MigrateResult {
	/** Newly-applied migrations. */
	applied: MigrationRecord[];
	/** Total count after this run. */
	total: number;
}

// ---------------------------------------------------------------------------
// Raw query result
// ---------------------------------------------------------------------------

export interface RawQueryResult<T = Record<string, unknown>> {
	rows: T[];
	/** Number of affected rows (UPDATE/DELETE/INSERT). */
	affectedRows: number;
	/** Insert ID (MySQL/SQLite). */
	insertId?: number | string;
}

// ---------------------------------------------------------------------------
// Decorator metadata
// ---------------------------------------------------------------------------

export interface ColumnMetadata {
	name: string;
	type: string;
	nullable: boolean;
	primaryKey: boolean;
	autoIncrement: boolean;
	unique: boolean;
	default?: unknown;
	references?: {
		table: string;
		column: string;
		onDelete?: "cascade" | "set null" | "restrict";
	};
}

export interface TableMetadata {
	name: string;
	columns: Map<string, ColumnMetadata>;
}

/** Internal metadata key. */
export const DRIZZLE_TABLE_META = "nexus:drizzle:table";

export interface DrizzleTransaction {
	/** Run a callback in this transaction. */
	commit<T>(fn: (tx: DrizzleTransaction) => Promise<T>): Promise<T>;
	/** Roll back the transaction. */
	rollback(): Promise<void>;
}
