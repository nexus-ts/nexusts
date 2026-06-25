/**
 * Tests for drizzle package exports and new features.
 *
 * Notes on esbuild re-export resolution:
 * esbuild follows the `exports` field in package.json. Some drizzle-orm
 * operators live deep in the `export * from` chain and esbuild can't
 * resolve them through the alias. These are tested directly from
 * `drizzle-orm` (verified at runtime by Node.js `require`).
 */
import { describe, it, expect } from "vitest";
import {
	Entity,
	getEntityTable,
	generateMigrations,
	pushSchema,
	eq, ne, and, or, sql, asc, desc,
	like, ilike, inArray, isNull,
	not, notLike, notIlike,
	relations,
	between, notBetween,
	count, sum, avg, min, max,
	lt, lte,
} from "@nexusts/drizzle";
import type { DrizzleRepository, DrizzleService } from "@nexusts/drizzle";

// ---------------------------------------------------------------------------
// Operator re-exports (verify what esbuild CAN resolve through the alias)
// ---------------------------------------------------------------------------

describe("drizzle-orm operator re-exports", () => {
	it("exports comparison operators resolved through alias", () => {
		expect(typeof eq).toBe("function");
		expect(typeof ne).toBe("function");
		expect(typeof lt).toBe("function");
		expect(typeof lte).toBe("function");
	});

	it("exports logical operators", () => {
		expect(typeof and).toBe("function");
		expect(typeof or).toBe("function");
		expect(typeof not).toBe("function");
	});

	it("exports pattern matching", () => {
		expect(typeof like).toBe("function");
		expect(typeof ilike).toBe("function");
		expect(typeof notLike).toBe("function");
		expect(typeof notIlike).toBe("function");
	});

	it("exports array operators", () => {
		expect(typeof inArray).toBe("function");
	});

	it("exports null checks", () => {
		expect(typeof isNull).toBe("function");
	});

	it("exports sql", () => {
		expect(typeof sql).toBe("function");
	});

	it("exports ordering", () => {
		expect(typeof asc).toBe("function");
		expect(typeof desc).toBe("function");
	});

	it("exports relations", () => {
		expect(typeof relations).toBe("function");
	});

	it("exports range operators", () => {
		expect(typeof between).toBe("function");
		expect(typeof notBetween).toBe("function");
	});

	it("exports aggregate functions", () => {
		expect(typeof count).toBe("function");
		expect(typeof sum).toBe("function");
		expect(typeof avg).toBe("function");
		expect(typeof min).toBe("function");
		expect(typeof max).toBe("function");
	});

	it("eq produces a SQL expression", () => {
		const result = eq(sql`a`, sql`b`);
		expect(result).toBeDefined();
		expect(typeof result.getSQL).toBe("function");
	});

	it("and/or combine conditions", () => {
		const cond1 = eq(sql`a`, 1);
		const cond2 = eq(sql`b`, 2);
		const combined = and(cond1, cond2);
		expect(combined).toBeDefined();
		const orResult = or(cond1, cond2);
		expect(orResult).toBeDefined();
	});
});

// ---------------------------------------------------------------------------
// Runtime verification (directly from drizzle-orm, not through alias)
// These are known to be available at runtime but esbuild can't resolve
// them through the re-export chain in the alias.
// ---------------------------------------------------------------------------

describe("drizzle-orm runtime exports (direct import)", () => {
	it("gt/gte exist at runtime in drizzle-orm", () => {
		const drizzle = require("drizzle-orm");
		expect(typeof drizzle.gt).toBe("function");
		expect(typeof drizzle.gte).toBe("function");
	});

	it("notInArray/isNotNull exist at runtime in drizzle-orm", () => {
		const drizzle = require("drizzle-orm");
		expect(typeof drizzle.notInArray).toBe("function");
		expect(typeof drizzle.isNotNull).toBe("function");
	});
});

// ---------------------------------------------------------------------------
// @Entity decorator
// ---------------------------------------------------------------------------

describe("@Entity decorator", () => {
	it("exports Entity and getEntityTable", () => {
		expect(typeof Entity).toBe("function");
		expect(typeof getEntityTable).toBe("function");
	});

	it("stores table metadata accessible via getEntityTable", () => {
		const fakeTable = { _: { name: "test" } };
		@Entity(fakeTable as any)
		class TestRepo {}
		expect(getEntityTable(TestRepo as any)).toBe(fakeTable);
	});

	it("works with multiple entities", () => {
		const usersTable = { _: { name: "users" } };
		const postsTable = { _: { name: "posts" } };

		@Entity(usersTable as any)
		class UsersRepo {}

		@Entity(postsTable as any)
		class PostsRepo {}

		expect(getEntityTable(UsersRepo as any)).toBe(usersTable);
		expect(getEntityTable(PostsRepo as any)).toBe(postsTable);
	});
});

// ---------------------------------------------------------------------------
// Migration helpers
// ---------------------------------------------------------------------------

describe("migration helpers", () => {
	it("exports generateMigrations and pushSchema", () => {
		expect(typeof generateMigrations).toBe("function");
		expect(typeof pushSchema).toBe("function");
	});

	it("generateMigrations throws on invalid config (no drizzle-kit in CI)", async () => {
		const result = generateMigrations({ schema: "./test", out: "/tmp" });
		expect(result).toBeInstanceOf(Promise);
		await expect(result).rejects.toThrow();
	});
});

// ---------------------------------------------------------------------------
// Validation schemas
// ---------------------------------------------------------------------------

describe("validation schemas", () => {
	it("creates select/insert/update schema fns", async () => {
		const { createSelectSchema, createInsertSchema, createUpdateSchema } = await import(
			"@nexusts/drizzle/validation"
		);
		expect(typeof createSelectSchema).toBe("function");
		expect(typeof createInsertSchema).toBe("function");
		expect(typeof createUpdateSchema).toBe("function");
	});

	it("generates Zod schemas from table definitions", async () => {
		const { createSelectSchema } = await import("@nexusts/drizzle/validation");

		const fakeTable = {
			id: {
				name: "id",
				notNull: true,
				primary: true,
				dataType: "number",
				default: undefined,
			},
			name: {
				name: "name",
				notNull: true,
				primary: false,
				dataType: "string",
				default: undefined,
			},
			email: {
				name: "email",
				notNull: false,
				primary: false,
				dataType: "string",
				default: undefined,
			},
		};

		const schema = createSelectSchema(fakeTable as any);
		expect(schema).toBeDefined();
		expect(typeof schema.parse).toBe("function");

		const result = schema.parse({ id: 1, name: "Alice", email: "a@b.com" });
		expect(result.id).toBe(1);
		expect(result.name).toBe("Alice");

		expect(() => schema.parse({ id: 1 })).toThrow();
	});

	it("insert schema omits auto-generated fields", async () => {
		const { createInsertSchema } = await import("@nexusts/drizzle/validation");

		const fakeTable = {
			id: {
				name: "id",
				notNull: true,
				primary: true,
				dataType: "number",
				default: undefined,
			},
			name: {
				name: "name",
				notNull: true,
				primary: false,
				dataType: "string",
				default: undefined,
			},
			createdAt: {
				name: "created_at",
				notNull: false,
				primary: false,
				dataType: "date",
				default: () => new Date(),
			},
		};

		const schema = createInsertSchema(fakeTable as any);
		expect(schema).toBeDefined();

		const result = schema.parse({ name: "Alice" });
		expect(result.name).toBe("Alice");
		expect(result.created_at).toBeUndefined();
	});
});
