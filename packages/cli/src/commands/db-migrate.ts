/**
 * `nx db:migrate` — apply pending database migrations.
 *
 * Two modes based on ORM config:
 *
 *   1. **Drizzle** (default): spawns `bunx drizzle-kit migrate` with
 *      the project's drizzle.config.ts.
 *
 *   2. **Kysely**: runs an in-process migration script that uses
 *      Kysely's built-in `Migrator` + `FileMigrationProvider`.
 *
 * Examples:
 *   nx db:migrate
 *   nx db:migrate --status
 *   nx db:migrate --folder ./drizzle --dialect postgres
 *
 * See also: `nx db:seed` for inserting fixture data.
 */

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import type { Command, CommandContext } from "../core/index.js";
import { logger } from "../core/index.js";

export const dbMigrateCommand: Command = {
	name: "db:migrate",
	aliases: ["db:m", "migrate"],
	summary: "Apply pending database migrations",
	description:
		"Runs the configured migrator (drizzle-kit for Drizzle, Kysely Migrator for Kysely) against the migrations folder. Use --status to inspect. See also `nx db:seed` for fixture data.",
	examples: [
		"nx db:migrate",
		"nx db:migrate --status",
		"nx db:migrate --folder ./drizzle",
	],
	flags: [
		{
			name: "status",
			description: "List applied migrations and exit (no apply).",
		},
		{
			name: "folder",
			description: "Override migrations folder (default: from nx.config.ts).",
		},
		{
			name: "dialect",
			description:
				"Database dialect (postgres|mysql|sqlite). Default: sqlite.",
		},
		{
			name: "config",
			description: "Path to drizzle.config.ts. Default: ./drizzle.config.ts.",
		},
		{
			name: "orm",
			description: "Override ORM driver (drizzle|kysely)",
		},
	],
	async run(ctx: CommandContext): Promise<number> {
		const orm = (ctx.flags.orm as string | undefined) ?? ctx.config.orm;
		const folder =
			(ctx.flags.folder as string | undefined) ??
			resolve(ctx.cwd, ctx.config.paths.migrations);
		const dialect =
			(ctx.flags.dialect as string | undefined) ??
			ctx.config.dialect ??
			"sqlite";
		const configPath =
			(ctx.flags.config as string | undefined) ??
			resolve(ctx.cwd, "drizzle.config.ts");
		const wantStatus = Boolean(ctx.flags.status);

		if (orm === "kysely") {
			return runKyselyMigrate(ctx.cwd, folder, dialect, wantStatus);
		}

		if (wantStatus) {
			return await runStatus(ctx.cwd, folder, dialect, ctx.config.database.url);
		}

		// Default: apply pending migrations via drizzle-kit.
		return runDrizzleKit(ctx.cwd, [
			"migrate",
			...(existsSync(configPath) ? [`--config=${configPath}`] : []),
		]);
	},
};

/**
 * Run Kysely migrations using an in-process script.
 */
async function runKyselyMigrate(
	cwd: string,
	folder: string,
	dialect: string,
	statusOnly: boolean,
): Promise<number> {
	if (!existsSync(folder)) {
		logger.warn(`migrations folder not found: ${folder}`);
		return 0;
	}

	const script = buildKyselyMigrateScript(folder, dialect, statusOnly);
	const tmpFile = resolve(cwd, ".nx-kysely-migrate.mjs");
	const { writeFile, unlink } = await import("node:fs/promises");
	await writeFile(tmpFile, script, "utf-8");

	try {
		const code = await new Promise<number>((resP) => {
			const child = spawn("bun", [tmpFile], {
				cwd,
				stdio: "inherit",
				shell: process.platform === "win32",
			});
			child.on("exit", (c) => resP(c ?? 0));
			child.on("error", () => resP(1));
		});
		return code;
	} finally {
		await unlink(tmpFile).catch(() => {});
	}
}

/**
 * Build a JavaScript script that uses Kysely's Migrator to run or
 * list pending migrations.
 */
