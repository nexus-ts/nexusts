/**
 * Decorator metadata for the @Table / @Column / @PrimaryKey stack.
 *
 * These are used together with `DrizzleModel` to give Lucid-like
 * ergonomics on top of Drizzle's table-builder API. The decorators
 * record metadata that the repository can read for default queries.
 */
import { safeGetMeta, safeDefineMeta, safeHasMeta } from "@nexusts/core/di/safe-reflect";
import {
	DRIZZLE_TABLE_META,
	type ColumnMetadata,
	type TableMetadata,
} from "../types.js";

export function Table(name: string): ClassDecorator {
	return (target: any) => {
		const existing: TableMetadata = safeGetMeta(
			DRIZZLE_TABLE_META,
			target,
		) ?? {
			name,
			columns: new Map(),
		};
		existing.name = name;
		safeDefineMeta(DRIZZLE_TABLE_META, existing, target);
	};
}

export function Column(opts: Partial<ColumnMetadata> = {}): PropertyDecorator {
	return (target: object, propertyKey: string | symbol) => {
		const meta = getTableMeta(target.constructor);
		meta.columns.set(String(propertyKey), {
			name: opts.name ?? String(propertyKey),
			type: opts.type ?? "text",
			nullable: opts.nullable ?? false,
			primaryKey: opts.primaryKey ?? false,
			autoIncrement: opts.autoIncrement ?? false,
			unique: opts.unique ?? false,
			default: opts.default,
			references: opts.references,
		});
	};
}

export function PrimaryKey(
	opts: Partial<ColumnMetadata> = {},
): PropertyDecorator {
	return (target: object, propertyKey: string | symbol) => {
		const meta = getTableMeta(target.constructor);
		meta.columns.set(String(propertyKey), {
			name: opts.name ?? String(propertyKey),
			type: opts.type ?? "integer",
			nullable: false,
			primaryKey: true,
			autoIncrement: opts.autoIncrement ?? false,
			unique: true,
			default: opts.default,
		});
	};
}

export function getTableMeta(target: any): TableMetadata {
	const m: TableMetadata = safeGetMeta(DRIZZLE_TABLE_META, target) ?? {
		name: target.name.toLowerCase(),
		columns: new Map(),
	};
	safeDefineMeta(DRIZZLE_TABLE_META, m, target);
	return m;
}

export function readTableMeta(target: any): TableMetadata | undefined {
	return safeGetMeta(DRIZZLE_TABLE_META, target);
}

export type { ColumnMetadata, TableMetadata } from "../types.js";
