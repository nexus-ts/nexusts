/**
 * Validation schema helpers for Drizzle ORM tables.
 *
 * Generates Zod schemas from Drizzle table definitions for use with
 * NexusTS's `@Validate()` decorator.
 *
 * @example
 * ```ts
 * import { z } from "zod";
 * import { createInsertSchema, createSelectSchema } from "nexusjs/drizzle/validation";
 * import { users } from "../schema/users.js";
 *
 * const insertUserSchema = createInsertSchema(users);
 * type InsertUser = z.infer<typeof insertUserSchema>;
 *
 * @Post("/users")
 * @Validate({ body: insertUserSchema })
 * async create(@Body() body: InsertUser) { ... }
 * ```
 */
import type { z } from "zod";
import { safeGetMeta, safeDefineMeta, safeHasMeta } from "@nexusts/core/di/safe-reflect";

/**
 * Zod schema derived from a Drizzle table's `$inferSelect` type.
 * Uses the column defaults and types to produce a runtime schema.
 *
 * @param table - A Drizzle table definition (from pgTable / sqliteTable / mysqlTable)
 * @returns A Zod object schema matching the select type
 */
export function createSelectSchema<TTable extends { $inferSelect: Record<string, unknown> }>(
	table: TTable,
): z.ZodObject<any> {
	return zodSchemaFromColumns(getTableColumns(table), false) as any;
}

/**
 * Zod schema derived from a Drizzle table's `$inferInsert` type.
 * Typically omits auto-generated columns (serial, timestamp defaults).
 *
 * @param table - A Drizzle table definition
 * @returns A Zod object schema matching the insert type
 */
export function createInsertSchema<TTable extends { $inferInsert: Record<string, unknown> }>(
	table: TTable,
): z.ZodObject<any> {
	return zodSchemaFromColumns(getTableColumns(table), true) as any;
}

/**
 * Zod schema derived from a Drizzle table's insert type, with all
 * fields made optional — for PATCH / partial update endpoints.
 *
 * @param table - A Drizzle table definition
 * @returns A Zod object schema (all fields optional)
 */
export function createUpdateSchema<TTable extends { $inferInsert: Record<string, unknown> }>(
	table: TTable,
): z.ZodObject<any> {
	const schema = createInsertSchema(table);
	return schema.partial() as any;
}

// ---------------------------------------------------------------------------
// Internal: read column metadata from a Drizzle table
// ---------------------------------------------------------------------------

function getTableColumns(table: any): Array<{
	name: string;
	type: string;
	notNull: boolean;
	hasDefault: boolean;
	isPrimaryKey: boolean;
}> {
	const columns: Array<{
		name: string;
		type: string;
		notNull: boolean;
		hasDefault: boolean;
		isPrimaryKey: boolean;
	}> = [];

	// Drizzle stores columns directly on the table object.
	for (const key of Object.keys(table)) {
		if (key === "_" || typeof table[key] === "function") continue;

		const col = table[key];
		if (!col || typeof col !== "object") continue;

		columns.push({
			name: col.name ?? key,
			type: inferColumnType(col),
			notNull: col.notNull ?? col.primary ?? false,
			hasDefault: col.default !== undefined || col.defaultFn !== undefined,
			isPrimaryKey: col.primary ?? false,
		});
	}

	// Fallback: try to read from `table._.columns`.
	if (columns.length === 0 && table._?.columns) {
		for (const [key, col] of Object.entries(table._.columns)) {
			const c = col as any;
			columns.push({
				name: c.name ?? key,
				type: inferColumnType(c),
				notNull: c.notNull ?? c.primary ?? false,
				hasDefault: c.default !== undefined || c.defaultFn !== undefined,
				isPrimaryKey: c.primary ?? false,
			});
		}
	}

	return columns;
}

function inferColumnType(col: any): string {
	// Drizzle column types carry a `dataType` property.
	if (col.dataType) return col.dataType;

	// Heuristic: check the constructor chain.
	const name = col.constructor?.name ?? "";
	if (name.includes("Serial")) return "number";
	if (name.includes("Integer")) return "number";
	if (name.includes("Real") || name.includes("Double")) return "number";
	if (name.includes("Text") || name.includes("Varchar")) return "string";
	if (name.includes("Boolean")) return "boolean";
	if (name.includes("Date") || name.includes("Timestamp") || name.includes("Time")) return "date";
	if (name.includes("Json") || name.includes("JSON")) return "json";

	return "string";
}

function zodSchemaFromColumns(
	columns: Array<{
		name: string;
		type: string;
		notNull: boolean;
		hasDefault: boolean;
		isPrimaryKey: boolean;
	}>,
	isInsert: boolean,
): any {
	// Lazy-load Zod to avoid forcing it as a peer dep at module load time.
	// We use the same pattern as the rest of the framework.
	const zod = loadZod();
	if (!zod) {
		throw new Error(
			"[nexusjs/drizzle/validation] `zod` is required. Install with `bun add zod`.",
		);
	}

	const shape: Record<string, any> = {};

	for (const col of columns) {
		// Skip auto-generated columns on insert (serial, timestamps with defaults).
		if (isInsert && col.hasDefault) continue;
		if (isInsert && col.isPrimaryKey && col.type === "number") continue;

		let schema = zodTypeToZod(col.type, zod);

		// Make nullable columns optional.
		if (!col.notNull || col.hasDefault) {
			schema = schema.optional();
		}

		shape[col.name] = schema;
	}

	return zod.z.object(shape);
}

function zodTypeToZod(type: string, zod: any): any {
	switch (type) {
		case "number":
			return zod.z.number();
		case "boolean":
			return zod.z.boolean();
		case "date":
			return zod.z.date();
		case "json":
			return zod.z.any();
		default:
			return zod.z.string();
	}
}

/** Load Zod dynamically (lazy, with clear error). */
let _zod: any = null;
function loadZod(): any {
	if (_zod) return _zod;
	try {
		_zod = require("zod");
		return _zod;
	} catch {
		return null;
	}
}
