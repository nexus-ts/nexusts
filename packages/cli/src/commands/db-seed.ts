/**
 * `nx db:seed` — run database seed scripts.
 *
 * Seeds are TypeScript (or JavaScript) files that populate the
 * database with fixture data. The command:
 *
 *   1. Scans the configured `seeds` directory (default
 *      `./db/seeds` — overridable via `paths.seeds` in
 *      `nx.config.ts`).
 *   2. Loads every `*.ts` (or `*.js` / `*.mjs`) file in
 *      alphabetical order.
 *   3. Invokes the default export as an async function, passing
 *      a `SeedContext` that exposes the active DrizzleService,
 *      logger, and a few helpers (see below).
 *
 * Examples:
 *   nx db:seed                      # run all seeds in db/seeds/
 *   nx db:seed --file 01_users      # run a single seed
 *   nx db:seed --reset              # clear all tables first (DESTRUCTIVE)
 *   nx db:seed --create users       # scaffold a new seed file
 *   nx db:seed --folder ./seeds     # custom folder
 *
 * Seed file example:
 *
 *   // db/seeds/01_users.ts
 *   import type { SeedContext } from "@nexusts/cli";
 *
 *   export default async function seed(ctx: SeedContext) {
 *     await ctx.db.insert(users).values([
 *       { email: "alice@example.com" },
 *       { email: "bob@example.com" },
 *     ]);
 *     ctx.logger.info(`Inserted 2 users`);
 *   }
 *
 * The "01_users.ts" naming convention (zero-padded numbers as
 * prefixes) is recommended but not required — alphabetical
 * ordering is the only rule.
 */

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readdir, unlink, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { Command, CommandContext } from "../core/index.js";
import { logger } from "../core/index.js";

const SEED_TEMPLATE = `/**
 * Seed: {name}
 *
 * Run with: nx db:seed
 *
 * The default export receives a \`SeedContext\` with:
 *   - \`ctx.db\`        : the active DrizzleService
 *   - \`ctx.logger\`    : the framework logger
 *   - \`ctx.dialect\`   : the active Drizzle dialect
 *   - \`ctx.truncate(table)\` : helper to clear a table
 *
 * Option A — plain inserts:
 *   await ctx.db.insert(usersTable).values([{ email: "alice@example.com" }]);
 *
 * Option B — factory (requires @faker-js/faker as a dev dep):
 *   import { UserFactory } from "../factories/user.factory.js";
 *   await UserFactory.createMany(ctx.db, 10);
 */

import type { SeedContext } from "@nexusts/cli";

export default async function seed(ctx: SeedContext): Promise<void> {
\tctx.logger.info("Running seed: {name}");
\t// Example A — plain inserts:
\t// await ctx.db.insert(usersTable).values([
\t//   { email: "alice@example.com", name: "Alice" },
\t//   { email: "bob@example.com",   name: "Bob"   },
\t// ]);

\t// Example B — factory (bun add -d @faker-js/faker):
\t// import { UserFactory } from "../factories/user.factory.js";
\t// await UserFactory.createMany(ctx.db, 10);
}
`;

