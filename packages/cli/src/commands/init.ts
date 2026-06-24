/**
 * `nx init [dir]` — scaffold NexusTS into the current (or target) directory.
 *
 * Unlike `nx new <name>` — which requires a fresh, empty directory —
 * `nx init` is non-destructive: it skips files that already exist,
 * preserves the user's existing `package.json` (only adding the
 * nexusjs dependency if missing), and merges its `tsconfig.json`
 * additions into the user's existing config.
 *
 * Typical use case: the user already ran `bun init` (or has an
 * existing app) and now wants to add NexusTS to it without losing
 * their existing setup.
 *
 * Flags:
 *   --target <dir>    Scaffold into <dir> instead of the cwd
 *   --style <name>    Routing style (nest|adonis|functional)
 *   --view <name>     View engine (rendu|edge|eta|inertia|none)
 *   --orm <name>      ORM driver (drizzle|prisma|kysely|none)
 *   --db <name>       Database driver (bun-sqlite|node-sqlite|libsql|postgres|mysql|none)
 *   --frontend <name> Inertia frontend (react|vue|svelte|solid)
 *   --no-ssr          Disable Inertia SSR
 *   --force           Overwrite existing files
 *   --no-interaction  Disable interactive prompts
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Command, CommandContext } from "../core/index.js";
import { flagBool, logger, select } from "../core/index.js";
import { ensureDirectories, computeDeps, buildPackageJson, generateProjectFiles } from "../core/index.js";
import { parseJsonLoose } from "../core/index.js";

type WriteMode = "write" | "skip" | "merge-pkg" | "merge-tsconfig";

interface PlanEntry {
	path: string;
	mode: WriteMode;
}

/** Valid options for each interactive prompt. */
const VALID_OPTIONS = {
	style: ["nest", "adonis", "functional"],
	view: ["rendu", "edge", "eta", "inertia", "none"],
	orm: ["drizzle", "prisma", "kysely", "none"],
	db: ["bun-sqlite", "node-sqlite", "libsql", "postgres", "mysql", "none"],
	frontend: ["react", "vue", "svelte", "solid"],
} as const;

/**
 * Resolve an option from flags or interactive prompt.
 * Validates flag values against the allowed list and re-prompts on invalid input.
 */
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
	// Non-interactive returns the default.
	for (;;) {
		const answer = await select(label, [...valid], { default: defaultVal });
		if (valid.includes(answer as any)) return answer;
		logger.warn(`"${answer}" is not valid. Please choose from: ${valid.join(", ")}`);
	}
}

export const initCommand: Command = {
	name: "init",
	aliases: ["i"],
	summary: "Initialize NexusTS in an existing directory",
	description:
		"Scaffolds a new NexusTS project in the current or target directory. Non-destructive: skips existing files, merges package.json and tsconfig.json.",
	examples: [
		"nx init",
		"nx init ./my-app",
		"nx init --style nest --view inertia --orm drizzle --db bun-sqlite",
		"nx init --force",
	],
	flags: [
		{ name: "target", description: "Target directory (default: cwd)" },
		{ name: "style", description: "Routing style (nest|adonis|functional)" },
		{ name: "view", description: "View engine (rendu|edge|eta|inertia|none)" },
		{ name: "orm", description: "ORM driver (drizzle|prisma|kysely|none)" },
		{ name: "db", description: "Database driver (bun-sqlite|node-sqlite|libsql|postgres|mysql|none)" },
		{
			name: "frontend",
			description: "Inertia frontend (react|vue|svelte|solid)",
		},
		{ name: "no-ssr", description: "Disable Inertia SSR" },
		{ name: "force", description: "Overwrite existing files" },
		{ name: "no-interaction", description: "Skip interactive prompts" },
	],
	async run(ctx: CommandContext): Promise<number> {
		const interactive = flagBool(ctx.flags, "interaction", true);
		const force = flagBool(ctx.flags, "force", false);

		const target = resolve(
			ctx.cwd,
			(ctx.flags["target"] as string | undefined) ?? ".",
		);
		const routing = await resolveOpt(ctx.flags, "style", VALID_OPTIONS.style, "nest", interactive);
		const view = await resolveOpt(ctx.flags, "view", VALID_OPTIONS.view, "rendu", interactive);
		const orm = await resolveOpt(ctx.flags, "orm", VALID_OPTIONS.orm, "drizzle", interactive);
		const db = await resolveOpt(ctx.flags, "db", VALID_OPTIONS.db, "bun-sqlite", interactive);
		const frontend = await resolveOpt(ctx.flags, "frontend", VALID_OPTIONS.frontend, "react", interactive);
		const ssr = !flagBool(ctx.flags, "no-ssr", false);
		const name = target.split("/").pop() ?? "nexus-app";
		const dbUrl = db === "bun-sqlite" || db === "node-sqlite" ? "app.db" : "";

		const plan: PlanEntry[] = [
			{ path: "package.json", mode: "merge-pkg" },
			{ path: "tsconfig.json", mode: "merge-tsconfig" },
			{ path: ".env", mode: "skip" },
			{ path: ".env.local", mode: "skip" },
			{ path: ".gitignore", mode: "skip" },
			{ path: "nx.config.ts", mode: "write" },
			{ path: "public/.gitkeep", mode: "write" },
			{ path: "app/main.ts", mode: "write" },
			{ path: "app/app.module.ts", mode: "write" },
			{ path: "app/controllers/home.controller.ts", mode: "write" },
			{ path: "README.md", mode: "write" },
			...view === "inertia"
				? [
						{ path: `resources/js/Pages/Welcome.${frontend === "vue" ? "vue" : "tsx"}`, mode: "write" as const },
						{ path: `resources/js/app.${frontend === "vue" ? "ts" : "tsx"}`, mode: "write" as const },
					]
				: view !== "none"
					? [{ path: "resources/views/welcome.html", mode: "write" as const }]
					: [],
			...(orm === "drizzle" ? [{ path: "drizzle.config.ts", mode: "write" as const }] : []),
		];

		const created: string[] = [];
		const skipped: string[] = [];
		const merged: string[] = [];

		ensureDirectories(target, view);

		for (const entry of plan) {
			const abs = resolve(target, entry.path);
			const exists = existsSync(abs);

			if (entry.mode === "merge-pkg") {
				const { deps, devDeps } = computeDeps(view, orm, db, frontend);
				if (exists) {
					mergePackageJson(abs, deps, devDeps, view, frontend);
					merged.push(entry.path);
				} else {
					const pkgJson = buildPackageJson(name, deps, devDeps, view, frontend);
					writeFileSync(abs, JSON.stringify(pkgJson, null, 2) + "\n");
					created.push(entry.path);
				}
				continue;
			}

			if (entry.mode === "merge-tsconfig") {
				if (exists) {
					mergeTsconfig(abs, {
						experimentalDecorators: true,
						emitDecoratorMetadata: true,
					});
					merged.push(entry.path);
				} else {
					writeFileSync(abs, defaultTsconfig());
					created.push(entry.path);
				}
				continue;
			}

			// Plain write mode
			if (exists && !force) {
				skipped.push(entry.path);
				continue;
			}
			created.push(entry.path);
		}

		// Generate remaining project files via scaffold
		const scaffoldOpts = { target, name, routing, view, orm, db, frontend, ssr, dbUrl };
		const scaffoldFiles = generateProjectFiles(target, scaffoldOpts);
		for (const f of scaffoldFiles) {
			if (!plan.some((p) => p.path === f)) {
				created.push(f);
			}
		}

		// Report
		logger.success(`initialized NexusTS in ${target}`);
		logger.blank();
		if (created.length) logger.heading("Created");
		for (const f of created) logger.info(`  + ${f}`);
		if (merged.length) logger.heading("Merged into existing files");
		for (const f of merged) logger.info(`  ~ ${f}`);
		if (skipped.length) logger.heading("Skipped (already exist; use --force to overwrite)");
		for (const f of skipped) logger.info(`  - ${f}`);
		logger.blank();

		return 0;
	},
};

