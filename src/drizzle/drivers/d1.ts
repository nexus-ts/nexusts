/**
 * Cloudflare D1 driver. Used inside Workers — the binding is passed in
 * from the Worker's env.
 */
import type { DriverFactory, RawExecutor } from "./base.js";

export const d1Driver: DriverFactory = async (config) => {
	const conn = config.connection as { binding: unknown };
	if (!conn.binding) {
		throw new Error("d1 driver requires `connection.binding` (a D1Database)");
	}
	const drizzleMod = await import("drizzle-orm/d1");

	const db = drizzleMod.drizzle(conn.binding as any, {
		schema: undefined,
		logger: config.logging,
	});

	const binding = conn.binding as any;

	const rawExecutor: RawExecutor = {
		async query<T>(sql: string, params: unknown[] = []) {
			// D1 binding: prepared/statement API.
			const stmt = binding.prepare(sql);
			const lower = sql.trim().toLowerCase();
			if (lower.startsWith("select") || lower.startsWith("pragma") || lower.startsWith("with")) {
				const r = await stmt.bind(...params).all();
				return { rows: (r.results ?? []) as T[], affectedRows: (r.results ?? []).length };
			}
			const r = await stmt.bind(...params).run();
			return {
				rows: [],
				affectedRows: r.meta?.changes ?? 0,
				insertId: r.meta?.last_row_id,
			};
		},
		placeholder: () => "?",
	};

	return {
		db,
		dialect: "d1",
		rawExecutor,
		// D1 binding is owned by the Worker runtime.
		close: undefined,
		loadMigrator: undefined,
	};
};
