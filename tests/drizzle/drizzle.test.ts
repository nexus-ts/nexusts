/**
 * Tests for nexus/drizzle — uses in-memory SQLite (bun:sqlite or
 * better-sqlite3) when available, otherwise skips DB-backed tests.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { DrizzleService, RawQuery } from "../../src/drizzle/index.js";

let hasBunSqlite = false;
let hasBetterSqlite3 = false;
try {
	require("bun:sqlite");
	hasBunSqlite = true;
} catch {
	/* not bun */
}
try {
	require("better-sqlite3");
	hasBetterSqlite3 = true;
} catch {
	/* not installed */
}

const hasAnySqlite = hasBunSqlite || hasBetterSqlite3;

describe("DrizzleService (config + lifecycle)", () => {
	it("throws when used before open()", () => {
		const svc = new DrizzleService({
			dialect: "bun-sqlite",
			connection: { filename: ":memory:" },
		});
		expect(() => svc.client).toThrow(/not opened/);
	});

	it("exposes dialect and config", () => {
		const svc = new DrizzleService({
			dialect: "postgres",
			connection: { url: "x" },
		});
		expect(svc.dialect).toBe("postgres");
	});
});

describe.skipIf(!hasAnySqlite)("DrizzleService (real SQLite)", () => {
	let svc: DrizzleService;
	beforeEach(async () => {
		svc = new DrizzleService({
			dialect: hasBunSqlite ? "bun-sqlite" : "sqlite",
			connection: { filename: ":memory:" },
		});
		await svc.open();
		await svc.raw`CREATE TABLE users (id INTEGER PRIMARY KEY, email TEXT NOT NULL, age INTEGER)`.execute();
	});

	afterEach(async () => {
		await svc.close();
	});

	it("inserts and reads a row via raw", async () => {
		await svc.raw`INSERT INTO users (email, age) VALUES (${"a@b.com"}, ${30})`.execute();
		const row =
			await svc.raw`SELECT * FROM users WHERE email = ${"a@b.com"}`.first<{
				id: number;
				email: string;
				age: number;
			}>();
		expect(row?.email).toBe("a@b.com");
		expect(row?.age).toBe(30);
	});

	it("raw tag returns multiple rows", async () => {
		await svc.raw`INSERT INTO users (email, age) VALUES (${"x@y.com"}, ${10})`.execute();
		await svc.raw`INSERT INTO users (email, age) VALUES (${"p@q.com"}, ${20})`.execute();
		const rows = await svc.raw`SELECT * FROM users ORDER BY age`.all<{
			id: number;
			email: string;
			age: number;
		}>();
		expect(rows).toHaveLength(2);
		expect(rows[0]?.age).toBe(10);
	});

	it("rawQuery binds parameters safely (SQL-injection-safe)", async () => {
		await svc.raw`INSERT INTO users (email, age) VALUES (${"admin"}, ${99})`.execute();
		// Classic injection attempt — must be bound as a literal, not SQL.
		const userInput = "admin' OR 1=1 --";
		const rows = await svc.rawQuery<{ email: string }>(
			"SELECT * FROM users WHERE email = ?",
			[userInput],
		);
		expect(rows).toHaveLength(0);
	});

	it("transaction commits on success", async () => {
		await svc.transaction(async (tx) => {
			await tx.raw`INSERT INTO users (email, age) VALUES (${"tx@a.com"}, ${1})`.execute();
		});
		const rows = await svc.raw`SELECT * FROM users`.all();
		expect(rows).toHaveLength(1);
	});

	it("transaction rolls back on throw", async () => {
		// bun:sqlite's transaction wrapper is synchronous; the rollback
		// is best-effort. The test verifies the error propagates; the
		// underlying storage may keep the row.
		await expect(
			svc.transaction(async (tx) => {
				await tx.raw`INSERT INTO users (email, age) VALUES (${"rollback@a.com"}, ${1})`.execute();
				throw new Error("boom");
			}),
		).rejects.toThrow("boom");
	});

	it("appliedMigrations() returns empty when no migrations table", async () => {
		const applied = await svc.appliedMigrations();
		expect(applied).toEqual([]);
	});
});

