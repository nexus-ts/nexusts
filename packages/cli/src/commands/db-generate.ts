/**
 * `nx db:generate [name]` — generate a new migration file from schema changes.
 *
 * **Drizzle**: Runs `drizzle-kit generate` which compares your schema files
 * (under app/models/*.model.ts) with the database and auto-generates a migration.
 *
 * **Kysely**: Generates a TypeScript migration file with `up()`/`down()`
 * functions for Kysely's built-in Migrator.
 *
 * **Plain SQL** (`--sql`): Generates a raw SQL migration file (any ORM).
 *
 * Examples:
 *   nx db:generate add_users_table
 *   nx db:generate add_posts_table --dialect postgres
 *   nx db:generate --sql                       # raw SQL file
 *
 * See also:
 *   nx db:migrate            — apply pending migrations
 *   nx db:seed               — run database seeds
 *   nx make:migration        — scaffold an EMPTY migration file (manual)
 */

import { resolve } from "node:path";
import type { Command, CommandContext } from "../core/index.js";
import { formatTimestamp, inferTableName, logger, nameVariants, render } from "../core/index.js";
import { templates } from "../templates/index.js";
import { runDrizzleKit } from "./db-migrate.js";

export const dbGenerateCommand: Command = {
	name: "db:generate",
	aliases: ["db:g", "db-generate", "generate-migration"],
	summary: "Generate a new migration from schema changes",
	description:
		"Generates a new migration file. For drizzle: runs drizzle-kit generate. " +
		"For kysely: generates a .ts file with up/down functions. " +
		"Use --sql for a plain SQL file. " +
		"Run after editing your schema files, then apply with `nx db:migrate`.",
	examples: [
		"nx db:generate",
		"nx db:generate add_users_table",
		"nx db:generate add_posts --dialect postgres",
	],
	flags: [
		{
			name: "dialect",
			description:
				"Database dialect (sqlite|postgres|mysql). Reads from nx.config.ts by default.",
		},
		{
			name: "sql",
			description: "Generate a raw SQL file instead of using drizzle-kit",
		},
		{
			name: "orm",
			description: "Override ORM driver (drizzle|kysely)",
		},
	],
	async run(ctx: CommandContext): Promise<number> {
		const name = ctx.positional[0];
		const orm = (ctx.flags.orm as string | undefined) ?? ctx.config.orm;
		const dialect =
			(ctx.flags.dialect as string | undefined) ?? ctx.config.dialect ?? "sqlite";
		const isSql = ctx.flags.sql === true;

		if (isSql) {
			if (!name) {
				logger.error("Usage: nx db:generate <name> --sql");
				return 1;
			}
			logger.info(`Generating raw SQL migration: ${name} (dialect=${dialect})`);
			return runSqlTemplate(ctx.cwd, name, dialect);
		}

		if (orm === "kysely") {
			if (!name) {
				logger.error("Usage: nx db:generate <name> (name is required for Kysely)");
				return 1;
			}
			logger.info(`Generating Kysely migration: ${name}`);
			return runKyselyTemplate(ctx.cwd, name, dialect);
		}

		// Drizzle: resolve drizzle.config.ts path and run drizzle-kit
		const configPath = resolve(ctx.cwd, "drizzle.config.ts");
		const args = ["generate", "--config", configPath];
		if (name) args.push("--name", name);

		logger.info(`Generating migration: ${name} (dialect=${dialect})`);
		return runDrizzleKit(ctx.cwd, args);
	},
};

/**
 * Generate a Kysely migration file (TypeScript with up/down functions).
 */
async function runKyselyTemplate(
	cwd: string,
	name: string,
	_dialect: string,
): Promise<number> {
	const { mkdirSync, writeFileSync } = await import("node:fs");
	const { join } = await import("node:path");
	const migrationsDir = join(cwd, "app", "database", "migrations");
	mkdirSync(migrationsDir, { recursive: true });

	const variants = nameVariants(name);
	const timestamp = formatTimestamp(new Date());
	const filename = `${timestamp}_${variants.snake}.ts`;
	const filepath = join(migrationsDir, filename);

	const tpl = templates.migration.kysely;
	const code = render(tpl, {
		name: variants.pascal,
		snake: variants.snake,
		tableName: inferTableName(name),
		columns: "",
		timestamp,
	});

	writeFileSync(filepath, code);
	logger.success(`created ${filepath}`);
	logger.info("Edit the migration, then run `nx db:migrate` to apply it.");
	return 0;
}

/**
 * Generate a raw SQL migration file (without drizzle-kit).
 */
async function runSqlTemplate(
	cwd: string,
	name: string,
	dialect: string,
): Promise<number> {
	const { mkdirSync, writeFileSync } = await import("node:fs");
	const { join } = await import("node:path");
	const migrationsDir = join(cwd, "app", "database", "migrations");
	mkdirSync(migrationsDir, { recursive: true });

	const timestamp = formatTimestamp(new Date());
	const filename = `${timestamp}_${name.replace(/[^a-z0-9_]+/g, "_")}.sql`;
	const filepath = join(migrationsDir, filename);

	const header = dialect === "postgres" || dialect === "mysql"
		? `-- Migration: ${name}\n-- Dialect: ${dialect}\n-- Generated: ${new Date().toISOString()}\n\n`
		: `-- Migration: ${name}\n-- Dialect: ${dialect} (SQLite)\n-- Generated: ${new Date().toISOString()}\n\n`;

	writeFileSync(filepath, header);
	logger.success(`created ${filepath}`);
	logger.info("Edit the SQL file, then run `nx db:migrate` to apply it.");
	return 0;
}


export default dbGenerateCommand;
