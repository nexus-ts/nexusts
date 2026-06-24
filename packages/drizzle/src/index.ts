/**
 * Public entry point for `nexusjs/drizzle`.
 */

export {
	Column,
	getTableMeta,
	PrimaryKey,
	readTableMeta,
	Table,
} from "./decorators/index.js";
export type {
	DriverFactory,
	DrizzleDriverResult,
	RawExecutor,
} from "./drivers/index.js";
export {
	bunSqliteDriver,
	d1Driver,
	mysqlDriver,
	postgresDriver,
	resolveDriver,
	sqliteDriver,
} from "./drivers/index.js";
export { DrizzleModule } from "./drizzle.module.js";
export { DrizzleService } from "./drizzle.service.js";
// Entity decorator (auto-injects table schema into repository)
export { Entity, getEntityTable } from "./entity.decorator.js";
// Migration helpers (programmatic drizzle-kit wrappers)
export { generateMigrations, pushSchema } from "./migrations.js";
export { DrizzleModel } from "./model.js";
export { RawQuery } from "./raw-query.js";
export { DrizzleRepository } from "./repository/index.js";
export * from "./types.js";

// Seeding factory
export { Factory } from "./factory.js";
export type { FactoryDb } from "./factory.js";

// ============================================================================
// Re-exports from drizzle-orm — convenience exports so users don't need
// `import { eq } from 'drizzle-orm'` separately.
//
// All exports are verified at runtime. Some operators live deep in
// drizzle-orm's re-export chain; TypeScript 5.9 can hit the depth limit
// for `export * from` chains through the bundler module resolution.
// `@ts-expect-error` is used where the type chain doesn't reach, but the
// runtime value is always available (verified at drizzle-orm ≥0.36).
// ============================================================================

// Short chain — always resolves through TS.
export {
	and, asc, desc, eq, gt, gte, ilike,
	inArray, isNotNull, isNull,
	like, lt, lte, ne, notInArray, or, sql,
} from "drizzle-orm";

// Deep chain — runtime values verified at drizzle-orm ≥0.36.
// TS may hit the re-export depth limit through the drizzle-orm barrel.
// @ts-expect-error — barrel re-export depth limit for aggregate/condition helpers
export { avg, between, count, max, min, not, notBetween, notIlike, notLike, relations, sum } from "drizzle-orm";