function mergePackageJson(
	path: string,
	additions: Record<string, string>,
	devAdditions: Record<string, string> = {},
	view?: string,
	frontend?: string,
): void {
	const raw = readFileSync(path, "utf8");
	const pkg = parseJsonLoose<Record<string, unknown>>(raw);
	let changed = false;

	if (!pkg["type"]) { pkg["type"] = "module"; changed = true; }
	if (!pkg["private"]) { pkg["private"] = true; changed = true; }

	const SCRIPTS: Record<string, string> = {
		dev: "bun --hot app/main.ts", build: "bun run build.ts",
		start: "bun app/main.ts", test: "vitest", nx: "nx",
	};
	if (view === "inertia") {
		const ext = frontend === "vue" ? "ts" : "tsx";
		SCRIPTS["build:frontend"] = `bun build ./resources/js/app.${ext} --outdir=./public --target=browser --format=esm --minify`;
		SCRIPTS["dev"] = `bun run build:frontend && bun --hot app/main.ts`;
	}
	const existingScripts = (pkg["scripts"] as Record<string, string> | undefined) ?? {};
	for (const [k, v] of Object.entries(SCRIPTS)) {
		if (!(k in existingScripts)) { existingScripts[k] = v; changed = true; }
	}
	if (Object.keys(existingScripts).length > 0) pkg["scripts"] = existingScripts;

	const deps = (pkg["dependencies"] as Record<string, string> | undefined) ?? {};
	for (const [k, v] of Object.entries(additions)) {
		if (!(k in deps)) { deps[k] = v; changed = true; }
	}
	pkg["dependencies"] = deps;

	if (Object.keys(devAdditions).length > 0) {
		const devDeps = (pkg["devDependencies"] as Record<string, string> | undefined) ?? {};
		for (const [k, v] of Object.entries(devAdditions)) {
			if (!(k in devDeps)) { devDeps[k] = v; changed = true; }
		}
		pkg["devDependencies"] = devDeps;
	}

	if (changed) writeFileSync(path, JSON.stringify(pkg, null, 2) + "\n");
}

function mergeTsconfig(path: string, additions: Record<string, boolean | string>): void {
	const raw = readFileSync(path, "utf8");
	const cfg = parseJsonLoose<{ compilerOptions?: Record<string, unknown>; include?: string[] }>(raw);
	const co = (cfg.compilerOptions ?? {}) as Record<string, unknown>;
	let changed = false;
	for (const [k, v] of Object.entries(additions)) {
		if (!(k in co)) { co[k] = v; changed = true; }
	}
	cfg.compilerOptions = co as Record<string, unknown>;
	const include = cfg.include ?? [];
	for (const g of ["app/**/*.ts", "nx.config.ts"]) {
		if (!include.includes(g)) { include.push(g); changed = true; }
	}
	cfg.include = include;
	if (changed) writeFileSync(path, JSON.stringify(cfg, null, 2) + "\n");
}

function defaultTsconfig(): string {
	return `{
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
`;
}

export default initCommand;
