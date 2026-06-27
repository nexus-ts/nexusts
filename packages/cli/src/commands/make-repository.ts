/**
 * `nx make:repository <Name>` — generate a repository class.
 *
 * Adapts to the project's ORM (from nx.config.ts):
 *   - drizzle  → DrizzleRepository (default)
 *   - kysely   → KyselyRepository
 *
 * Requires a model file at app/models/<name>.model.ts.
 */

import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import type { Command, CommandContext } from "../core/index.js";
import { logger, nameVariants, render, writeFile } from "../core/index.js";
import { templates } from "../templates/index.js";

export const makeRepositoryCommand: Command = {
	name: "make:repository",
	aliases: ["mr", "make-repository", "make:repo"],
	summary: "Generate a repository class",
	description:
		"Generates a repository class under app/repositories/. Adapts to the project's ORM (drizzle -> DrizzleRepository, kysely -> KyselyRepository). Requires a model file at app/models/<name>.model.ts.",
	examples: [
		"nx make:repository User",
		"nx make:repository Post",
	],
	flags: [
		{
			name: "orm",
			description: "Override ORM driver (drizzle|kysely)",
		},
	],
	async run(ctx: CommandContext): Promise<number> {
		const name = ctx.positional[0];
		if (!name) {
			logger.error("Usage: nx make:repository <Name>");
			return 1;
		}

		const orm = (ctx.flags.orm as string | undefined) ?? ctx.config.orm;
		const variants = nameVariants(name);
		const repository = `${variants.pascal}Repository`;

		const tpl = orm === "kysely" ? templates.repository.kysely : templates.repository.drizzle;
		const code = render(tpl, {
			name: variants.pascal,
			camel: variants.camel,
			kebab: variants.kebab,
			snake: variants.snake,
			tableName: variants.pluralSnake,
			repository,
		});

		const out = resolve(
			ctx.cwd,
			`${ctx.config.paths.app}/repositories`,
			`${variants.kebab}.repository.ts`,
		);
		mkdirSync(dirname(out), { recursive: true });
		writeFile(out, code);
		logger.success(`created ${out}`);
		return 0;
	},
};

export default makeRepositoryCommand;
