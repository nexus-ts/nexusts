/**
 * PostgreSQL driver. Two implementations are supported:
 *
 *   - `postgres` (postgres.js) — fast, modern, default.
 *   - `pg` (node-postgres) — classic, used in many existing projects.
 *
 * The first available driver is loaded at boot. The migrator path
 * follows whichever driver was selected.
 */

import type { DrizzleConfig, PostgresConnectionOptions } from "../types.js";
import type {
	DriverFactory,
	DrizzleDriverResult,
	RawExecutor,
} from "./base.js";

export const postgresDriver: DriverFactory = async (config) => {
	const conn = config.connection as PostgresConnectionOptions;
	let driverName: "postgres-js" | "node-postgres" = "postgres-js";
	let db: any;
	let pool: any;

	try {
		const mod = await import("drizzle-orm/postgres-js");
		const postgres =
			(await import("postgres-js" as any).catch(() => null)) ?? null;
		if (!postgres) {
			// Fall back to bundled 'postgres' if available
			throw new Error("postgres-js not installed");
		}
		// We don't have the 'postgres' package types here; cast.
		const sql = (postgres as any).default
			? (postgres as any).default(conn.url ?? thisBuildUrl(conn))
			: (postgres as any)(conn.url ?? thisBuildUrl(conn));
		pool = sql;
		db = mod.drizzle(sql, {
			schema: undefined,
			logger: config.logging as any,
		});
	} catch {
		// Fallback to node-postgres
		driverName = "node-postgres";
		const drizzleMod = await import("drizzle-orm/node-postgres");
		const pgMod = await import("pg");
		const Pool = (pgMod as any).Pool;
		pool = new Pool({
			host: conn.host,
			port: conn.port,
			user: conn.user,
			password: conn.password,
			database: conn.database,
			ssl: conn.ssl,
			max: conn.pool?.max ?? 10,
			idleTimeoutMillis: conn.pool?.idleTimeoutMs,
			connectionTimeoutMillis: conn.pool?.connectionTimeoutMs,
		});
		db = drizzleMod.drizzle(pool, {
			schema: undefined,
			logger: config.logging as any,
		});
	}

	const rawExecutor: RawExecutor = {
		async query<T>(sql: string, params: unknown[] = []) {
			if (driverName === "postgres-js") {
				const r = await pool.unsafe(sql, params as any[]);
				return { rows: r as T[], affectedRows: r.length, insertId: undefined };
			} else {
				const r = await pool.query(sql, params);
				return {
					rows: r.rows as T[],
					affectedRows: r.rowCount ?? 0,
					insertId: undefined,
				};
			}
		},
		placeholder: (i) => `$${i}`,
	};

	return {
		db,
		dialect: "postgres",
		rawExecutor,
		async close() {
			if (pool?.end) await pool.end();
		},
		loadMigrator: async () => {
			if (driverName === "postgres-js") {
				const mod = await import("drizzle-orm/postgres-js/migrator");
				return (folder: string) =>
					mod.migrate(db, {
						migrationsFolder: folder,
						migrationsSchema: config.schema,
					});
			}
			const mod = await import("drizzle-orm/node-postgres/migrator");
			return (folder: string) =>
				mod.migrate(db, {
					migrationsFolder: folder,
					migrationsSchema: config.schema,
				});
		},
	};
};

function thisBuildUrl(c: PostgresConnectionOptions): string {
	const user = encodeURIComponent(c.user ?? "");
	const pass = encodeURIComponent(c.password ?? "");
	const host = c.host ?? "localhost";
	const port = c.port ?? 5432;
	const db = c.database ?? "postgres";
	return `postgres://${user}:${pass}@${host}:${port}/${db}`;
}
