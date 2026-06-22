/**
 * `nx init [dir]` — scaffold NexusJS into the current (or target) directory.
 *
 * Unlike `nx new <name>` — which requires a fresh, empty directory —
 * `nx init` is non-destructive: it skips files that already exist,
 * preserves the user's existing `package.json` (only adding the
 * `nexusjs` dependency if missing), and merges its `tsconfig.json`
 * additions into the user's existing config.
 *
 * The matching pattern from other ecosystems:
 *   - `bun init` / `npm init`  → init in the current directory
 *   - `cargo init`             → init in the current directory
 *   - `nx new <name>`          → create a fresh project in a new dir
 *
 * Typical use case: the user already ran `bun init` (or has an
 * existing app) and now wants to add NexusJS to it without losing
 * their existing setup.
 *
 *   $ bun init
 *   $ bun add nexusjs
 *   $ nx init
 *   $ bun run dev
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

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Command, CommandContext } from "../core/index.js";
import { flagBool, logger, render, select } from "../core/index.js";
import { parseJsonLoose } from "../core/loose-json.js";
import { templates } from "../templates/index.js";

type WriteMode = "write" | "skip" | "merge-pkg" | "merge-tsconfig";

interface PlanEntry {
	path: string;
	mode: WriteMode;
}

export const initCommand: Command = {
	name: "init",
	aliases: ["i"],
	summary: "Initialize nx.config.ts + app scaffold in the current directory",
	description:
		"Non-destructive scaffold: adds nx.config.ts, app/*, and merges NexusJS into the existing package.json and tsconfig.json. Skips files that already exist (unless --force).",
	examples: [
		"nx init",
		"nx init ./my-existing-app",
		"nx init --style nest --view inertia --orm drizzle --db bun-sqlite",
		"nx init --force",
	],
	flags: [
		{ name: "target", description: "Target directory (default: cwd)" },
		{
			name: "style",
			description: "Routing style (nest|adonis|functional|mixed)",
		},
		{ name: "view", description: "View engine (rendu|edge|eta|inertia|none)" },
		{ name: "orm", description: "ORM driver (drizzle|prisma|kysely|none)" },
		{
			name: "db",
			description:
				"Database driver (bun-sqlite|node-sqlite|libsql|postgres|mysql|none)",
		},
		{
			name: "frontend",
			description: "Inertia frontend (react|vue|svelte|solid)",
		},
		{ name: "no-ssr", description: "Disable Inertia SSR" },
		{ name: "force", description: "Overwrite files that already exist" },
		{ name: "no-interaction", description: "Disable interactive prompts" },
	],
	async run(ctx: CommandContext): Promise<number> {
		const interactive = !flagBool(ctx.flags, "no-interaction", false);
		const force = flagBool(ctx.flags, "force", false);
		const target = resolve(
			ctx.cwd,
			(ctx.flags["target"] as string | undefined) ?? ".",
		);

		if (!existsSync(target)) {
			logger.error(`Target directory does not exist: ${target}`);
			logger.info(
				`Run \`nx new <name>\` to create a fresh project, or \`mkdir -p ${target}\` first.`,
			);
			return 1;
		}

		// Interactive prompts (only if not provided via flags and interactive mode)
		const routing =
			(ctx.flags["style"] as string | undefined) ??
			(await select("Routing style", ["nest", "adonis", "functional"], {
				interactive,
				default: "nest",
			}));
		const view =
			(ctx.flags["view"] as string | undefined) ??
			(await select("View engine", ["rendu", "edge", "eta", "inertia", "none"], {
				interactive,
				default: "rendu",
			}));
		const orm =
			(ctx.flags["orm"] as string | undefined) ??
			(await select("ORM driver", ["drizzle", "prisma", "kysely", "none"], {
				interactive,
				default: "drizzle",
			}));
		const db =
			(ctx.flags["db"] as string | undefined) ??
			(await select(
				"Database driver",
				["bun-sqlite", "node-sqlite", "libsql", "postgres", "mysql", "none"],
				{
					interactive,
					default: "bun-sqlite",
				},
			));
		const frontend =
			(ctx.flags["frontend"] as string | undefined) ??
			(await select("Inertia frontend", ["react", "vue", "svelte", "solid"], {
				interactive,
				default: "react",
			}));
		const ssr = !flagBool(ctx.flags, "no-ssr", false);

		// Build the plan: which files to write / skip / merge
		const plan: PlanEntry[] = [
			{ path: "nx.config.ts", mode: "write" },
			{ path: "package.json", mode: "merge-pkg" },
			{ path: "tsconfig.json", mode: "merge-tsconfig" },
			{ path: "public/.gitkeep", mode: "write" },
			{ path: "resources/views/welcome.html", mode: "write" },
			{ path: ".env", mode: "skip" },
			{ path: ".env.local", mode: "skip" },
			{ path: ".gitignore", mode: "skip" },
			{ path: "app/main.ts", mode: "write" },
			{ path: "app/app.module.ts", mode: "write" },
			{ path: "app/controllers/home.controller.ts", mode: "write" },
			{ path: "README.md", mode: "write" },
		];

		const created: string[] = [];
		const skipped: string[] = [];
		const merged: string[] = [];

		// Ensure directories exist
		mkdirSync(resolve(target, "app/controllers"), { recursive: true });
		mkdirSync(resolve(target, "public"), { recursive: true });
		mkdirSync(resolve(target, "resources/views"), { recursive: true });

		for (const entry of plan) {
			const abs = resolve(target, entry.path);
			const exists = existsSync(abs);

			if (entry.mode === "merge-pkg") {
				// Always merge: never clobber an existing package.json.
				// If missing, create a minimal one.
				if (exists) {
					mergePackageJson(abs, {
						nexusjs: "*",
						"reflect-metadata": "^0.2.2",
						hono: "^4.6.0",
						zod: "^3.23.8",
					});
					merged.push(entry.path);
				} else {
					writeFileSync(
						abs,
						JSON.stringify(
							{
								name: target.split("/").pop() ?? "nexus-app",
								version: "0.1.0",
								type: "module",
								private: true,
								scripts: {
									dev: "bun --hot app/main.ts",
									build: "bun run build.ts",
									start: "bun app/main.ts",
									test: "vitest",
									nx: "nx",
								},
								dependencies: {
									nexusjs: "*",
									"reflect-metadata": "^0.2.2",
									hono: "^4.6.0",
									zod: "^3.23.8",
								},
							},
							null,
							2,
						),
					);
					created.push(entry.path);
				}
				continue;
			}

			if (entry.mode === "merge-tsconfig") {
				// Always merge: never clobber an existing tsconfig.json.
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

			const content = renderContent(entry.path, {
				routing,
				view,
				viewPaths: view === "none" ? "" : "resources/views",
				orm,
				dbDriver: db,
				dbUrl: db === "bun-sqlite" || db === "node-sqlite" ? "app.db" : "",
				inertiaFrontend: frontend,
				inertiaSSR: ssr,
				inertiaVersion: "1.0.0",
				targetName: target.split("/").pop() ?? "nexus-app",
			});
			writeFileSync(abs, content);
			created.push(entry.path);
		}

		// Report
		logger.success(`initialized NexusJS in ${target}`);
		logger.blank();
		if (created.length) {
			logger.heading("Created");
			for (const f of created) logger.info(`  + ${f}`);
		}
		if (merged.length) {
			logger.heading("Merged into existing files");
			for (const f of merged) logger.info(`  ~ ${f}`);
		}
		if (skipped.length) {
			logger.heading("Skipped (already exist; use --force to overwrite)");
			for (const f of skipped) logger.info(`  - ${f}`);
		}
		logger.blank();
		logger.heading("Next steps");
		logger.info(`  cd ${target === ctx.cwd ? "." : target}`);
		logger.info(`  bun install`);
		logger.info(`  bun run dev`);
		logger.blank();

		return 0;
	},
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface RenderCtx {
	routing: string;
	view: string;
	viewPaths: string;
	orm: string;
	dbDriver: string;
	dbUrl: string;
	inertiaFrontend: string;
	inertiaSSR: boolean;
	inertiaVersion: string;
	targetName: string;
	// Index signature so RenderCtx is assignable to RenderObject.
	[key: string]: string | number | boolean | undefined | null;
}

function renderContent(path: string, ctx: RenderCtx): string {
	switch (path) {
		case "nx.config.ts":
			return render(templates.project["nx.config.ts"], ctx);
		case "public/.gitkeep":
			return "";
		case "resources/views/welcome.html":
			return `<h1>Welcome to ${ctx.targetName}</h1>\n<p>This is a sample Rendu template.</p>\n<p>Founded <?= year ?>.</p>\n`;
		case ".gitignore":
			return `# NexusJS
node_modules/
app.db
*.db
.env.local
dist/
`;
		case ".env":
			return `# ──────────────────────────────────────────────────────
# NexusJS — Environment Variables (committed to git)
#
# Shared defaults for all environments. Override locally via
# .env.local (gitignored) or by environment via .env.{NODE_ENV}
# (e.g. .env.production, .env.development).
#
# Uncomment the database config for your driver:
# ──────────────────────────────────────────────────────

# ── App ──
NODE_ENV=development
PORT=3000

# ── Session secret (REQUIRED) ──
# Generate with: openssl rand -base64 32
SESSION_SECRET=change-me-in-production

# ── Database: SQLite (default, zero config) ──
DATABASE_URL=app.db

# ── Database: PostgreSQL ──
# DATABASE_URL=postgres://user:password@localhost:5432/myapp

# ── Database: MySQL ──
# DATABASE_URL=mysql://user:password@localhost:3306/myapp

# ── Better Auth (if using nexusjs/auth) ──
# BETTER_AUTH_SECRET=
# BETTER_AUTH_URL=http://localhost:3000
`;
		case ".env.local":
			return `# ──────────────────────────────────────────────────────
# NexusJS — Local Overrides (DO NOT COMMIT to git)
#
# This file is gitignored. Use it for secrets and local
# configuration that should never be checked in.
# ──────────────────────────────────────────────────────

# Override any value from .env here:
# DATABASE_URL=postgres://user:password@localhost:5432/myapp
# SESSION_SECRET=my-local-secret
`;
		case "app/main.ts":
			return `import 'reflect-metadata';
import { Application } from 'nexusjs';
import { StaticModule } from 'nexusjs/static';
import { AppModule } from './app.module.js';

const app = new Application(AppModule);
// Serve ./public files under /static/*
app.server.app.use('/static/*', StaticModule.mount({ root: './public', prefix: '/static' }));

await app.listen(3000);
console.log('[nexusjs] Listening on http://localhost:3000');
`;
		case "app/app.module.ts":
			return `import { Module } from 'nexusjs';
import { HomeController } from './controllers/home.controller.js';

@Module({
  imports: [],
  controllers: [HomeController],
})
export class AppModule {}
`;
		case "app/controllers/home.controller.ts":
			return `import { Controller, Get } from 'nexusjs';

@Controller('/')
export class HomeController {
  @Get('/')
  index() {
    return {
      view: 'welcome.html',
      data: { year: new Date().getFullYear() },
    };
  }
}
`;
		case "README.md":
			return `# ${ctx.targetName}

A Nexus project.

## Run

\`\`\`bash
bun install
bun run dev
\`\`\`

## Scaffolding

\`\`\`bash
bunx nx make:crud Post
\`\`\`
`;
		default:
			throw new Error(`No render template for: ${path}`);
	}
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
    "types": ["bun-types"]
  },
  "include": ["app/**/*.ts", "nx.config.ts"]
}
`;
}

/**
 * Merge NexusJS fields into an existing package.json. Preserves all
 * existing fields; only adds what's missing.
 */
function mergePackageJson(path: string, additions: Record<string, string>): void {
	const raw = readFileSync(path, "utf8");
	const pkg = parseJsonLoose<Record<string, unknown>>(raw);
	let changed = false;

	// Ensure type: "module"
	if (!pkg["type"]) {
		pkg["type"] = "module";
		changed = true;
	}

	// Ensure private: true
	if (!pkg["private"]) {
		pkg["private"] = true;
		changed = true;
	}

	// Merge scripts (only add missing ones, never overwrite)
	const SCRIPTS: Record<string, string> = {
		dev: "bun --hot app/main.ts",
		build: "bun run build.ts",
		start: "bun app/main.ts",
		test: "vitest",
		nx: "nx",
	};
	const existingScripts = (pkg["scripts"] as Record<string, string> | undefined) ?? {};
	for (const [k, v] of Object.entries(SCRIPTS)) {
		if (!(k in existingScripts)) {
			existingScripts[k] = v;
			changed = true;
		}
	}
	if (Object.keys(existingScripts).length > 0) {
		pkg["scripts"] = existingScripts;
	}

	// Merge dependencies
	const deps = (pkg["dependencies"] as Record<string, string> | undefined) ?? {};
	for (const [k, v] of Object.entries(additions)) {
		if (!(k in deps)) {
			deps[k] = v;
			changed = true;
		}
	}
	pkg["dependencies"] = deps;

	if (changed) {
		writeFileSync(path, JSON.stringify(pkg, null, 2) + "\n");
	}
}

/**
 * Merge NexusJS compiler options into an existing tsconfig.json.
 * Preserves all existing fields; only adds what's missing.
 */
function mergeTsconfig(
	path: string,
	additions: Record<string, boolean | string>,
): void {
	const raw = readFileSync(path, "utf8");
	const cfg = parseJsonLoose<{
		compilerOptions?: Record<string, unknown>;
		include?: string[];
	}>(raw);
	const co = (cfg.compilerOptions ?? {}) as Record<string, unknown>;
	let changed = false;
	for (const [k, v] of Object.entries(additions)) {
		if (!(k in co)) {
			co[k] = v;
			changed = true;
		}
	}
	// Also ensure src/**/*.ts and nx.config.ts are in `include`
	const inc = (cfg.include ?? []) as string[];
	if (!inc.includes("app/**/*.ts")) {
		inc.push("app/**/*.ts");
		changed = true;
	}
	if (!inc.includes("nx.config.ts")) {
		inc.push("nx.config.ts");
		changed = true;
	}
	if (changed) {
		cfg.compilerOptions = co;
		cfg.include = inc;
		writeFileSync(path, JSON.stringify(cfg, null, 2) + "\n");
	}
}

export default initCommand;
