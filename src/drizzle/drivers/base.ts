/**
 * Common driver contract.
 */
import type { DrizzleConfig } from "../types.js";

export interface DrizzleDriverResult {
	/** The Drizzle database instance (dialect-specific). */
	db: any;
	/** Optional migrator (loaded lazily). */
	loadMigrator?: () => Promise<(folder: string) => Promise<void>>;
	/** Close the connection. */
	close?: () => Promise<void>;
	/** Drizzle dialect name. */
	dialect: string;
	/** Native connection used for raw queries. */
	rawExecutor?: RawExecutor;
}

/**
 * A connection that can execute raw SQL. Used by `db.raw\`\`` and
 * `db.rawQuery(...)` to run un-typed but parameterized queries.
 */
export interface RawExecutor {
	/** Execute a parameterized query. */
	query<T = Record<string, unknown>>(
		sql: string,
		params?: unknown[],
	): Promise<{ rows: T[]; affectedRows: number; insertId?: string | number }>;
	/** Quote-style for the dialect (`$1` for postgres, `?` for sqlite/mysql). */
	placeholder(index: number): string;
}

export type DriverFactory = (config: DrizzleConfig) => Promise<DrizzleDriverResult>;
