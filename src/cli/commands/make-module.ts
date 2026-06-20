/**
 * `nx make:module <Name>` — generate a feature module.
 *
 * A module aggregates a controller, service, and (optionally) a
 * repository under a single `@Module({ controllers, providers, exports })`
 * class.
 */

import { resolve } from "node:path";
import type { Command, CommandContext } from "../core/index.js";
import { logger, nameVariants, render, writeFile, flagBool } from "../core/index.js";
import { templates } from "../templates/index.js";

export const makeModuleCommand: Command = {
	name: "make:module",
	aliases: ["mm", "make-module"],
	summary: "Generate a feature module",
	description:
		"Generates a @Module() class that wires a controller + service (+ optional repository) under src/app/modules/.",
	examples: [
		"nx make:module User",
		"nx make:module User --no-controller",
	],
	flags: [
		{ name: "no-controller", description: "Skip including the controller in the module" },
		{ name: "no-service", description: "Skip including the service" },
		{ name: "no-repo", description: "Skip including the repository" },
	],
	async run(ctx: CommandContext): Promise<number> {
		const name = ctx.positional[0];
		if (!name) {
			logger.error("Usage: nx make:module <Name>");
			return 1;
		}

		const variants = nameVariants(name);
		const hasController = !flagBool(ctx.flags, "no-controller", false);
		const hasService = !flagBool(ctx.flags, "no-service", false);
		const hasRepo = !flagBool(ctx.flags, "no-repo", false) && ctx.config.orm !== "none";

		const code = render(templates.module, {
			name: variants.pascal,
			kebab: variants.kebab,
			controller: `${variants.pascal}Controller`,
			service: `${variants.pascal}Service`,
			repository: `${variants.pascal}Repository`,
			hasService,
			hasRepo,
		});

		const out = resolve(
			ctx.cwd,
			ctx.config.paths.modules,
			`${variants.kebab}.module.ts`,
		);

		writeFile(out, code);
		logger.success(`created ${out}`);
		logger.finger(`add ${variants.pascal}Module to AppModule.imports.`);
		return 0;
	},
};

export default makeModuleCommand;