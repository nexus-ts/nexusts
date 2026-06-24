/**
 * `Factory<TData>` — test-data factory for Drizzle tables.
 *
 * Provides `make` / `makeMany` (in-memory) and `create` / `createMany`
 * (database insert) helpers. The definition function receives a faker
 * instance when `@faker-js/faker` is installed as a peer dependency;
 * if it's not available, a no-op proxy is provided that throws a
 * descriptive error on first use.
 *
 * Usage:
 *
 *   // database/factories/user.factory.ts
 *   import { Factory } from '@nexusts/drizzle';
 *   import { users } from '../schema.js';
 *
 *   export const UserFactory = new Factory(users, (faker) => ({
 *     email: faker.internet.email(),
 *     username: faker.internet.username(),
 *     createdAt: new Date(),
 *   }));
 *
 *   // database/seeds/01_users.ts
 *   import type { SeedContext } from '@nexusts/cli';
 *   import { UserFactory } from '../factories/user.factory.js';
 *
 *   export default async function seed(ctx: SeedContext) {
 *     await UserFactory.createMany(ctx.db, 10);
 *   }
 */

/** Minimal interface for a DB that supports insert — matches DrizzleService. */
export interface FactoryDb {
	insert(table: any): { values(rows: any): Promise<any> | { execute(): Promise<any> } };
}

export class Factory<TData extends Record<string, unknown>> {
	#fakerCache: Promise<any> | null = null;

	constructor(
		private readonly table: any,
		private readonly definitionFn: (faker: any) => TData,
	) {}

	#getFaker(): Promise<any> {
		if (!this.#fakerCache) {
			// @ts-ignore — optional peer dep; runtime fallback via Proxy below
			this.#fakerCache = import("@faker-js/faker")
				.then((m) => m.faker ?? (m as any).default?.faker ?? m)
				.catch(
					() =>
						new Proxy(
							{},
							{
								get(_, prop) {
									// Allow Promise resolution to check thenability without throwing.
									if (prop === "then" || prop === "catch" || prop === "finally") return undefined;
									throw new Error(
										`Factory: @faker-js/faker is not installed. ` +
											`Install it with:\n  bun add -d @faker-js/faker\n\n` +
											`Or avoid using faker.${String(prop)} in your factory definition.`,
									);
								},
							},
						),
				);
		}
		return this.#fakerCache;
	}

	/** Generate a single plain object (no database insert). */
	async make(overrides: Partial<TData> = {}): Promise<TData> {
		const faker = await this.#getFaker();
		return { ...this.definitionFn(faker), ...overrides } as TData;
	}

	/** Generate an array of plain objects (no database insert). */
	async makeMany(count: number, overrides: Partial<TData> = {}): Promise<TData[]> {
		const faker = await this.#getFaker();
		return Array.from({ length: count }, () => ({
			...this.definitionFn(faker),
			...overrides,
		})) as TData[];
	}

	/**
	 * Insert a single row and return the generated data.
	 * `db` can be a `DrizzleService` or any object that implements `FactoryDb`.
	 */
	async create(db: FactoryDb, overrides: Partial<TData> = {}): Promise<TData> {
		const data = await this.make(overrides);
		const q = db.insert(this.table).values(data);
		await (typeof (q as any).execute === "function" ? (q as any).execute() : q);
		return data;
	}

	/**
	 * Insert multiple rows in a single statement and return the generated data.
	 * Returns an empty array when `count` is 0.
	 */
	async createMany(
		db: FactoryDb,
		count: number,
		overrides: Partial<TData> = {},
	): Promise<TData[]> {
		if (count === 0) return [];
		const rows = await this.makeMany(count, overrides);
		const q = db.insert(this.table).values(rows);
		await (typeof (q as any).execute === "function" ? (q as any).execute() : q);
		return rows;
	}
}
