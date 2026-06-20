/**
 * `nx make:model <Name>` — generate a model (table schema).
 *
 * Supports three ORMs via `nx.config.ts`'s `orm` field:
 *   - drizzle  → `drizzle-orm/sqlite-core` table definition
 *   - prisma   → schema.prisma block + typed repository
 *   - kysely   → table interface + typed repository
 *
 * Columns are read from the optional `--columns` flag as a comma-separated
 * list of `name:type` pairs:
 *
 *   nx make:model User --columns "name:text,email:text,bio:text"
 */

import { resolve } from "node:path";
import type { Command, CommandContext } from "../core/index.js";
import { logger, nameVariants, render, writeFile, flagList } from "../core/index.js";
import { templates } from "../templates/index.js";

export const makeModelCommand: Command = {
	name: "make:model",
	aliases: ["mmodel", "make-model"],
	summary: "Generate a model (table schema)",
	description:
		"Generates a model file under src/app/models/. The template is chosen from nx.config.ts's `orm` field (drizzle|prisma|kysely).",
	examples: [
		"nx make:model User",
		'nx make:model User --columns "name:text,email:text"',
		"nx make:model User --orm drizzle",
	],
	flags: [
		{
			name: "columns",
			description: "Comma-separated `name:type` pairs (default: title:text)",
		},
		{
			name: "orm",
			description: "Override ORM driver (drizzle|prisma|kysely)",
		},
	],
	async run(ctx: CommandContext): Promise<number> {
		const name = ctx.positional[0];
		if (!name) {
			logger.error("Usage: nx make:model <Name> [--columns name:type,...]");
			return 1;
		}

		const orm = (ctx.flags["orm"] as string | undefined) ?? ctx.config.orm;
		if (orm !== "drizzle" && orm !== "prisma" && orm !== "kysely") {
			logger.error(
				`Unsupported ORM: ${orm}. Allowed: drizzle, prisma, kysely. Use --orm or set "orm" in nx.config.ts.`,
			);
			return 1;
		}

		const variants = nameVariants(name);
		const tableName = variants.pluralSnake;

		// Parse --columns. Default to a single `title:text` column.
		const colsFlag = flagList(ctx.flags, "columns");
		const columns = colsFlag.length > 0 ? colsFlag : ["title:text"];
		const columnLines = renderColumns(columns, orm);
		const prismaBlock = renderPrismaBlock(variants.pascal, columns);

		const tpl = templates.model[orm as keyof typeof templates.model];
		const code = render(tpl, {
			name: variants.pascal,
			camel: variants.camel,
			kebab: variants.kebab,
			snake: variants.snake,
			tableName,
			columns: columnLines,
			prismaBlock,
		});

		const out = resolve(
			ctx.cwd,
			ctx.config.paths.models,
			`${variants.kebab}.model.ts`,
		);

		writeFile(out, code);
		logger.success(`created ${out}`);
		logger.finger(`run \`nx make:migration create_${tableName}_table\` to scaffold a migration.`);
		return 0;
	},
};

function renderColumns(cols: string[], orm: "drizzle" | "prisma" | "kysely"): string {
	return cols
		.map((col) => {
			const [colName, colType = "text"] = col.split(":");
			const tsName = toCamel(colName);
			switch (orm) {
				case "drizzle": {
					const tsType = colType === "text" ? "text" : colType;
					const notNull = /^[a-z]+$/.test(tsType) ? ".notNull()" : "";
					return `  ${tsName}: ${tsType}('${colName}')${notNull},`;
				}
				case "kysely": {
					const tsType = colType === "text" ? "string" : colType;
					return `  ${colName}: ${tsType},`;
				}
				case "prisma":
				default:
					return `  ${colName} ${colType},`;
			}
		})
		.join("\n");
}

function renderPrismaBlock(modelName: string, cols: string[]): string {
	const fieldLines = cols
		.map((c) => {
			const [name, type = "String"] = c.split(":");
			return `  ${name.padEnd(16)} ${capitalize(type)}`;
		})
		.join("\n");
	return ` * model ${modelName} {
 *   id          Int      @id @default(autoincrement())
${fieldLines
		.split("\n")
		.map((l) => ` *${l}`)
		.join("\n")}
 *   createdAt   DateTime @default(now())
 *   updatedAt   DateTime @updatedAt
 * }`;
}

function toCamel(s: string): string {
	return s.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
}

function capitalize(s: string): string {
	return s.charAt(0).toUpperCase() + s.slice(1);
}

export default makeModelCommand;