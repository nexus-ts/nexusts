/**
 * Shared scaffold logic for `nx init` and `nx new`.
 *
 * Both commands generate the same set of files (main.ts, controller,
 * module, Inertia pages, etc.). This module centralises that logic so
 * the two command files only handle flag parsing, prompting, and
 * merge-vs-fresh semantics.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { templates } from "../templates/index.js";
import { render } from "./template.js";

export interface ScaffoldOptions {
	target: string;
	name: string;
	runtime: string;
	routing: string;
	view: string;
	orm: string;
	db: string;
	frontend: string;
	ssr: boolean;
	dbUrl: string;
}

/**
 * Create the directory structure for a new NexusTS project.
 */
export function ensureDirectories(target: string, view: string): void {
	mkdirSync(resolve(target, "app/controllers"), { recursive: true });
	mkdirSync(resolve(target, "app/modules"), { recursive: true });
	mkdirSync(resolve(target, "app/services"), { recursive: true });
	mkdirSync(resolve(target, "app/models"), { recursive: true });
	mkdirSync(resolve(target, "app/repositories"), { recursive: true });
	mkdirSync(resolve(target, "app/dto"), { recursive: true });
	mkdirSync(resolve(target, "public"), { recursive: true });
	if (view === "inertia") {
		mkdirSync(resolve(target, "resources/js/Pages"), { recursive: true });
	} else if (view !== "none") {
		mkdirSync(resolve(target, "resources/views"), { recursive: true });
	}
}

/**
 * Compute dependencies based on project options.
 */
export function computeDeps(
	view: string,
	orm: string,
	db: string,
	frontend: string,
): { deps: Record<string, string>; devDeps: Record<string, string> } {
	const deps: Record<string, string> = {
		"@nexusts/core": "*",
		hono: "^4.6.0",
		zod: "^3.23.8",
	};
	const devDeps: Record<string, string> = {};

	if (orm === "drizzle") {
		deps["@nexusts/drizzle"] = "*";
		deps["drizzle-orm"] = "^0.45.0";
		if (db === "postgres") deps.pg = "^8.13.0";
		if (db === "mysql") deps.mysql2 = "^3.11.0";
		if (db === "sqlite" || db === "sqlite" || db === "sqlite") deps["better-sqlite3"] = "^12.0.0";
		devDeps["drizzle-kit"] = "^0.31.0";
	}
	if (orm === "kysely") {
		deps["@nexusts/kysely"] = "*";
		deps.kysely = "^0.27.0";
	}
	if (view !== "none") {
		deps["@nexusts/static"] = "*";
	}
	deps["@nexusts/view"] = "*";
	if (view === "inertia") {
		if (frontend === "vue") {
			deps["@inertiajs/vue3"] = "^3.0.0";
			deps.vue = "^3.5.0";
		} else {
			deps["@inertiajs/react"] = "^3.0.0";
			deps.react = "^19.0.0";
			deps["react-dom"] = "^19.0.0";
		}
	}
	return { deps, devDeps };
}

/**
 * Build a default package.json object.
 */
export function buildPackageJson(
	name: string,
	deps: Record<string, string>,
	devDeps: Record<string, string>,
	view?: string,
	frontend?: string,
): Record<string, unknown> {
	const scripts: Record<string, string> = {
		dev: "bun --hot app/main.ts",
		build: "bun run build.ts",
		start: "bun app/main.ts",
		test: "vitest",
		nx: "nx",
	};
	if (view === "inertia") {
		const ext = frontend === "vue" ? "ts" : "tsx";
		scripts["build:frontend"] = `bun build ./resources/js/app.${ext} --outdir=./public --target=browser --format=esm --minify`;
		scripts.dev = `bun run build:frontend && bun --hot app/main.ts`;
	}
	const pkg: Record<string, unknown> = {
		name,
		version: "0.1.0",
		type: "module",
		private: true,
		scripts,
		dependencies: deps,
	};
	if (Object.keys(devDeps).length > 0) {
		pkg.devDependencies = devDeps;
	}
	return pkg;
}

/**
 * Generate an nx.config.ts file.
 */
export function generateNxConfig(target: string, opts: ScaffoldOptions): void {
	const code = render(templates.project["nx.config.ts"], {
		runtime: opts.runtime,
		routing: opts.routing,
		view: opts.view,
		viewPaths: opts.view === "none" ? "" : "resources/views",
		orm: opts.orm,
		dbDriver: opts.db,
		dbUrl: opts.dbUrl,
		inertiaFrontend: opts.frontend,
		inertiaSSR: opts.ssr,
		inertiaVersion: "1.0.0",
	});
	writeFileSync(resolve(target, "nx.config.ts"), code);
}

/**
 * Generate a drizzle.config.ts file (only when ORM is drizzle).
 */
