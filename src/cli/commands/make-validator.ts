/**
 * `nx make:validator <Name>` — generate a Zod validation schema (DTO).
 */

import { resolve } from "node:path";
import type { Command, CommandContext } from "../core/index.js";
import { logger, nameVariants, render, writeFile } from "../core/index.js";
import { templates } from "../templates/index.js";

export const makeValidatorCommand: Command = {
	name: "make:validator",
	aliases: ["mv", "make-validator"],
	summary: "Generate a Zod validation schema",
	description:
		"Generates a Zod schema and inferred type under src/app/dto/.",
	examples: [
		"nx make:validator User",
		"nx make:validator CreateOrder",
	],
	async run(ctx: CommandContext): Promise<number> {
		const name = ctx.positional[0];
		if (!name) {
			logger.error("Usage: nx make:validator <Name>");
			return 1;
		}

		const variants = nameVariants(name);
		const code = render(templates.validator, {
			name: variants.pascal,
		});

		const out = resolve(
			ctx.cwd,
			ctx.config.paths.dto,
			`${variants.kebab}.dto.ts`,
		);

		writeFile(out, code);
		logger.success(`created ${out}`);
		return 0;
	},
};

export default makeValidatorCommand;