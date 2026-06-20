/**
 * `nx new <name>` — scaffold a new project.
 *
 * Creates a fresh directory with `nx.config.ts`, `package.json`,
 * `tsconfig.json`, `src/app/main.ts`, and a README. Useful as a
 * starting point for kicking off a new app without `bun create`.
 *
 * This is intentionally minimal — it does not run `bun install`. After
 * generation, the user runs `bun install` themselves.
 */

import { resolve } from "node:path";
import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import type { Command, CommandContext } from "../core/index.js";
import { logger, render, prompt, select, flagBool } from "../core/index.js";
import { templates } from "../templates/index.js";

export const newCommand: Command = {
	name: "new",
	aliases: ["n"],
	summary: "Create a new Nexus project",
	description:
		"Generates a new project directory with nx.config.ts, tsconfig, package.json, and a starter src/app/main.ts.",
	examples: [
		"nx new my-app",
		"nx new my-app --style nest --view inertia --orm drizzle --db bun-sqlite",
	],
	flags: [
		{ name: "style", description: "Routing style (nest|adonis|functional|mixed)" },
		{ name: "view",  description: "View engine (rendu|edge|inertia|none)" },
		{ name: "orm",   description: "ORM driver (drizzle|prisma|kysely|none)" },
		{ name: "db",    description: "Database driver (bun-sqlite|node-sqlite|libsql|postgres|mysql|none)" },
		{ name: "frontend", description: "Inertia frontend (react|vue|svelte|solid)" },
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
			(await select("View engine", ["inertia", "rendu", "edge", "none"], {
				interactive,
				default: "inertia",
			}));

		const orm =
			(ctx.flags["orm"] as string | undefined) ??
			(await select("ORM driver", ["drizzle", "prisma", "kysely", "none"], {
				interactive,
				default: "drizzle",
			}));

		const db =
			(ctx.flags["db"] as string | undefined) ??
			(await select("Database driver", ["bun-sqlite", "node-sqlite", "libsql", "postgres", "mysql", "none"], {
				interactive,
				default: "bun-sqlite",
			}));

		const frontend =
			(ctx.flags["frontend"] as string | undefined) ??
			(await select("Inertia frontend", ["react", "vue", "svelte", "solid"], {
				interactive,
				default: "react",
			}));

		const ssr = !flagBool(ctx.flags, "no-ssr", false);

		mkdirSync(resolve(target, "src/app"), { recursive: true });

		const code = render(templates.project["nx.config.ts"], {
			routing,
			view,
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
						dev: "bun --hot src/app/main.ts",
						build: "bun run build.ts",
						start: "bun src/app/main.ts",
						test: "vitest",
						"nx": "nx",
					},
					dependencies: {
						nexus: "*",
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
  "include": ["src/**/*.ts", "nx.config.ts"]
}
`,
		);

		writeFileSync(
			resolve(target, "src/app/main.ts"),
			`import 'reflect-metadata';
import { Application } from 'nexus';
import { AppModule } from './app.module.js';

const app = new Application(AppModule);

await app.listen(3000);
console.log('[nexus] Listening on http://localhost:3000');
`,
		);

		writeFileSync(
			resolve(target, "src/app/app.module.ts"),
			`import { Module } from 'nexus';
import { HomeController } from './controllers/home.controller.js';

@Module({
  controllers: [HomeController],
})
export class AppModule {}
`,
		);

		mkdirSync(resolve(target, "src/app/controllers"), { recursive: true });
		writeFileSync(
			resolve(target, "src/app/controllers/home.controller.ts"),
			`import { Controller, Get } from 'nexus';

@Controller('/')
export class HomeController {
  @Get('/')
  index() {
    return { message: 'Hello, ${name}!' };
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

export default newCommand;