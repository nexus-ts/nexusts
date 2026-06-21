/**
 * Ambient type declarations for the optional `drizzle-orm` peer dep.
 *
 * The `nexus/drizzle` module is designed to work with Drizzle's full
 * type machinery when the user has `drizzle-orm` installed. These
 * stubs let TypeScript resolve the symbols even if the package is
 * not present in the type-check environment.
 */
declare module "drizzle-orm" {
	// ---------------------------------------------------------------------------
	// Database
	// ---------------------------------------------------------------------------
	export interface PgDatabase<TQueryResult extends PgQueryResultHKT, TFullSchema = Record<string, unknown>, TSchema = TFullSchema> {
		select(): PgSelectBuilder<TQueryResult, TSchema>;
		insert<T>(table: T): PgInsertBuilder<T, TQueryResult, TSchema>;
		update<T>(table: T): PgUpdateBuilder<T, TQueryResult, TSchema>;
		delete<T>(table: T): PgDeleteBuilder<T, TQueryResult, TSchema>;
		execute<T = unknown>(query: SQL): Promise<T>;
		transaction<T>(fn: (tx: PgDatabase<TQueryResult, TFullSchema, TSchema>) => Promise<T>): Promise<T>;
	}
	export type PgQueryResultHKT = any;

	export interface MySqlDatabase<TQueryResult extends MySqlQueryResultHKT, TFullSchema = Record<string, unknown>, TSchema = TFullSchema> {
		select(): any;
		insert<T>(table: T): any;
		update<T>(table: T): any;
		delete<T>(table: T): any;
		execute<T = unknown>(query: SQL): Promise<T>;
		transaction<T>(fn: (tx: any) => Promise<T>): Promise<T>;
	}
	export type MySqlQueryResultHKT = any;

	export interface BetterSQLite3Database<TSchema = Record<string, unknown>> {
		select(): any;
		insert<T>(table: T): any;
		update<T>(table: T): any;
		delete<T>(table: T): any;
		execute<T = unknown>(query: SQL): Promise<T>;
		transaction<T>(fn: (tx: any) => Promise<T>): Promise<T>;
	}

	// ---------------------------------------------------------------------------
	// Query builders (loose types — actual safety from Drizzle)
	// ---------------------------------------------------------------------------
	export interface PgSelectBuilder<T, S> {
		from<T>(table: T): PgSelectBase<T, T, S>;
	}
	export interface PgSelectBase<T, R, S> {
		where(filter: SQL): PgSelectBase<T, R, S>;
		limit(n: number): PgSelectBase<T, R, S>;
		offset(n: number): PgSelectBase<T, R, S>;
		orderBy(...cols: any[]): PgSelectBase<T, R, S>;
		all(): Promise<R[]>;
		get(): Promise<R | undefined>;
		then(resolve: (v: R[]) => void, reject?: (e: any) => void): Promise<R[]>;
	}
	export interface PgInsertBuilder<T, R, S> {
		values(v: any): PgInsertBase<T, R, S>;
	}
	export interface PgInsertBase<T, R, S> {
		returning(): PgInsertBase<T, R, S>;
		then(resolve: (v: R[]) => void, reject?: (e: any) => void): Promise<R[]>;
	}
	export interface PgUpdateBuilder<T, R, S> {
		set(v: any): PgUpdateBase<T, R, S>;
	}
	export interface PgUpdateBase<T, R, S> {
		where(filter: SQL): PgUpdateBase<T, R, S>;
		returning(): PgUpdateBase<T, R, S>;
		then(resolve: (v: R[]) => void, reject?: (e: any) => void): Promise<R[]>;
	}
	export interface PgDeleteBuilder<T, R, S> {
		where(filter: SQL): PgDeleteBase<T, R, S>;
	}
	export interface PgDeleteBase<T, R, S> {
		returning(): PgDeleteBase<T, R, S>;
		then(resolve: (v: R[]) => void, reject?: (e: any) => void): Promise<R[]>;
	}

