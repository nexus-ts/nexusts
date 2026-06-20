/**
 * `nx make:middleware <Name>` — generate a middleware class.
 */

import { resolve } from "node:path";
import type { Command, CommandContext } from "../core/index.js";
import { logger, nameVariants, render, writeFile } from "../core/index.js";
import { templates } from "../templates/index.js";

export const makeMiddlewareCommand: Command = {
	name: "make:middleware",
	aliases: ["mwm", "make-middleware"],
	summary: "Generate a middleware class",
	description:
		"Generates an @Injectable() middleware class with a `handle(c, next)` method.",
	examples: [
		"nx make:middleware Auth",
		"nx make:middleware RateLimit",
	],
	async run(ctx: CommandContext): Promise<number> {
		const name = ctx.positional[0];
		if (!name) {
			logger.error("Usage: nx make:middleware <Name>");
			return 1;
		}

		const variants = nameVariants(name);
		const code = render(templates.middleware, {
			name: variants.pascal,
		});

		const out = resolve(
			ctx.cwd,
			ctx.config.paths.middleware,
			`${variants.kebab}.middleware.ts`,
		);

		writeFile(out, code);
		logger.success(`created ${out}`);
		logger.finger(`register with: app.server.app.use('*', new ${variants.pascal}Middleware().handle)`);
		return 0;
	},
};

export default makeMiddlewareCommand;