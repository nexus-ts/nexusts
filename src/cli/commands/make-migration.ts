/**
 * `nx make:migration <Name>` — generate a database migration.
 *
 * Filename pattern: `YYYYMMDD_HHmmss_<snake>.sql` (or `.ts` for
 * Drizzle). The file is placed under the configured `paths.migrations`
 * directory.
 */

import { resolve } from "node:path";
import type { Command, CommandContext } from "../core/index.js";
import { logger, nameVariants, render, writeFile } from "../core/index.js";
import { templates } from "../templates/index.js";

export const makeMigrationCommand: Command = {
	name: "make:migration",
	aliases: ["mkm", "make-migration"],
	summary: "Generate a migration file",
	description:
		"Generates a migration under src/app/database/migrations/. The template is chosen from nx.config.ts's `orm` field.",
	examples: [
		"nx make:migration create_users_table",
		"nx make:migration add_email_to_users --orm drizzle",
	],
	flags: [
		{
			name: "columns",
			description: "Comma-separated `name:type` pairs (default: title:text)",
		},
		{ name: "orm", description: "Override ORM driver (drizzle|prisma|kysely)" },
	],
	async run(ctx: CommandContext): Promise<number> {
		const name = ctx.positional[0];
		if (!name) {
			logger.error("Usage: nx make:migration <Name>");
			return 1;
		}

		const orm = (ctx.flags["orm"] as string | undefined) ?? ctx.config.orm;
		const isDrizzle = orm === "drizzle";
		const useGenericSql = orm === "none" || orm === "prisma" || orm === "kysely";

		const variants = nameVariants(name);
		const tableName = inferTableName(name);
		const colsFlag = (ctx.flags["columns"] as string | string[] | undefined);
		const cols = parseColumns(colsFlag ?? "title:text");
		const columns = renderColumns(cols);

		const tpl = isDrizzle ? templates.migration.drizzle : templates.migration.sql;
		const code = render(tpl, {
			name: variants.pascal,
			snake: variants.snake,
			tableName,
			columns,
			timestamp: formatTimestamp(new Date()),
		});

		const filename = `${formatTimestamp(new Date())}_${variants.snake}.${isDrizzle ? "ts" : "sql"}`;
		const out = resolve(ctx.cwd, ctx.config.paths.migrations, filename);

		writeFile(out, code);
		logger.success(`created ${out}`);
		logger.finger(`run \`bunx drizzle-kit migrate\` (or your migration tool).`);
		return 0;
	},
};

function inferTableName(input: string): string {
	// `create_users_table` → `users`; `add_email_to_users` → `users`;
	// `Posts` → `posts`; fallback to the lowercased input.
	const m = /^create_(\w+)_table$/.exec(input);
	if (m) return m[1]!;
	const m2 = /^(?:add|remove|drop|alter)_(\w+)_to_(\w+)$/.exec(input);
	if (m2) return m2[2]!;
	return input.toLowerCase().replace(/s$/, "") + "s";
}

function parseColumns(input: string | string[]): Array<[string, string]> {
	const list = Array.isArray(input) ? input : input.split(",");
	return list
		.map((s) => s.trim())
		.filter(Boolean)
		.map((c) => {
			const [name, type = "text"] = c.split(":");
			return [name!, type];
		});
}

function renderColumns(cols: Array<[string, string]>): string {
	return cols
		.map(([name, type]) => {
			const sqlType = mapType(type);
			const notNull = /^[a-z]/.test(sqlType) ? " NOT NULL" : "";
			return `  ${name} ${sqlType}${notNull},`;
		})
		.join("\n");
}

function mapType(t: string): string {
	switch (t.toLowerCase()) {
		case "text":
		case "string":
			return "TEXT";
		case "int":
		case "integer":
			return "INTEGER";
		case "bool":
		case "boolean":
			return "BOOLEAN";
		case "float":
		case "number":
			return "REAL";
		case "datetime":
		case "timestamp":
		case "date":
			return "INTEGER";  // unix epoch
		default:
			return "TEXT";
	}
}

function formatTimestamp(d: Date): string {
	const pad = (n: number) => String(n).padStart(2, "0");
	return (
		`${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}` +
		`_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`
	);
}

export default makeMigrationCommand;