	// ---------------------------------------------------------------------------
	// SQL template tag — the safe raw-query primitive
	// ---------------------------------------------------------------------------
	export interface SQLWrapper {
		getSQL(): SQL;
	}
	export class SQL {
		queryChunks: any[];
		shouldInlineParams?: boolean;
		constructor(chunks: any[]);
		append(chunk: SQL): SQL;
		getSQL(): SQL;
	}
	export function sql<U = unknown>(strings: TemplateStringsArray, ...values: any[]): SQL & SQLWrapper;
	export function sql<U = unknown>(strings: TemplateStringsArray, ...values: any[]): Promise<unknown[]>;

	// ---------------------------------------------------------------------------
	// Operators
	// ---------------------------------------------------------------------------
	export function eq(a: any, b: any): SQL;
	export function ne(a: any, b: any): SQL;
	export function and(...filters: any[]): SQL;
	export function or(...filters: any[]): SQL;
	export function isNull(a: any): SQL;
	export function isNotNull(a: any): SQL;
	export function inArray(a: any, list: any[]): SQL;
	export function notInArray(a: any, list: any[]): SQL;
	export function like(a: any, b: any): SQL;
	export function ilike(a: any, b: any): SQL;
	export function gt(a: any, b: any): SQL;
	export function gte(a: any, b: any): SQL;
	export function lt(a: any, b: any): SQL;
	export function lte(a: any, b: any): SQL;
	export function desc(a: any): SQL;
	export function asc(a: any): SQL;

	// ---------------------------------------------------------------------------
	// Helpers
	// ---------------------------------------------------------------------------
	export function isTable(t: unknown): boolean;
	export function getTableName(table: unknown): string;
	export function getTableColumns(table: unknown): Record<string, any>;
}

// ---------------------------------------------------------------------------
// Dialect-specific entry points
// ---------------------------------------------------------------------------

declare module "drizzle-orm/postgres-js" {
	import type { PgDatabase } from "drizzle-orm";
	export function drizzle(
		connection: any,
		options?: { schema?: any; logger?: boolean | ((q: string, p: unknown[]) => void) },
	): PgDatabase<any, any, any>;
	export const postgres: (url: string, opts?: any) => any;
}

declare module "drizzle-orm/node-postgres" {
	import type { PgDatabase } from "drizzle-orm";
	export function drizzle(
		connection: any,
		options?: { schema?: any; logger?: boolean | ((q: string, p: unknown[]) => void) },
	): PgDatabase<any, any, any>;
	export { Pool } from "pg";
}

declare module "drizzle-orm/mysql2" {
	import type { MySqlDatabase } from "drizzle-orm";
	export function drizzle(
		connection: any,
		options?: { schema?: any; logger?: boolean | ((q: string, p: unknown[]) => void) },
	): MySqlDatabase<any, any, any>;
}

declare module "drizzle-orm/better-sqlite3" {
	import type { BetterSQLite3Database } from "drizzle-orm";
	export function drizzle(
		connection: any,
		options?: { schema?: any; logger?: boolean | ((q: string, p: unknown[]) => void) },
	): BetterSQLite3Database;
}

declare module "drizzle-orm/bun-sqlite" {
	import type { BetterSQLite3Database } from "drizzle-orm";
	export function drizzle(
		connection: any,
		options?: { schema?: any; logger?: boolean | ((q: string, p: unknown[]) => void) },
	): BetterSQLite3Database;
}

declare module "drizzle-orm/d1" {
	import type { BetterSQLite3Database } from "drizzle-orm";
	export function drizzle(
		binding: any,
		options?: { schema?: any; logger?: boolean | ((q: string, p: unknown[]) => void) },
	): BetterSQLite3Database;
}

declare module "drizzle-orm/better-sqlite3/migrator" {
	export function migrate(
		db: any,
		options: { migrationsFolder: string; migrationsTable?: string },
	): Promise<void>;
}

declare module "drizzle-orm/postgres-js/migrator" {
	export function migrate(
		db: any,
		options: { migrationsFolder: string; migrationsTable?: string; migrationsSchema?: string },
	): Promise<void>;
}

declare module "drizzle-orm/node-postgres/migrator" {
	export function migrate(
		db: any,
		options: { migrationsFolder: string; migrationsTable?: string; migrationsSchema?: string },
	): Promise<void>;
}

declare module "drizzle-orm/mysql2/migrator" {
	export function migrate(
		db: any,
		options: { migrationsFolder: string; migrationsTable?: string },
	): Promise<void>;
}
