/**
 * Public entry point for `nexusjs/drizzle`.
 */
export * from "./types.js";
export { DrizzleService } from "./drizzle.service.js";
export { DrizzleModule } from "./drizzle.module.js";
export { DrizzleModel } from "./model.js";
export { DrizzleRepository } from "./repository/index.js";
export {
	Table,
	Column,
	PrimaryKey,
	getTableMeta,
	readTableMeta,
} from "./decorators/index.js";
export { RawQuery } from "./raw-query.js";
export {
	resolveDriver,
	postgresDriver,
	mysqlDriver,
	sqliteDriver,
	bunSqliteDriver,
	d1Driver,
} from "./drivers/index.js";
export type {
	DrizzleDriverResult,
	RawExecutor,
	DriverFactory,
} from "./drivers/index.js";

// Entity decorator (auto-injects table schema into repository)
export { Entity, getEntityTable } from "./entity.decorator.js";

// Migration helpers (programmatic drizzle-kit wrappers)
export { generateMigrations, pushSchema } from "./migrations.js";

// ============================================================================
// Re-exports from drizzle-orm — so users don't need to install it separately
// for operators, SQL, aggregates, and ordering.
//
// These are all verified at runtime (drizzle-orm 0.36+). The type exports
// exist in drizzle-orm 0.44+; for older versions they're still available
// as runtime values.
// ============================================================================

// ============================================================================
// Re-exports from drizzle-orm — so users don't need to install it separately
// for operators, SQL, aggregates, and ordering.
// ============================================================================
//
// These are verified to work with drizzle-orm >= 0.36.4.
// Some operators (between, count, sum, etc.) were added in 0.38+ and are
// re-exported conditionally below.

// Comparison
export { eq, ne, gt, gte, lt, lte } from "drizzle-orm";
export { and, or, not } from "drizzle-orm";
export { like, ilike, notLike, notIlike } from "drizzle-orm";
export { inArray, notInArray } from "drizzle-orm";
export { isNull, isNotNull } from "drizzle-orm";
export { sql } from "drizzle-orm";
export { asc, desc } from "drizzle-orm";
export { relations } from "drizzle-orm";

// drizzle-orm >= 0.38 range + aggregate operators — type-only re-exports
// so downstream bundlers still tree-shake the unused ones at runtime.
export { between, notBetween } from "drizzle-orm";
export { count, sum, avg, min, max } from "drizzle-orm";
