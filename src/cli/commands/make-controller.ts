/**
 * `nx make:controller <Name>` — generate a controller file.
 *
 * The template is chosen from `nx.config.ts`'s `routing` field:
 *   - `nest`      → @Controller / @Get / @Post class
 *   - `adonis`    → plain class with methods (registered via route table)
 *   - `functional` → object of Hono-native handlers
 *
 * Usage:
 *   nx make:controller User
 *   nx make:controller Post --style nest --no-service
 */

import { resolve, dirname } from "node:path";
import type { Command, CommandContext } from "../core/index.js";
import { logger, nameVariants, writeFile, render } from "../core/index.js";
import { templates } from "../templates/index.js";

export const makeControllerCommand: Command = {
	name: "make:controller",
	aliases: ["mc", "make-controller"],
	summary: "Generate a controller class",
	description:
		"Generates a controller file under src/app/controllers/. The routing style is read from nx.config.ts.",
	examples: [
		"nx make:controller User",
		"nx make:controller Post --style nest",
		"nx make:controller Webhook --style functional",
	],
	flags: [
		{ name: "style", description: "Override routing style (nest|adonis|functional)" },
		{ name: "no-service", description: "Skip injecting a service into the controller" },
	],
	async run(ctx: CommandContext): Promise<number> {
		const name = ctx.positional[0];
		if (!name) {
			logger.error("Usage: nx make:controller <Name>");
			return 1;
		}

		const variants = nameVariants(name);
		const style = (ctx.flags["style"] as string | undefined) ?? ctx.config.routing;

		if (!["nest", "adonis", "functional"].includes(style)) {
			logger.error(`Unknown style: ${style}. Allowed: nest, adonis, functional.`);
			return 1;
		}

		const skipService = ctx.flags["no-service"] === true;
		const serviceName = `${variants.pascal}Service`;
		const serviceCamel = variants.camel + "Service";

		const tpl = templates.controller[style as keyof typeof templates.controller];
		const code = render(tpl, {
			name: variants.pascal,
			camel: variants.camel,
			kebab: variants.kebab,
			snake: variants.snake,
			pascal: variants.pascal,
			service: serviceName,
			serviceCamel,
		}).replace(
			// Strip the unused service import line if --no-service.
			/import .*\n/g,
			(skipService ? (m: string) =>
				m.includes("services/") ? "" : m : (m: string) => m),
		);

		const out = resolve(
			ctx.cwd,
			ctx.config.paths.controllers,
			`${variants.kebab}.controller.ts`,
		);

		const ok = writeFile(out, code, { skipIfExists: false });
		if (!ok) {
			logger.error(`Refusing to overwrite existing file: ${out}`);
			return 1;
		}

		logger.success(`created ${out}`);
		logger.finger(`edit ${variants.kebab}.controller.ts and add to a module.`);
		return 0;
	},
};

export default makeControllerCommand;