export function generateDrizzleConfig(target: string, db: string, dbUrl: string, runtime?: string): void {
	const dialect = db !== "sqlite"
		? db === "postgres" ? "postgresql" : "mysql"
		: runtime === "cloudflare" ? "d1" : "sqlite";
	const code = render(templates.project["drizzle.config.ts"], {
		dialect,
		dbUrl: dbUrl || "app.db",
	});
	writeFileSync(resolve(target, "drizzle.config.ts"), code);
}

function generateEnvFile(): string {
	return `${[
		"# ──────────────────────────────────────────────────────",
		"# NexusTS — Environment Variables (committed to git)",
		"#",
		"# Shared defaults for all environments. Override locally via",
		"# .env.local (gitignored) or by environment via .env.{NODE_ENV}",
		"# (e.g. .env.production, .env.development).",
		"# ──────────────────────────────────────────────────────",
		"",
		"# ── App ──",
		"NODE_ENV=development",
		"PORT=3000",
		"",
		"# ── Session secret (REQUIRED) ──",
		"# Generate with: openssl rand -base64 32",
		"SESSION_SECRET=change-me-in-production",
		"",
		"# ── Database: SQLite (default, zero config) ──",
		"DATABASE_URL=app.db",
		"",
		"# ── Database: PostgreSQL ──",
		"# DATABASE_URL=postgres://user:password@localhost:5432/myapp",
		"",
		"# ── Database: MySQL ──",
		"# DATABASE_URL=mysql://user:password@localhost:3306/myapp",
		"",
		"# ── Better Auth (if using @nexusts/auth) ──",
		"# BETTER_AUTH_SECRET=",
		"# BETTER_AUTH_URL=http://localhost:3000",
	].join("\n")}\n`;
}

function generateEnvLocalFile(): string {
	return `${[
		"# ──────────────────────────────────────────────────────",
		"# NexusTS — Local Overrides (DO NOT COMMIT to git)",
		"#",
		"# This file is gitignored. Use it for secrets and local",
		"# configuration that should never be checked in.",
		"# ──────────────────────────────────────────────────────",
		"",
		"# Override any value from .env here:",
		"# DATABASE_URL=postgres://user:password@localhost:5432/myapp",
		"# SESSION_SECRET=my-local-secret",
	].join("\n")}\n`;
}

function generateGitIgnore(): string {
	return "# NexusTS\nnode_modules/\napp.db\n*.db\n.env.local\ndist/\n";
}

/**
 * Generate all project template files.
 */
