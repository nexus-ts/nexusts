/**
 * MySQL driver. Uses `mysql2/promise` under the hood.
 */

import type { MysqlConnectionOptions } from "../types.js";
import type { DriverFactory, RawExecutor } from "./base.js";

export const mysqlDriver: DriverFactory = async (config) => {
	const conn = config.connection as MysqlConnectionOptions;
	const drizzleMod = await import("drizzle-orm/mysql2");
	const mysqlMod = await import("mysql2/promise");

	const pool = (mysqlMod as any).createPool({
		host: conn.host,
		port: conn.port,
		user: conn.user,
		password: conn.password,
		database: conn.database,
		connectionLimit: conn.pool?.max ?? 10,
		...conn,
	});

	const db = drizzleMod.drizzle(pool, {
		schema: undefined,
		logger: config.logging as any,
	});

	const rawExecutor: RawExecutor = {
		async query<T>(sql: string, params: unknown[] = []) {
			const [rows] = await pool.query(sql, params as any[]);
			return {
				rows: rows as T[],
				affectedRows: Array.isArray(rows) ? rows.length : 0,
				insertId: undefined,
			};
		},
		placeholder: () => "?",
	};

	return {
		db,
		dialect: "mysql",
		rawExecutor,
		async close() {
			if (pool?.end) await pool.end();
		},
		loadMigrator: async () => {
			const mod = await import("drizzle-orm/mysql2/migrator");
			return (folder: string) => mod.migrate(db, { migrationsFolder: folder });
		},
	};
};
