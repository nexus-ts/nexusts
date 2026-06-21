/**
 * `DrizzleModel` — base class for entity models (Lucid-style).
 *
 *   @Table('users')
 *   class User extends DrizzleModel {
 *     @PrimaryKey({ autoIncrement: true, type: 'integer' })
 *     id!: number;
 *
 *     @Column({ type: 'text' })
 *     email!: string;
 *   }
 *
 * Models carry decorator metadata. The actual Drizzle table object
 * (created with `pgTable` / `mysqlTable` / `sqliteTable`) is supplied
 * to the repository so Drizzle's typed query API is preserved.
 */
import { readTableMeta, type TableMetadata } from "./decorators/index.js";

export class DrizzleModel {
	/** Decorator metadata for this model class. */
	static getMeta(this: any): TableMetadata | undefined {
		return readTableMeta(DrizzleModel);
	}

	/** Table name. */
	static getTableName(this: any): string | undefined {
		return readTableMeta(DrizzleModel)?.name;
	}

	/** Plain JS object representation. */
	toJSON(): Record<string, unknown> {
		const out: Record<string, unknown> = {};
		for (const [k, v] of Object.entries(this)) {
			if (typeof v !== "function") out[k] = v;
		}
		return out;
	}
}
