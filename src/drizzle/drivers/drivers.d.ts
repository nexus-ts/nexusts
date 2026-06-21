/**
 * Ambient type declarations for optional driver peer dependencies.
 *
 * `drizzle-orm` is the required peer dep for `nexus/drizzle`. The
 * concrete database drivers below are optional — install only the
 * ones you need.
 */
declare module "pg" {
	export class Pool {
		constructor(config: any);
		query<T = any>(sql: string, params?: any[]): Promise<{ rows: T[]; rowCount: number }>;
		end(): Promise<void>;
	}
	export class Client {
		constructor(config: any);
		connect(): Promise<void>;
		query<T = any>(sql: string, params?: any[]): Promise<{ rows: T[]; rowCount: number }>;
		end(): Promise<void>;
	}
}

declare module "mysql2/promise" {
	export function createPool(config: any): {
		query<T = any>(sql: string, params?: any[]): Promise<[T, any]>;
		end(): Promise<void>;
	};
	export function createConnection(config: any): any;
}

declare module "better-sqlite3" {
	export interface RunResult {
		changes: number;
		lastInsertRowid: number | bigint;
	}
	export class Database {
		constructor(filename: string, options?: any);
		prepare(sql: string): Statement;
		exec(sql: string): void;
		close(): void;
		pragma(s: string): any;
		transaction<T>(fn: (...args: any[]) => T): (...args: any[]) => T;
	}
	export class Statement {
		run(...params: any[]): RunResult;
		all(...params: any[]): any[];
		get(...params: any[]): any;
		values(...params: any[]): any[];
		iterate(...params: any[]): IterableIterator<any>;
	}
}

declare module "postgres-js" {
	interface Sql<T = any> {
		unsafe<T = any>(query: string, params?: any[]): Promise<T[]>;
		query<T = any>(strings: TemplateStringsArray, ...params: any[]): Promise<T[]>;
		end(): Promise<void>;
	}
	function postgres(url: string, options?: any): Sql;
	export default postgres;
}