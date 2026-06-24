/**
 * Drivers barrel — exports a `resolveDriver` that picks the right one
 * based on `config.dialect`.
 */
import type { DrizzleConfig } from "../types.js";
import type { DrizzleDriverResult } from "./base.js";
import { bunSqliteDriver } from "./bun-sqlite.js";
import { d1Driver } from "./d1.js";
import { mysqlDriver } from "./mysql.js";
import { postgresDriver } from "./postgres.js";
import { sqliteDriver } from "./sqlite.js";

export type {
	DriverFactory,
	DrizzleDriverResult,
	RawExecutor,
} from "./base.js";
export { bunSqliteDriver } from "./bun-sqlite.js";
export { d1Driver } from "./d1.js";
export { mysqlDriver } from "./mysql.js";
export { postgresDriver } from "./postgres.js";
export { sqliteDriver } from "./sqlite.js";

export async function resolveDriver(
	config: DrizzleConfig,
): Promise<DrizzleDriverResult> {
	switch (config.dialect) {
		case "postgres":
			return postgresDriver(config);
		case "mysql":
			return mysqlDriver(config);
		case "sqlite":
			return sqliteDriver(config);
		case "bun-sqlite":
			return bunSqliteDriver(config);
		case "d1":
			return d1Driver(config);
	}
}
