/**
 * `@Entity()` decorator for Drizzle repositories.
 *
 * Automatically wires the table schema into the repository at construction
 * time, so the constructor only needs `DrizzleService` — no need to pass
 * the table schema explicitly.
 *
 * @example
 * ```ts
 * import { Entity, DrizzleRepository, DrizzleService } from "nexusjs/drizzle";
 * import { users } from "../schema/users.js";
 *
 * @Entity(users)
 * class UserRepository extends DrizzleRepository<typeof users> {
 *   // Only DrizzleService is needed in the constructor
 *   constructor(db: DrizzleService) {
 *     super(db, users); // table is auto-injected by the decorator
 *   }
 * }
 * ```
 */
import "reflect-metadata";
import type { DrizzleService } from "./drizzle.service.js";
import type { DrizzleRepository } from "./repository/index.js";

/** Storage for entity → table metadata. */
const ENTITY_TABLE_MAP = new Map<Function, any>();

/**
 * @Entity decorator — marks a repository class with its Drizzle table.
 *
 * The decorator creates a wrapper class that passes both the `DrizzleService`
 * and the table schema to the parent `DrizzleRepository` constructor.
 */
export function Entity<TTable extends object>(table: TTable): ClassDecorator {
	return (target: object) => {
		const ctor = target as new (...args: any[]) => DrizzleRepository<any>;

		// Wrap the constructor to auto-inject the table schema.
		class WrappedRepository extends (ctor as any) {
			constructor(...args: any[]) {
				const drizzleService = args[0] as DrizzleService;
				super(drizzleService, table);
			}
		}

		// Copy static properties and name.
		Object.setPrototypeOf(WrappedRepository, ctor);
		Object.defineProperty(WrappedRepository, "name", {
			value: ctor.name,
			configurable: true,
		});

		// Store metadata under both original and wrapped class so lookups
		// work regardless of whether the caller has the original or the
		// decorator-returned class reference.
		ENTITY_TABLE_MAP.set(ctor, table);
		ENTITY_TABLE_MAP.set(WrappedRepository, table);

		return WrappedRepository as any;
	};
}

/** Get the table schema associated with an entity-decorated class. */
export function getEntityTable(target: Function): any | undefined {
	return ENTITY_TABLE_MAP.get(target);
}
