/**
 * `nx make:service <Name>` — generate a service class.
 */

import { resolve } from "node:path";
import type { Command, CommandContext } from "../core/index.js";
import { logger, nameVariants, render, writeFile } from "../core/index.js";
import { templates } from "../templates/index.js";

export const makeServiceCommand: Command = {
	name: "make:service",
	aliases: ["ms", "make-service"],
	summary: "Generate a service class",
	description:
		"Generates an @Injectable() service under src/app/services/. If the project's ORM is configured, the service constructor takes a repository.",
	examples: [
		"nx make:service User",
		"nx make:service Order --no-repo",
	],
	flags: [
		{ name: "no-repo", description: "Skip injecting a repository (no ORM dependency)" },
	],
	async run(ctx: CommandContext): Promise<number> {
		const name = ctx.positional[0];
		if (!name) {
			logger.error("Usage: nx make:service <Name>");
			return 1;
		}

		const variants = nameVariants(name);
		const hasRepo = ctx.flags["no-repo"] !== true && ctx.config.orm !== "none";
		const repository = `${variants.pascal}Repository`;
		const repositoryCamel = variants.camel + "Repository";

		const code = render(templates.service, {
			name: variants.pascal,
			camel: variants.camel,
			kebab: variants.kebab,
			hasRepo,
			repository,
			repositoryCamel,
		});

		const out = resolve(
			ctx.cwd,
			ctx.config.paths.services,
			`${variants.kebab}.service.ts`,
		);

		writeFile(out, code);
		logger.success(`created ${out}`);
		return 0;
	},
};

export default makeServiceCommand;