/**
 * SQLite driver. Uses `better-sqlite3` (synchronous, fast).
 *
 * For edge / Workers, use `bun-sqlite` or `d1` instead.
 */

import type { SqliteConnectionOptions } from "../types.js";
import type { DriverFactory, RawExecutor } from "./base.js";

export const sqliteDriver: DriverFactory = async (config) => {
	const conn = config.connection as SqliteConnectionOptions;
	const drizzleMod = await import("drizzle-orm/better-sqlite3");
	const sqliteMod = await import("better-sqlite3");

	const Database = (sqliteMod as any).Database;
	const sqlite = new Database(conn.filename, { readonly: conn.readonly });

	const db = drizzleMod.drizzle(sqlite, {
		schema: undefined,
		logger: config.logging as any,
	});

	const rawExecutor: RawExecutor = {
		async query<T>(sql: string, params: unknown[] = []) {
			const stmt = sqlite.prepare(sql);
			const isSelect = /^\s*(select|pragma|with)\b/i.test(sql);
			if (isSelect) {
				const rows = stmt.all(...params);
				return { rows: rows as T[], affectedRows: 0 };
			}
			const r = stmt.run(...params);
			return {
				rows: [],
				affectedRows: r.changes,
				insertId: r.lastInsertRowid,
			};
		},
		placeholder: () => "?",
	};

	return {
		db,
		dialect: "sqlite",
		rawExecutor,
		async close() {
			if (sqlite?.close) sqlite.close();
		},
		loadMigrator: async () => {
			const mod = await import("drizzle-orm/better-sqlite3/migrator");
			return async (folder: string) => {
				await mod.migrate(db, { migrationsFolder: folder });
			};
		},
	};
};
