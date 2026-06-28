/**
 * `nx make:model <Name>` — generate a model (table schema).
 *
 * Supports three ORMs via `nx.config.ts`'s `orm` field:
 *   - drizzle  → Drizzle table definition (dialect-aware)
 *   - kysely   → table interface + typed repository
 *   - kysely   → table interface + typed repository
 *
 * For Drizzle, the `--dialect` flag selects the right import path and
 * column types: postgres | mysql | sqlite | d1. Default
 * is `sqlite` (the typical Bun + local-dev setup).
 *
 * Columns are read from the optional `--columns` flag as a comma-separated
 * list of `name:type` pairs:
 *
 *   nx make:model User --columns "name:text,email:text,bio:text"
 *   nx make:model Post --orm drizzle --dialect postgres --columns "title:text,body:text,published:boolean"
 */

import { resolve } from "node:path";
import type { Command, CommandContext } from "../core/index.js";
import {
	flagList,
	logger,
	nameVariants,
	render,
	writeFile,
} from "../core/index.js";
import { templates } from "../templates/index.js";
import {
	isValidDialect,
	mapDrizzleType,
	renderDrizzleDialect,
} from "../templates/model/drizzle-dialect.js";

export const makeModelCommand: Command = {
	name: "make:model",
	aliases: ["mmodel", "make-model"],
	summary: "Generate a model (table schema)",
	description:
		"Generates a model file under app/models/. The template is chosen from nx.config.ts's `orm` field (drizzle|kysely). For drizzle, use --dialect to pick the import path.",
	examples: [
		"nx make:model User",
		'nx make:model User --columns "name:text,email:text"',
		"nx make:model User --orm drizzle --dialect postgres",
		"nx make:model Post --orm drizzle --dialect postgres --columns 'title:text,body:text,published:boolean'",
	],
	flags: [
		{
			name: "columns",
			description: "Comma-separated `name:type` pairs (default: title:text)",
		},
		{
			name: "orm",
			description: "Override ORM driver (drizzle|kysely)",
		},
		{
			name: "dialect",
			description:
				"Drizzle dialect (postgres|mysql|sqlite|d1). Default: sqlite",
		},
	],
	async run(ctx: CommandContext): Promise<number> {
		const name = ctx.positional[0];
		if (!name) {
			logger.error(
				"Usage: nx make:model <Name> [--columns name:type,...] [--dialect ...]",
			);
			return 1;
		}

		const orm = (ctx.flags.orm as string | undefined) ?? ctx.config.orm;
		if (orm !== "drizzle" && orm !== "kysely") {
			logger.error(
				`Unsupported ORM: ${orm}. Allowed: drizzle, kysely. Use --orm or set "orm" in nx.config.ts.`,
			);
			return 1;
		}

		const variants = nameVariants(name);
		const tableName = variants.pluralSnake;

		// Parse --columns. Default to a single `title:text` column.
		const colsFlag = flagList(ctx.flags, "columns");
		const columns = colsFlag.length > 0 ? colsFlag : ["title:text"];
		const columnLines = renderColumns(
			columns,
			orm,
			ctx.flags.dialect as string | undefined,
		);
		

		let code: string;
		if (orm === "drizzle") {
			const dialect =
				(ctx.flags.dialect as string | undefined) ??
				ctx.config.dialect ??
				"sqlite";
			if (!isValidDialect(dialect)) {
				logger.error(
					`Unsupported drizzle dialect: ${dialect}. Allowed: postgres, mysql, sqlite, d1.`,
				);
				return 1;
			}
			code = renderDrizzleDialect(dialect);
			code = render(code, {
				name: variants.pascal,
				camel: variants.camel,
				kebab: variants.kebab,
				snake: variants.snake,
				tableName,
				columns: columnLines,
			});
		} else {
			const tpl = templates.model[orm as "kysely"];
			code = render(tpl, {
				name: variants.pascal,
				camel: variants.camel,
				kebab: variants.kebab,
				snake: variants.snake,
				tableName,
				columns: columnLines,
			});
		}

		const out = resolve(
			ctx.cwd,
			ctx.config.paths.models,
			`${variants.kebab}.model.ts`,
		);

		writeFile(out, code);
		logger.success(`created ${out}`);
		logger.finger(
			`run \`nx make:migration create_${tableName}_table\` to scaffold a migration.`,
		);
		if (orm === "drizzle") {
			logger.finger(
				`run \`nx migrate\` to apply pending migrations to the database.`,
			);
		}
		return 0;
	},
};

function renderColumns(
	cols: string[],
	orm: "drizzle" | "kysely",
	dialect: string | undefined,
): string {
	// `cols` may contain comma-separated entries (e.g. `--columns "a:text,b:int"`).
	const flat = cols
		.flatMap((c) => c.split(","))
		.map((c) => c.trim())
		.filter(Boolean);
	return flat
		.map((col) => {
			const [colName, colType = "text"] = col.split(":");
			const tsName = toCamel(colName);
			switch (orm) {
				case "drizzle": {
					const d = (dialect ?? "sqlite") as
						| "postgres"
						| "mysql"
						| "sqlite"
						| "sqlite"
						| "d1";
					const helper = mapDrizzleType(d, colType);
					return `  ${tsName}: ${helper}('${colName}'),`;
				}
				case "kysely": {
					const tsType = colType === "text" ? "string" : colType;
					return `  ${colName}: ${tsType},`;
				}
				default:
					return `  ${colName}: ${colType},`;
			}
		})
		.join("\n");
}

function toCamel(s: string): string {
	return s.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
}

export default makeModelCommand;