function buildKyselyMigrateScript(
	folder: string,
	dialect: string,
	statusOnly: boolean,
): string {
	const dialectSetup = buildDialectSetup(dialect);
	const tableName = "kysely_migration";

	return `
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";

const migrationsFolder = ${JSON.stringify(folder)};

// Build the Kysely instance with the configured dialect.
${dialectSetup}

import {
  Kysely,
  Migrator,
} from "kysely";

class FsMigrationProvider {
  async getMigrations() {
    const files = readdirSync(migrationsFolder)
      .filter((f) => f.endsWith(".ts") || f.endsWith(".js"))
      .sort();

    const migrations = {};
    for (const file of files) {
      const name = file.replace(/\\.(ts|js)$/, "");
      const mod = await import(join(migrationsFolder, file));
      migrations[name] = {
        up: mod.up,
        down: mod.down,
      };
    }
    return migrations;
  }
}

const db = new Kysely({ dialect });

const migrator = new Migrator({
  db,
  provider: new FsMigrationProvider(),
  migrationTableName: ${JSON.stringify(tableName)},
});

${statusOnly ? `
const { results } = await migrator.getMigrations();
console.log("Migration status:");
for (const r of results ?? []) {
  console.log(\`  \${r.name}: \${r.status}\`);
}
` : `
const { results, error } = await migrator.migrateToLatest();
if (error) {
  console.error("Migration failed:", error);
  process.exit(1);
}
const applied = (results ?? []).filter((r) => r.status === "Success" || r.status === "MigratedAbove");
console.log(\`Applied \${applied.length} migration(s)\`);
for (const r of applied) {
  console.log(\`  ✓ \${r.migrationName}\`);
}
`}

await db.destroy();
`;
}

/**
 * Build the dialect setup code for the in-process migration script.
 */
function buildDialectSetup(dialect: string): string {
	switch (dialect) {
		case "postgres":
			return `
import { Pool } from "pg";
import { PostgresDialect } from "kysely";
const dialect = new PostgresDialect({
  pool: new Pool({ connectionString: process.env.DATABASE_URL ?? "" }),
});
`;
		case "mysql":
			return `
import { createPool } from "mysql2";
import { MysqlDialect } from "kysely";
const dialect = new MysqlDialect({
  pool: createPool({ uri: process.env.DATABASE_URL ?? "" }),
});
`;
		default:
			return `
import { Database } from "bun:sqlite";
import { SqliteDialect } from "kysely";

// Patch .reader property for bun:sqlite compatibility with Kysely.
const _db = new Database(process.env.DATABASE_URL ?? "app.db");
const proto = Object.getPrototypeOf(_db);
const _prepare = proto.prepare.bind(_db);
_db.prepare = function(sql) {
  const stmt = _prepare(sql);
  Object.defineProperty(stmt, "reader", { value: /^\\s*(select|pragma|with|explain)\\b/i.test(sql) });
  return stmt;
};
const dialect = new SqliteDialect({ database: _db });
`;
	}
}

export { dbMigrateCommand as command };

export function runDrizzleKit(cwd: string, args: string[]): Promise<number> {
	return new Promise((resolveP) => {
		const cmd = "bunx";
		logger.info(`$ ${cmd} drizzle-kit ${args.join(" ")}`);
		const child = spawn(cmd, ["drizzle-kit", ...args], {
			cwd,
			stdio: "inherit",
			shell: process.platform === "win32",
		});
		child.on("exit", (code) => resolveP(code ?? 0));
		child.on("error", (err) => {
			logger.error(`failed to spawn drizzle-kit: ${err.message}`);
			resolveP(1);
		});
	});
}

/**
 * Run a tiny inline script that opens the Drizzle service and prints
 * applied migrations. Used when the user runs `nx migrate --status`
 * and we don't have a full app boot context.
 */
async function runStatus(
	cwd: string,
	folder: string,
	dialect: string,
	configUrl: string = "",
): Promise<number> {
	if (!existsSync(folder)) {
		logger.warn(`migrations folder not found: ${folder}`);
		return 0;
	}
	const url = readEnvUrl(dialect) ?? configUrl;
	if (!url) {
		logger.error(
			`could not read ${dialect} URL from environment. Set DATABASE_URL or NEXUS_DB_URL.`,
		);
		return 1;
	}
	const script = `
import { DrizzleService } from '@nexusts/drizzle';

const url = ${JSON.stringify(url)};
const dialect = ${JSON.stringify(dialect)};
const folder = ${JSON.stringify(folder)};

const cfg = { dialect, connection: { url }, schema: dialect === 'postgres' ? 'public' : undefined };
const svc = new DrizzleService(cfg);
await svc.open();
const applied = await svc.appliedMigrations();
console.log(JSON.stringify({ total: applied.length, applied }, null, 2));
await svc.close();
`;
	const tmpFile = resolve(cwd, ".nx-migrate-status.mjs");
	await import("node:fs/promises").then((m) =>
		m.writeFile(tmpFile, script, "utf-8"),
	);
	try {
		const code = await new Promise<number>((resP) => {
			const child = spawn("bun", [tmpFile], {
				cwd,
				stdio: "inherit",
				shell: process.platform === "win32",
			});
			child.on("exit", (c) => resP(c ?? 0));
			child.on("error", () => resP(1));
		});
		return code;
	} finally {
		await import("node:fs/promises").then((m) =>
			m.unlink(tmpFile).catch(() => {}),
		);
	}
}

function readEnvUrl(dialect: string): string | null {
	const url =
		process.env.DATABASE_URL ??
		process.env.NEXUS_DB_URL ??
		(dialect === "postgres"
			? process.env.POSTGRES_URL
			: dialect === "mysql"
				? process.env.MYSQL_URL
				: dialect.includes("sqlite")
					? process.env.SQLITE_FILENAME
					: null);
	return url ?? null;
}


export default dbMigrateCommand;
