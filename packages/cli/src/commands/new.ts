/**
 * `nx new <name>` — create a new NexusTS project in a fresh directory.
 *
 * Unlike `nx init` (which merges into existing files), `nx new` requires
 * the target directory to not exist. It creates a complete project from
 * scratch.
 *
 *   nx new my-app
 *   nx new my-app --style nest --view inertia --orm drizzle --db bun-sqlite
 */

import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Command, CommandContext } from "../core/index.js";
import { buildPackageJson, computeDeps, ensureDirectories, flagBool, generateProjectFiles, logger, resolveProjectOption, VALID_PROJECT_OPTIONS } from "../core/index.js";

export const newCommand: Command = {
	name: "new",
	aliases: ["n"],
	summary: "Create a new NexusTS project",
	description:
		"Generates a new project directory with nx.config.ts, tsconfig, package.json, and a starter app/main.ts.",
	examples: [
		"nx new my-app",
		"nx new my-app --view inertia --frontend vue",
	],
	flags: [
		{ name: "style", description: "Routing style (nest|adonis|functional)" },
		{ name: "view", description: "View engine (rendu|edge|eta|inertia|none)" },
		{ name: "orm", description: "ORM driver (drizzle|kysely|none)" },
		{ name: "db", description: "Database driver" },
		{ name: "frontend", description: "Inertia frontend (react|vue|svelte|solid)" },
		{ name: "no-ssr", description: "Disable SSR" },
	],
	async run(ctx: CommandContext): Promise<number> {
		const name = ctx.positional[0];
		if (!name) {
			logger.error("Usage: nx new <name>");
			return 1;
		}

		const interactive = flagBool(ctx.flags, "interaction", true);
		const target = resolve(ctx.cwd, name);

		if (existsSync(target)) {
			logger.error(`Directory "${name}" already exists.`);
			return 1;
		}

		const routing = await resolveProjectOption(ctx.flags, "style", VALID_PROJECT_OPTIONS.style, "nest", interactive);
		const view = await resolveProjectOption(ctx.flags, "view", VALID_PROJECT_OPTIONS.view, "rendu", interactive);
		const orm = await resolveProjectOption(ctx.flags, "orm", VALID_PROJECT_OPTIONS.orm, "drizzle", interactive);
		const db = await resolveProjectOption(ctx.flags, "db", VALID_PROJECT_OPTIONS.db, "bun-sqlite", interactive);
		const frontend = await resolveProjectOption(ctx.flags, "frontend", VALID_PROJECT_OPTIONS.frontend, "react", interactive);
		const ssr = !flagBool(ctx.flags, "no-ssr", false);

		mkdirSync(target, { recursive: true });

		const dbUrl = db === "bun-sqlite" || db === "node-sqlite" ? "app.db" : "";

		ensureDirectories(target, view);

		writeFileSync(
			resolve(target, "tsconfig.json"),
			`{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "experimentalDecorators": true,
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "types": ["@types/bun"]
  },
  "include": ["app/**/*.ts", "nx.config.ts"]
}
`,
		);

		const { deps, devDeps } = computeDeps(view, orm, db, frontend);
		const pkgJson = buildPackageJson(name, deps, devDeps, view, frontend);
		writeFileSync(resolve(target, "package.json"), `${JSON.stringify(pkgJson, null, 2)}\n`);

		const opts = { target, name, routing, view, orm, db, frontend, ssr, dbUrl };
		const files = generateProjectFiles(target, opts);

		logger.success(`created ${name}`);
		for (const f of files) logger.info(`  + ${f}`);
		logger.info(`  + tsconfig.json`);
		logger.info(`  + package.json`);
		logger.blank();
		logger.heading("Next steps");
		logger.info(`  cd ${name}`);
		logger.info(`  bun install`);
		logger.info(`  bun run dev`);
		logger.blank();

		return 0;
	},
};

export default newCommand;
