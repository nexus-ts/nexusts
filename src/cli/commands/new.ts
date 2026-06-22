/**
 * `nx new <name>` — scaffold a new project.
 *
 * Creates a fresh directory with `nx.config.ts`, `package.json`,
 * `tsconfig.json`, `app/main.ts`, and a README. Useful as a
 * starting point for kicking off a new app without `bun create`.
 *
 * This is intentionally minimal — it does not run `bun install`. After
 * generation, the user runs `bun install` themselves.
 */

import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Command, CommandContext } from "../core/index.js";
import { flagBool, logger, render, select } from "../core/index.js";
import { templates } from "../templates/index.js";

export const newCommand: Command = {
	name: "new",
	aliases: ["n"],
	summary: "Create a new Nexus project",
	description:
		"Generates a new project directory with nx.config.ts, tsconfig, package.json, and a starter app/main.ts.",
	examples: [
		"nx new my-app",
		"nx new my-app --style nest --view rendu --orm drizzle --db bun-sqlite",
	],
	flags: [
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
		{ name: "no-interaction", description: "Disable interactive prompts" },
	],
	async run(ctx: CommandContext): Promise<number> {
		const name = ctx.positional[0];
		if (!name) {
			logger.error("Usage: nx new <project-name>");
			return 1;
		}

		const interactive = !flagBool(ctx.flags, "no-interaction", false);
		const target = resolve(ctx.cwd, name);

		if (existsSync(target)) {
			logger.error(`Directory already exists: ${target}`);
			return 1;
		}

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

		mkdirSync(resolve(target, "app"), { recursive: true });
		mkdirSync(resolve(target, "public"), { recursive: true });
		mkdirSync(resolve(target, "resources/views"), { recursive: true });

		writeFileSync(resolve(target, "public/.gitkeep"), "");

		writeFileSync(
			resolve(target, "resources/views/welcome.html"),
			`<h1>Welcome to ${name}</h1>\n<p>This is a sample Rendu template.</p>\n<p>Founded <?= year ?>.</p>\n`,
		);

		writeFileSync(resolve(target, ".env"), generateEnvFile());
		writeFileSync(resolve(target, ".env.local"), generateEnvLocalFile());
		writeFileSync(resolve(target, ".gitignore"), generateGitIgnore());

		const code = render(templates.project["nx.config.ts"], {
			routing,
			view,
			viewPaths: view === "none" ? "" : "resources/views",
			orm,
			dbDriver: db,
			dbUrl: db === "bun-sqlite" || db === "node-sqlite" ? "app.db" : "",
			inertiaFrontend: frontend,
			inertiaSSR: ssr,
			inertiaVersion: "1.0.0",
		});
		writeFileSync(resolve(target, "nx.config.ts"), code);

		writeFileSync(
			resolve(target, "package.json"),
			JSON.stringify(
				{
					name,
					version: "0.1.0",
					type: "module",
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
    "types": ["bun-types"]
  },
  "include": ["app/**/*.ts", "nx.config.ts"]
}
`,
		);

		writeFileSync(
			resolve(target, "app/main.ts"),
			`import 'reflect-metadata';
import { Application } from 'nexusjs';
import { StaticModule } from 'nexusjs/static';
import { AppModule } from './app.module.js';

const app = new Application(AppModule);
// Serve ./public files under /static/*
app.server.app.use('/static/*', StaticModule.mount({ root: './public', prefix: '/static' }));

await app.listen(3000);
console.log('[nexusjs] Listening on http://localhost:3000');
`,
		);

		writeFileSync(
			resolve(target, "app/app.module.ts"),
			`import { Module } from 'nexusjs';
import { HomeController } from './controllers/home.controller.js';

@Module({
  imports: [],
  controllers: [HomeController],
})
export class AppModule {}
`,
		);

		mkdirSync(resolve(target, "app/controllers"), { recursive: true });
		writeFileSync(
			resolve(target, "app/controllers/home.controller.ts"),
			`import { Controller, Get } from 'nexusjs';

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
`,
		);

		writeFileSync(
			resolve(target, "README.md"),
			`# ${name}

A new Nexus project.

## Run

\`\`\`bash
bun install
bun run dev
\`\`\`

## Scaffolding

\`\`\`bash
bunx nx make:crud Post
\`\`\`
`,
		);

		logger.success(`created ${target}`);
		logger.blank();
		logger.heading("Next steps");
		logger.info(`  cd ${name}`);
		logger.info(`  bun install`);
		logger.info(`  bun run dev`);
		logger.blank();

		return 0;
	},
};

/** Generate the default .env file content. */
function generateEnvFile(): string {
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
`;
}

function generateEnvLocalFile(): string {
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
}

function generateGitIgnore(): string {
	return `# NexusJS
node_modules/
app.db
*.db
.env.local
dist/
`;
}

export default newCommand;