export function generateProjectFiles(target: string, opts: ScaffoldOptions): string[] {
	const created: string[] = [];
	const write = (path: string, content: string) => {
		writeFileSync(resolve(target, path), content);
		created.push(path);
	};

	generateNxConfig(target, opts);
	write("public/.gitkeep", "");

	// View files
	if (opts.view === "inertia") {
		if (opts.frontend === "vue") {
			write("resources/js/Pages/Welcome.vue",
				`<template>\n  <main style="font-family: system-ui, sans-serif; max-width: 560px; margin: 2em auto">\n    <h1>Hello, {{ name }}!</h1>\n  </main>\n</template>\n\n<script setup lang="ts">\ndefineProps<{ name: string }>();\n</script>\n`);
			write("resources/js/app.ts",
				`import { createInertiaApp } from "@inertiajs/vue3";\nimport { createApp, h } from "vue";\nimport Welcome from "./Pages/Welcome.vue";\n\ncreateInertiaApp({\n  resolve: (name: string) => {\n    if (name === "Welcome") return Welcome;\n    throw new Error("Unknown page: " + name);\n  },\n  setup({ el, App, props }: any) {\n    createApp({ render: () => h(App, props) }).mount(el);\n  },\n});\n`);
		} else {
			write("resources/js/Pages/Welcome.tsx",
				`import { useState } from "react";\n\nexport default function Welcome({ name }: { name: string }) {\n  const [count, setCount] = useState(0);\n  return (\n    <main style={{ fontFamily: "system-ui, sans-serif", maxWidth: 560, margin: "2em auto" }}>\n      <h1>Hello, {name}!</h1>\n      <p>Counter: <strong>{count}</strong></p>\n      <button onClick={() => setCount((c) => c + 1)} style={{ padding: "0.5em 1em" }}>\n        +1\n      </button>\n    </main>\n  );\n}\n`);
			write("resources/js/app.tsx",
				`import { createInertiaApp } from "@inertiajs/react";\nimport { createRoot } from "react-dom/client";\nimport Welcome from "./Pages/Welcome.js";\n\ncreateInertiaApp({\n  resolve: (name: string) => {\n    if (name === "Welcome") return Welcome;\n    throw new Error("Unknown page: " + name);\n  },\n  setup({ el, App, props }: any) {\n    createRoot(el).render(<App {...props} />);\n  },\n});\n`);
		}
	} else if (opts.view !== "none") {
		write("resources/views/welcome.html",
			`<h1>Welcome to ${opts.name}</h1>\n<p>This is a sample Rendu template.</p>\n<p>Founded <?= year ?>.</p>\n`);
	}

	write(".env", generateEnvFile());
	write(".env.local", generateEnvLocalFile());
	write(".gitignore", generateGitIgnore());

	// app/main.ts
	{
		const hasView = opts.view !== "none";
		const staticMw = hasView
			? `import { StaticModule } from '@nexusts/static';\nconst staticMiddleware = StaticModule.mount({ root: './public', prefix: '/static' });\n`
			: '';
		const staticOpt = hasView ? '\n  middleware: [staticMiddleware],' : '';
		write("app/main.ts",
			`import { Application } from '@nexusts/core';\n${staticMw}import { AppModule } from './app.module.js';\n\nconst app = new Application(AppModule, {\n  logging: true,\n  port: Number(process.env['PORT'] ?? 3000),${staticOpt}\n});\n\nawait app.listen();\nconsole.log('[nexus] Listening on http://localhost:' + (process.env['PORT'] ?? 3000));\n`);
	}

	// app/app.module.ts
	{
		const isDrizzle = opts.orm === "drizzle";
		const isKysely = opts.orm === "kysely";
		const hasOrm = isDrizzle || isKysely;
		
		// Resolve dialect from runtime + db
		const resolveDialect = (runtime: string, db: string): string => {
			if (db !== "sqlite") return db;
			if (runtime === "cloudflare") return "d1";
			return "sqlite"; // bun → bun:sqlite
		};
		
		let ormImport = '';
		let ormBlock = '';
		if (isDrizzle) {
			const dialect = resolveDialect(opts.runtime, opts.db);
			ormImport = `import { DrizzleModule } from '@nexusts/drizzle';\n`;
			ormBlock = `    DrizzleModule.forRoot({\n      dialect: '${dialect}',\n      connection: { filename: '${opts.dbUrl || "app.db"}' },\n      logging: true,\n    })`;
		} else if (isKysely) {
			if (opts.runtime === "cloudflare") {
				ormImport = "import { KyselyModule } from '@nexusts/kysely';\nimport { D1Dialect } from 'kysely-d1';";
				ormBlock = `    KyselyModule.forRoot({\n      config: {\n        dialect: new D1Dialect({ database: process.env['D1_DATABASE'] }),\n      },\n      logging: true,\n    })`;
			} else {
				ormImport = "import { KyselyModule, BunSqliteDialect } from '@nexusts/kysely';\nimport { SqliteDialect } from 'kysely';\nimport { Database } from 'bun:sqlite';\n";
				ormBlock = `    KyselyModule.forRoot({\n      config: {\n        dialect: new SqliteDialect({\n          database: BunSqliteDialect.wrap(new Database('${opts.dbUrl || "app.db"}')),\n        }),\n      },\n      logging: true,\n    })`;
			}
		}
		const isInertia = opts.view === "inertia";
		const inertiaImport = isInertia ? `import { Inertia } from '@nexusts/view';\n` : '';
		const inertiaProvider = isInertia
			? `  providers: [{ provide: Inertia.TOKEN, useValue: new Inertia({ scripts: ['/static/app.js'] }) }],\n`
			: '';
		write("app/app.module.ts",
			`${ormImport}${inertiaImport}import { Module } from '@nexusts/core';\nimport { HomeController } from './controllers/home.controller.js';\n\n@Module({\n  imports: [${hasOrm ? `\n${ormBlock},\n` : ''}  ],\n${inertiaProvider}  controllers: [HomeController],\n})\nexport class AppModule {}\n`);
	}
		if (opts.view === "inertia") {
			write("app/controllers/home.controller.ts",
				`import { Controller, Get, Inject } from '@nexusts/core';\nimport { Inertia } from '@nexusts/view';\n\n@Controller('/')\nexport class HomeController {\n  @Inject(Inertia.TOKEN) private inertia!: Inertia;\n\n  @Get('/')\n  index() {\n    return this.inertia.render('Welcome', { name: 'NexusTS' });\n  }\n}\n`);
		} else if (opts.view !== "none") {
			write("app/controllers/home.controller.ts",
				`import { Controller, Get } from '@nexusts/core';\n\n@Controller('/')\nexport class HomeController {\n  @Get('/')\n  index() {\n    return {\n      view: 'welcome.html',\n      data: { year: new Date().getFullYear() },\n    };\n  }\n}\n`);
		} else {
			write("app/controllers/home.controller.ts",
				`import { Controller, Get } from '@nexusts/core';\n\n@Controller('/')\nexport class HomeController {\n  @Get('/')\n  index() {\n    return { status: 200, body: { message: 'Hello from NexusTS!' } };\n  }\n}\n`);
		}

	if (opts.orm === "drizzle") {
		generateDrizzleConfig(target, opts.db, opts.dbUrl, opts.runtime);
	}

	write("README.md",
		`# ${opts.name}\n\nA NexusTS project.\n\n## Run\n\n\`\`\`bash\nbun install\nbun run dev\n\`\`\`\n\n## Scaffolding\n\n\`\`\`bash\nbunx nx make:crud Post\n\`\`\`\n`);

	return created;
}
