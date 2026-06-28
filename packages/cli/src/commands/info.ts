/**
 * `nx info` — print the resolved project configuration.
 *
 * Useful for debugging the config layer: shows which `nx.config.ts`
 * file was loaded, the resolved config (with env overrides), and the
 * current environment values that affect the CLI.
 */

import { resolve } from "node:path";
import type { Command, CommandContext } from "../core/index.js";
import { colors, logger } from "../core/index.js";

export const infoCommand: Command = {
	name: "info",
	aliases: ["i"],
	summary: "Show project configuration",
	description: "Prints the resolved nx.config.ts plus relevant env vars.",
	async run(ctx: CommandContext): Promise<number> {
		logger.heading("NexusTS CLI — Project Info");

		logger.info(colors.bold("Resolved configuration"));
		logger.blank();
		logger.table([
			["runtime", String(ctx.config.runtime)],
			["routing", String(ctx.config.routing)],
			["view", String(ctx.config.view)],
			["orm", String(ctx.config.orm)],
			["dialect", String(ctx.config.dialect ?? "(none)")],
			["database.driver", String(ctx.config.database.driver)],
			["database.url", String(ctx.config.database.url)],
			["inertia.frontend", String(ctx.config.inertia.frontend)],
			["inertia.ssr", String(ctx.config.inertia.ssr)],
			["inertia.version", String(ctx.config.inertia.version)],
		]);

		logger.blank();
		logger.info(colors.bold("Paths"));
		logger.blank();
		for (const [k, v] of Object.entries(ctx.config.paths)) {
			logger.table([[k, v]]);
		}

		logger.blank();
		logger.info(colors.bold("Environment"));
		logger.blank();
		const envKeys = [
			"NODE_ENV",
			"PORT",
			"NEXUS_DEBUG",
			"NO_COLOR",
			"FORCE_COLOR",
			"NX_RUNTIME",
			"NX_ROUTING",
			"NX_VIEW",
			"NX_ORM",
			"NX_DATABASE_DRIVER",
			"NX_DATABASE_URL",
			"NX_INERTIA_FRONTEND",
			"NX_INERTIA_SSR",
		];
		for (const k of envKeys) {
			const v = process.env[k];
			logger.table([[k, v === undefined ? colors.dim("(unset)") : v]]);
		}

		logger.blank();
		logger.info(colors.bold("Working directory"));
		logger.blank();
		logger.info(`  ${resolve(ctx.cwd)}`);
		logger.blank();

		return 0;
	},
};

export default infoCommand;
