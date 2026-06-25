/**
 * Tests for the `nx db:migrate` command and dialect-aware make:model/make:migration.
 *
 * We test the command by invoking its `run` method directly with a
 * stubbed CommandContext. No real database is required.
 */

import {
	writeFile as fsWriteFile,
	mkdir,
	readFile,
	rm,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { makeMigrationCommand } from "../../src/cli/commands/make-migration.js";
import { makeModelCommand } from "../../src/cli/commands/make-model.js";

async function makeTmp(): Promise<string> {
	const d = join(
		tmpdir(),
		`nx-make-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
	);
	await mkdir(d, { recursive: true });
	return d;
}

describe("make:model with --dialect", () => {
	it("renders a postgres table when --dialect postgres is given", async () => {
		const cwd = await makeTmp();
		await fsWriteFile(
			join(cwd, "nx.config.ts"),
			`export default { routing: 'nest', view: 'none', orm: 'drizzle', dialect: 'postgres', database: { driver: 'postgres', url: '' }, inertia: { frontend: 'react', ssr: false, version: '1.0.0' }, paths: { app: 'src/app', controllers: 'src/app/controllers', services: 'src/app/services', modules: 'src/app/modules', models: 'src/app/models', migrations: 'src/app/database/migrations', middleware: 'src/app/middleware', dto: 'src/app/dto' }, controllersExtra: [] };`,
		);
		await mkdir(join(cwd, "src/app/models"), { recursive: true });

		const code = await makeModelCommand.run({
			positional: ["User"],
			flags: { columns: "email:text" },
			cwd,
			config: {
				routing: "nest",
				view: "none",
				orm: "drizzle",
				dialect: "postgres",
				database: { driver: "postgres", url: "" },
				inertia: { frontend: "react", ssr: false, version: "1.0.0" },
				paths: {
					app: "src/app",
					controllers: "src/app/controllers",
					services: "src/app/services",
					modules: "src/app/modules",
					models: "src/app/models",
					migrations: "src/app/database/migrations",
					middleware: "src/app/middleware",
					dto: "src/app/dto",
				},
				controllersExtra: [],
			},
		} as any);
		expect(code).toBe(0);
		const out = await readFile(
			join(cwd, "src/app/models/user.model.ts"),
			"utf-8",
		);
		expect(out).toContain("from 'drizzle-orm/pg-core'");
		expect(out).toContain("pgTable");
		expect(out).toContain("serial('id').primaryKey()");
		await rm(cwd, { recursive: true, force: true });
	});

	it("renders a bun-sqlite table by default (when dialect is unset)", async () => {
		const cwd = await makeTmp();
		await fsWriteFile(
			join(cwd, "nx.config.ts"),
			`export default { routing: 'nest', view: 'none', orm: 'drizzle', database: { driver: 'bun-sqlite', url: '' }, inertia: { frontend: 'react', ssr: false, version: '1.0.0' }, paths: { app: 'src/app', controllers: 'src/app/controllers', services: 'src/app/services', modules: 'src/app/modules', models: 'src/app/models', migrations: 'src/app/database/migrations', middleware: 'src/app/middleware', dto: 'src/app/dto' }, controllersExtra: [] };`,
		);
		await mkdir(join(cwd, "src/app/models"), { recursive: true });

		const code = await makeModelCommand.run({
			positional: ["Item"],
			flags: { columns: "name:text" },
			cwd,
			config: {
				routing: "nest",
				view: "none",
				orm: "drizzle",
				database: { driver: "bun-sqlite", url: "" },
				inertia: { frontend: "react", ssr: false, version: "1.0.0" },
				paths: {
					app: "src/app",
					controllers: "src/app/controllers",
					services: "src/app/services",
					modules: "src/app/modules",
					models: "src/app/models",
					migrations: "src/app/database/migrations",
					middleware: "src/app/middleware",
					dto: "src/app/dto",
				},
				controllersExtra: [],
			},
		} as any);
		expect(code).toBe(0);
		const out = await readFile(
			join(cwd, "src/app/models/item.model.ts"),
			"utf-8",
		);
		expect(out).toContain("from 'drizzle-orm/sqlite-core'");
		await rm(cwd, { recursive: true, force: true });
	});

	it("rejects an unknown dialect", async () => {
		const cwd = await makeTmp();
		await fsWriteFile(
			join(cwd, "nx.config.ts"),
			`export default { routing: 'nest', view: 'none', orm: 'drizzle', database: { driver: 'postgres', url: '' }, inertia: { frontend: 'react', ssr: false, version: '1.0.0' }, paths: { app: 'src/app', controllers: 'src/app/controllers', services: 'src/app/services', modules: 'src/app/modules', models: 'src/app/models', migrations: 'src/app/database/migrations', middleware: 'src/app/middleware', dto: 'src/app/dto' }, controllersExtra: [] };`,
		);
		await mkdir(join(cwd, "src/app/models"), { recursive: true });

		const code = await makeModelCommand.run({
			positional: ["X"],
			flags: { dialect: "cockroachdb" },
			cwd,
			config: {
				routing: "nest",
				view: "none",
				orm: "drizzle",
				database: { driver: "postgres", url: "" },
				inertia: { frontend: "react", ssr: false, version: "1.0.0" },
				paths: {
					app: "src/app",
					controllers: "src/app/controllers",
					services: "src/app/services",
					modules: "src/app/modules",
					models: "src/app/models",
					migrations: "src/app/database/migrations",
					middleware: "src/app/middleware",
					dto: "src/app/dto",
				},
				controllersExtra: [],
			},
		} as any);
		expect(code).toBe(1);
		await rm(cwd, { recursive: true, force: true });
	});
});

describe("make:migration with --dialect", () => {
	it("renders a postgres-style .ts migration with timestamp()", async () => {
		const cwd = await makeTmp();
		await fsWriteFile(
			join(cwd, "nx.config.ts"),
			`export default { routing: 'nest', view: 'none', orm: 'drizzle', dialect: 'postgres', database: { driver: 'postgres', url: '' }, inertia: { frontend: 'react', ssr: false, version: '1.0.0' }, paths: { app: 'src/app', controllers: 'src/app/controllers', services: 'src/app/services', modules: 'src/app/modules', models: 'src/app/models', migrations: 'src/app/database/migrations', middleware: 'src/app/middleware', dto: 'src/app/dto' }, controllersExtra: [] };`,
		);
		await mkdir(join(cwd, "src/app/database/migrations"), { recursive: true });

		const code = await makeMigrationCommand.run({
			positional: ["create_users_table"],
			flags: { columns: "email:text,age:int", dialect: "postgres" },
			cwd,
			config: {
				routing: "nest",
				view: "none",
				orm: "drizzle",
				dialect: "postgres",
				database: { driver: "postgres", url: "" },
				inertia: { frontend: "react", ssr: false, version: "1.0.0" },
				paths: {
					app: "src/app",
					controllers: "src/app/controllers",
					services: "src/app/services",
					modules: "src/app/modules",
					models: "src/app/models",
					migrations: "src/app/database/migrations",
					middleware: "src/app/middleware",
					dto: "src/app/dto",
				},
				controllersExtra: [],
			},
		} as any);
		expect(code).toBe(0);
		const { readdir } = await import("node:fs/promises");
		const list = await readdir(join(cwd, "src/app/database/migrations"));
		expect(list).toHaveLength(1);
		expect(list[0]).toMatch(/\.ts$/);
		const content = await readFile(
			join(cwd, "src/app/database/migrations", list[0]!),
			"utf-8",
		);
		expect(content).toContain("from 'drizzle-orm/pg-core'");
		expect(content).toContain("pgTable");
		expect(content).toContain("timestamp('created_at')");
		await rm(cwd, { recursive: true, force: true });
	});

	it("renders a mysql-style .ts migration with timestamp()", async () => {
		const cwd = await makeTmp();
		await fsWriteFile(
			join(cwd, "nx.config.ts"),
			`export default { routing: 'nest', view: 'none', orm: 'drizzle', dialect: 'mysql', database: { driver: 'mysql', url: '' }, inertia: { frontend: 'react', ssr: false, version: '1.0.0' }, paths: { app: 'src/app', controllers: 'src/app/controllers', services: 'src/app/services', modules: 'src/app/modules', models: 'src/app/models', migrations: 'src/app/database/migrations', middleware: 'src/app/middleware', dto: 'src/app/dto' }, controllersExtra: [] };`,
		);
		await mkdir(join(cwd, "src/app/database/migrations"), { recursive: true });

		const code = await makeMigrationCommand.run({
			positional: ["create_orders"],
			flags: { columns: "amount:int", dialect: "mysql" },
			cwd,
			config: {
				routing: "nest",
				view: "none",
				orm: "drizzle",
				dialect: "mysql",
				database: { driver: "mysql", url: "" },
				inertia: { frontend: "react", ssr: false, version: "1.0.0" },
				paths: {
					app: "src/app",
					controllers: "src/app/controllers",
					services: "src/app/services",
					modules: "src/app/modules",
					models: "src/app/models",
					migrations: "src/app/database/migrations",
					middleware: "src/app/middleware",
					dto: "src/app/dto",
				},
				controllersExtra: [],
			},
		} as any);
		expect(code).toBe(0);
		const { readdir } = await import("node:fs/promises");
		const dir = join(cwd, "src/app/database/migrations");
		const files = await readdir(dir);
		const content = await readFile(join(dir, files[0]!), "utf-8");
		expect(content).toContain("from 'drizzle-orm/mysql-core'");
		await rm(cwd, { recursive: true, force: true });
	});

	it("renders a generic .sql migration when orm is 'none'", async () => {
		const cwd = await makeTmp();
		await fsWriteFile(
			join(cwd, "nx.config.ts"),
			`export default { routing: 'nest', view: 'none', orm: 'none', database: { driver: 'none', url: '' }, inertia: { frontend: 'react', ssr: false, version: '1.0.0' }, paths: { app: 'src/app', controllers: 'src/app/controllers', services: 'src/app/services', modules: 'src/app/modules', models: 'src/app/models', migrations: 'src/app/database/migrations', middleware: 'src/app/middleware', dto: 'src/app/dto' }, controllersExtra: [] };`,
		);
		await mkdir(join(cwd, "src/app/database/migrations"), { recursive: true });

		const code = await makeMigrationCommand.run({
			positional: ["add_email_to_users"],
			flags: {},
			cwd,
			config: {
				routing: "nest",
				view: "none",
				orm: "none",
				database: { driver: "none", url: "" },
				inertia: { frontend: "react", ssr: false, version: "1.0.0" },
				paths: {
					app: "src/app",
					controllers: "src/app/controllers",
					services: "src/app/services",
					modules: "src/app/modules",
					models: "src/app/models",
					migrations: "src/app/database/migrations",
					middleware: "src/app/middleware",
					dto: "src/app/dto",
				},
				controllersExtra: [],
			},
		} as any);
		expect(code).toBe(0);
		const { readdir } = await import("node:fs/promises");
		const dir = join(cwd, "src/app/database/migrations");
		const list = await readdir(dir);
		expect(list[0]).toMatch(/\.sql$/);
		await rm(cwd, { recursive: true, force: true });
	});
});

describe("nx db:migrate command exists", () => {
	it("exports the db:migrate command with new name and aliases", async () => {
		const mod = await import("../../src/cli/commands/db-migrate.js");
		expect(mod.default.name).toBe("db:migrate");
		// Old alias kept for backward-compat
		expect(mod.default.aliases).toContain("migrate");
		// New short alias
		expect(mod.default.aliases).toContain("db:m");
		const hasStatus = mod.default.flags.some(
			(f: { name: string }) => f.name === "status",
		);
		const hasGenerate = mod.default.flags.some(
			(f: { name: string }) => f.name === "generate",
		);
		const hasFolder = mod.default.flags.some(
			(f: { name: string }) => f.name === "folder",
		);
		expect(hasStatus).toBe(true);
		expect(hasGenerate).toBe(true);
		expect(hasFolder).toBe(true);
	});
});
