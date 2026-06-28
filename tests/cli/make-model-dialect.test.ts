/**
 * Tests for the dialect-aware Drizzle templates.
 */

import { describe, expect, it } from "vitest";
import { render } from "../../src/cli/core/template.js";
import {
	mapDrizzleType,
	renderDrizzleDialect,
} from "../../src/cli/templates/model/drizzle-dialect.js";

describe("renderDrizzleDialect", () => {
	it("renders a postgres table with serial id", () => {
		const tpl = renderDrizzleDialect("postgres");
		const out = render(tpl, {
			name: "User",
			snake: "users",
			tableName: "users",
			columns: "  email: text('email'),",
		});
		expect(out).toContain("from 'drizzle-orm/pg-core'");
		expect(out).toContain("pgTable");
		expect(out).toContain("serial('id').primaryKey()");
		expect(out).toContain("text('email')");
		expect(out).toContain("timestamp('created_at')");
	});

	it("renders a mysql table with int id", () => {
		const tpl = renderDrizzleDialect("mysql");
		const out = render(tpl, {
			name: "Post",
			snake: "posts",
			tableName: "posts",
			columns: "  title: text('title'),",
		});
		expect(out).toContain("from 'drizzle-orm/mysql-core'");
		expect(out).toContain("mysqlTable");
		expect(out).toContain("int('id').primaryKey({ autoIncrement: true })");
		expect(out).toContain("timestamp('created_at')");
	});

	it("renders a sqlite table with integer id", () => {
		const tpl = renderDrizzleDialect("sqlite");
		const out = render(tpl, {
			name: "Note",
			snake: "notes",
			tableName: "notes",
			columns: "  body: text('body'),",
		});
		expect(out).toContain("from 'drizzle-orm/sqlite-core'");
		expect(out).toContain("sqliteTable");
		expect(out).toContain("integer('id').primaryKey({ autoIncrement: true })");
		expect(out).toContain("integer('created_at', { mode: 'timestamp' })");
	});

	it("renders a d1 table with integer id", () => {
		const tpl = renderDrizzleDialect("d1");
		const out = render(tpl, {
			name: "Page",
			snake: "pages",
			tableName: "pages",
			columns: "  slug: text('slug'),",
		});
		expect(out).toContain("from 'drizzle-orm/d1'");
	});

	it("renders a sqlite (better-sqlite3) table", () => {
		const tpl = renderDrizzleDialect("sqlite");
		const out = render(tpl, {
			name: "Item",
			snake: "items",
			tableName: "items",
			columns: "  name: text('name'),",
		});
		expect(out).toContain("from 'drizzle-orm/sqlite-core'");
	});
});

describe("mapDrizzleType", () => {
	it("maps 'text' / 'string' / 'varchar' to text for all dialects", () => {
		for (const d of ["postgres", "mysql", "sqlite", "sqlite", "d1"]) {
			expect(mapDrizzleType(d, "text")).toBe("text");
			expect(mapDrizzleType(d, "string")).toBe("text");
			expect(mapDrizzleType(d, "varchar")).toBe("text");
		}
	});

	it("maps int to 'integer' for sqlite-family and 'int' for mysql", () => {
		expect(mapDrizzleType("postgres", "int")).toBe("integer");
		expect(mapDrizzleType("mysql", "int")).toBe("int");
		expect(mapDrizzleType("sqlite", "int")).toBe("integer");
		expect(mapDrizzleType("sqlite", "int")).toBe("integer");
		expect(mapDrizzleType("d1", "int")).toBe("integer");
	});

	it("maps boolean to 'boolean' for all dialects", () => {
		for (const d of ["postgres", "mysql", "sqlite", "sqlite", "d1"]) {
			expect(mapDrizzleType(d, "boolean")).toBe("boolean");
		}
	});

	it("maps float to 'double' for mysql and 'real' otherwise", () => {
		expect(mapDrizzleType("mysql", "float")).toBe("double");
		expect(mapDrizzleType("postgres", "float")).toBe("real");
		expect(mapDrizzleType("sqlite", "float")).toBe("real");
	});

	it("maps timestamp to 'timestamp' for pg/mysql and 'integer' otherwise", () => {
		expect(mapDrizzleType("postgres", "timestamp")).toBe("timestamp");
		expect(mapDrizzleType("mysql", "timestamp")).toBe("timestamp");
		expect(mapDrizzleType("sqlite", "timestamp")).toBe("integer");
	});

	it("falls back to text for unknown types", () => {
		expect(mapDrizzleType("postgres", "uuid")).toBe("text");
	});
});