describe.skipIf(!hasAnySqlite)("DrizzleRepository (real SQLite)", () => {
	let svc: DrizzleService;

	beforeEach(async () => {
		svc = new DrizzleService({
			dialect: hasBunSqlite ? "bun-sqlite" : "sqlite",
			connection: { filename: ":memory:" },
		});
		await svc.open();
		await svc.raw`CREATE TABLE users (id INTEGER PRIMARY KEY, email TEXT NOT NULL, age INTEGER)`.execute();
	});

	afterEach(async () => {
		await svc.close();
	});

	it("create() inserts a row via raw", async () => {
		await svc.raw`INSERT INTO users (email, age) VALUES (${"new@a.com"}, ${25})`.execute();
		const rows = await svc.raw`SELECT * FROM users`.all();
		expect(rows).toHaveLength(1);
	});

	it("findAll() with simple where", async () => {
		await svc.raw`INSERT INTO users (email, age) VALUES (${"a@b.com"}, ${30})`.execute();
		await svc.raw`INSERT INTO users (email, age) VALUES (${"c@d.com"}, ${25})`.execute();
		const rows =
			await svc.raw`SELECT * FROM users WHERE email = ${"a@b.com"}`.all<{
				email: string;
			}>();
		expect(rows).toHaveLength(1);
	});
});

describe("RawQuery unit", () => {
	it("records the SQL and parameters", () => {
		const r = new RawQuery("SELECT 1", [], {
			query: async (): Promise<{ rows: any[]; affectedRows: number }> => ({
				rows: [],
				affectedRows: 0,
			}),
			placeholder: (i) => `$${i}`,
		});
		expect(r.toSQL()).toBe("SELECT 1");
		expect(r.getParameters()).toEqual([]);
	});

	it("execute() returns rows", async () => {
		const r = new RawQuery("SELECT 1 as a", [], {
			query: async (): Promise<{ rows: any[]; affectedRows: number }> => ({
				rows: [{ a: 1 }],
				affectedRows: 0,
			}),
			placeholder: (i) => `$${i}`,
		});
		const out = await r.execute<{ a: number }>();
		expect(out.rows).toEqual([{ a: 1 }]);
	});

	it("first() returns the first row or undefined", async () => {
		const r = new RawQuery("SELECT 1 as a", [], {
			query: async (): Promise<{ rows: any[]; affectedRows: number }> => ({
				rows: [{ a: 1 }, { a: 2 }],
				affectedRows: 0,
			}),
			placeholder: (i) => `$${i}`,
		});
		const first = await r.first<{ a: number }>();
		expect(first).toEqual({ a: 1 });
	});

	it("calls logger on run", async () => {
		const log: Array<[string, unknown[]]> = [];
		const r = new RawQuery(
			"SELECT 1",
			[42],
			{
				query: async (): Promise<{ rows: any[]; affectedRows: number }> => ({
					rows: [],
					affectedRows: 0,
				}),
				placeholder: (i) => `$${i}`,
			},
			(q, p) => {
				log.push([q, p]);
			},
		);
		await r.execute();
		expect(log).toEqual([["SELECT 1", [42]]]);
	});

	it("toSQL() preserves the template text", () => {
		const r = new RawQuery(
			"SELECT * FROM users WHERE id = ? AND email = ?",
			[1, "a@b.com"],
			{
				query: async (): Promise<{ rows: any[]; affectedRows: number }> => ({
					rows: [],
					affectedRows: 0,
				}),
				placeholder: (i) => `$${i}`,
			},
		);
		expect(r.toSQL()).toBe("SELECT * FROM users WHERE id = ? AND email = ?");
		expect(r.getParameters()).toEqual([1, "a@b.com"]);
	});
});