export const dbSeedCommand: Command = {
	name: "db:seed",
	aliases: ["db:s", "seed"],
	summary: "Run database seed scripts",
	description:
		"Loads and runs every seed file in the configured seeds folder in alphabetical order. Use --file to run a single seed, --create to scaffold a new one, --reset to truncate first (DESTRUCTIVE).",
	examples: [
		"nx db:seed",
		"nx db:seed --file 01_users",
		"nx db:seed --create users",
		"nx db:seed --reset",
		"nx db:seed --folder ./seeds",
	],
	flags: [
		{
			name: "file",
			description:
				"Run a single seed file by name (without .ts extension, fuzzy match).",
		},
		{
			name: "create",
			description:
				"Scaffold a new seed file with a default template. Provide a name (e.g. `users`).",
		},
		{
			name: "reset",
			description:
				"DESTRUCTIVE: Truncate every table in the schema before running seeds.",
		},
		{
			name: "folder",
			description:
				"Override seeds folder. Default: ./db/seeds (or nx.config.ts paths.seeds).",
		},
		{
			name: "dialect",
			description:
				"Drizzle dialect (postgres|mysql|sqlite|bun-sqlite|d1). Default: from nx.config.ts or bun-sqlite.",
		},
	],
	async run(ctx: CommandContext): Promise<number> {
		const folder = resolve(
			ctx.cwd,
			(ctx.flags["folder"] as string | undefined) ??
				(ctx.config.paths as { seeds?: string })?.seeds ??
				"db/seeds",
		);
		const dialect =
			(ctx.flags["dialect"] as string | undefined) ??
			ctx.config.dialect ??
			"bun-sqlite";
		const createName = ctx.flags["create"] as string | undefined;
		const fileName = ctx.flags["file"] as string | undefined;
		const reset = Boolean(ctx.flags["reset"]);

		// --create scaffolds a new seed file. Doesn't run anything else.
		if (createName) {
			return await createSeedFile(folder, createName);
		}

		if (!existsSync(folder)) {
			// No seeds folder yet. Create an empty one with a README.
			logger.info(`creating empty seeds folder at ${folder}`);
			await mkdir(folder, { recursive: true });
			await writeFile(
				resolve(folder, "_README.ts"),
				`// Seed files go here. Run with: nx db:seed\n`,
				"utf-8",
			);
			return 0;
		}

		const files = await collectSeedFiles(folder);

		// If --file was given but matches nothing, fail fast.
		if (fileName) {
			const matched = files.filter((f) =>
				f.toLowerCase().includes(fileName.toLowerCase()),
			);
			if (matched.length === 0) {
				logger.error(`no seed file matching "${fileName}" in ${folder}`);
				return 1;
			}
		} else if (files.length === 0) {
			logger.warn(`no seed files found in ${folder}`);
			return 0;
		}

		const target = fileName
			? files.filter((f) => f.toLowerCase().includes(fileName.toLowerCase()))
			: files;

		const url = readEnvUrl(dialect);
		if (!url) {
			logger.error(
				`could not read ${dialect} URL from environment. Set DATABASE_URL or NEXUS_DB_URL.`,
			);
			return 1;
		}

		if (reset) {
			logger.warn(
				"--reset is set: truncating every table in the schema before running seeds.",
			);
		}

		// Generate an in-process runner script that:
		//   1. Opens the DrizzleService.
		//   2. Optionally truncates every table.
		//   3. Imports each seed file and invokes its default export.
		const seedImports = target
			.map((f, i) => `import seed_${i} from ${JSON.stringify(resolve(folder, f))};`)
			.join("\n");
		const seedCalls = target
			.map(
				(_, i) =>
					`  await seed_${i}({ db, logger, dialect, truncate: (t) => db.truncate(t) });`,
			)
			.join("\n");

		const script = `
import 'reflect-metadata';
import { DrizzleService } from '@nexusts/drizzle';
import { Logger } from '@nexusts/logger';

const url = ${JSON.stringify(url)};
const dialect = ${JSON.stringify(dialect)};
const reset = ${JSON.stringify(reset)};

const cfg = { dialect, connection: { url }, schema: dialect === 'postgres' ? 'public' : undefined };
const db = new DrizzleService(cfg);
await db.open();
const logger = new Logger({ level: 'info' });
await logger.ready();

if (reset) {
  const tables = await db.allTables();
  for (const t of tables) {
    await db.truncate(t);
  }
  logger.info(\`Truncated \${tables.length} table(s)\`);
}

${seedImports}

${seedCalls}

await db.close();
logger.info(\`Seeds complete (\${${target.length}} file(s))\`);
`;
		const tmpFile = resolve(ctx.cwd, ".nx-db-seed.mjs");
		await writeFile(tmpFile, script, "utf-8");
		try {
			const code = await new Promise<number>((resP) => {
				const child = spawn("bun", [tmpFile], {
					cwd: ctx.cwd,
					stdio: "inherit",
					shell: process.platform === "win32",
				});
				child.on("exit", (c) => resP(c ?? 0));
				child.on("error", () => resP(1));
			});
			return code;
		} finally {
			await unlink(tmpFile).catch(() => {});
		}
	},
};

/* ------------------------------------------------------------------ *
 * Helpers
 * ------------------------------------------------------------------ */

async function collectSeedFiles(folder: string): Promise<string[]> {
	const all = await readdir(folder, { withFileTypes: true });
	const out: string[] = [];
	for (const e of all) {
		if (!e.isFile()) continue;
		if (e.name.startsWith("_")) continue; // _README.ts etc.
		if (!/\.(ts|js|mjs|cjs)$/.test(e.name)) continue;
		out.push(e.name);
	}
	out.sort();
	return out;
}

async function createSeedFile(
	folder: string,
	name: string,
): Promise<number> {
	if (!/^[a-z0-9_-]+$/i.test(name)) {
		logger.error(
			`invalid seed name "${name}" — use letters, numbers, dash, underscore.`,
		);
		return 1;
	}
	if (!existsSync(folder)) await mkdir(folder, { recursive: true });

	// Find a non-clobbering filename
	let candidate = `${name}.ts`;
	let i = 1;
	while (existsSync(resolve(folder, candidate))) {
		candidate = `${name}_${i}.ts`;
		i++;
	}
	const path = resolve(folder, candidate);
	const body = SEED_TEMPLATE.replace(/\{name\}/g, name);
	await writeFile(path, body, "utf-8");
	logger.info(`created ${path}`);
	return 0;
}

function readEnvUrl(dialect: string): string | null {
	const url =
		process.env["DATABASE_URL"] ??
		process.env["NEXUS_DB_URL"] ??
		(dialect === "postgres"
			? process.env["POSTGRES_URL"]
			: dialect === "mysql"
				? process.env["MYSQL_URL"]
				: dialect.includes("sqlite")
					? process.env["SQLITE_FILENAME"]
					: null);
	return url ?? null;
}

export default dbSeedCommand;
