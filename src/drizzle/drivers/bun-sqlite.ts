/**
 * Bun's native `bun:sqlite` driver. Zero deps, fastest possible SQLite.
 */
import type { DriverFactory, RawExecutor } from "./base.js";
import type { SqliteConnectionOptions } from "../types.js";

export const bunSqliteDriver: DriverFactory = async (config) => {
	const conn = config.connection as SqliteConnectionOptions;
	const drizzleMod = await import("drizzle-orm/bun-sqlite");
	const { Database } = await import("bun:sqlite" as any);

	const sqlite = new Database(conn.filename);

	const db = drizzleMod.drizzle(sqlite, {
		schema: undefined,
		logger: config.logging,
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
				affectedRows: Number(r.changes ?? 0),
				insertId: r.lastInsertRowid as number | string,
			};
		},
		placeholder: () => "?",
	};

	return {
		db,
		dialect: "bun-sqlite",
		rawExecutor,
		async close() {
			if (sqlite?.close) sqlite.close();
		},
		// bun-sqlite ships with the same migrator as better-sqlite3.
		loadMigrator: async () => {
			const mod = await import("drizzle-orm/better-sqlite3/migrator");
			return (folder: string) => mod.migrate(db, { migrationsFolder: folder });
		},
	};
};
