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
import { flagBool, logger, select } from "../core/index.js";
import { ensureDirectories, computeDeps, buildPackageJson, generateProjectFiles } from "../core/index.js";

const VALID_OPTIONS = {
	style: ["nest", "adonis", "functional"],
	view: ["rendu", "edge", "eta", "inertia", "none"],
	orm: ["drizzle", "prisma", "kysely", "none"],
	db: ["bun-sqlite", "node-sqlite", "libsql", "postgres", "mysql", "none"],
	frontend: ["react", "vue", "svelte", "solid"],
} as const;

async function resolveOpt(
	flags: Record<string, unknown>,
	key: string,
	valid: readonly string[],
	defaultVal: string,
	interactive: boolean,
): Promise<string> {
	const flagVal = flags[key] as string | undefined;
	if (flagVal) {
		if (valid.includes(flagVal as any)) return flagVal;
		if (!interactive) {
			logger.error(`Invalid --${key} "${flagVal}". Valid values: ${valid.join(", ")}`);
			process.exit(1);
		}
		logger.warn(`"${flagVal}" is not valid for --${key}. Please choose from the list.`);
	}
	const label = key === "style" ? "Routing style" as const
		: key === "view" ? "View engine" as const
		: key === "orm" ? "ORM driver" as const
		: key === "db" ? "Database driver" as const
		: "Inertia frontend" as const;
	// Loop until the user provides a valid value (interactive only).
	for (;;) {
		const answer = await select(label, [...valid], { default: defaultVal });
		if (valid.includes(answer as any)) return answer;
		logger.warn(`"${answer}" is not valid. Please choose from: ${valid.join(", ")}`);
	}
}

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
		{ name: "orm", description: "ORM driver (drizzle|prisma|kysely|none)" },
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

		const routing = await resolveOpt(ctx.flags, "style", VALID_OPTIONS.style, "nest", interactive);
		const view = await resolveOpt(ctx.flags, "view", VALID_OPTIONS.view, "rendu", interactive);
		const orm = await resolveOpt(ctx.flags, "orm", VALID_OPTIONS.orm, "drizzle", interactive);
		const db = await resolveOpt(ctx.flags, "db", VALID_OPTIONS.db, "bun-sqlite", interactive);
		const frontend = await resolveOpt(ctx.flags, "frontend", VALID_OPTIONS.frontend, "react", interactive);
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
    "emitDecoratorMetadata": true,
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
		writeFileSync(resolve(target, "package.json"), JSON.stringify(pkgJson, null, 2) + "\n");

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
