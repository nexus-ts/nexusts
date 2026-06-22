/**
 * `nx config` — update or create nx.config.ts (+ drizzle.config.ts
 * if Drizzle is selected).
 *
 * Companion to `nx init`:
 *   - `nx init`     → scaffold the whole project (config + src/app + README)
 *   - `nx config`   → only the config files; idempotent
 *
 * Behaviour:
 *   - If nx.config.ts exists, parses the current values, merges
 *     with any flag values (flags win), and re-renders.
 *   - If it does not exist, creates it from scratch with the
 *     provided (or prompted) values.
 *   - If ORM is `drizzle`, also writes drizzle.config.ts.
 *   - If ORM is NOT `drizzle`, an existing drizzle.config.ts is
 *     left alone (the user may have it intentionally).
 *
 * Typical use cases:
 *   - "I want to switch from bun-sqlite to postgres"
 *     → nx config --db postgres
 *   - "I want to add Drizzle to an existing project"
 *     → nx config --orm drizzle
 *   - "I want to change the Inertia frontend from React to Vue"
 *     → nx config --frontend vue
 *   - "I haven't decided yet, just show me the prompts"
 *     → nx config --no-interaction=false
 *
 * Flags:
 *   --target <dir>     Target directory (default: cwd)
 *   --style <name>     Routing style (nest|adonis|functional)
 *   --view <name>      View engine (rendu|edge|inertia|none)
 *   --orm <name>       ORM driver (drizzle|prisma|kysely|none)
 *   --db <name>        Database driver
 *   --db-url <url>     Database URL (used when DATABASE_URL is unset)
 *   --frontend <name>  Inertia frontend (react|vue|svelte|solid)
 *   --ssr              Enable Inertia SSR
 *   --no-ssr           Disable Inertia SSR
 *   --force            Overwrite even if file already exists
 *   --no-interaction   Skip interactive prompts
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Command, CommandContext } from "../core/index.js";
import { flagBool, logger, render, select } from "../core/index.js";
import { templates } from "../templates/index.js";

interface NxConfigValues {
	routing: string;
	view: string;
	viewPaths: string;
	orm: string;
	dbDriver: string;
	dbUrl: string;
	inertiaFrontend: string;
	inertiaSSR: boolean;
	inertiaVersion: string;
	[key: string]: string | number | boolean | undefined | null;
}

const DEFAULT_VALUES: NxConfigValues = {
	routing: "nest",
	view: "rendu",
	viewPaths: "resources/views",
	orm: "drizzle",
	dbDriver: "bun-sqlite",
	dbUrl: "app.db",
	inertiaFrontend: "react",
	inertiaSSR: true,
	inertiaVersion: "1.0.0",
};

/**
 * Parse an existing nx.config.ts and extract the scalar values.
 * Falls back to DEFAULT_VALUES for any field it can't read.
 */
function parseExistingConfig(path: string): NxConfigValues {
	const out: NxConfigValues = { ...DEFAULT_VALUES };
	if (!existsSync(path)) return out;
	const src = readFileSync(path, "utf8");
	const grab = (re: RegExp): string | undefined => {
		const m = src.match(re);
		return m?.[1];
	};
	const routing = grab(/routing:\s*['"]([^'"]+)['"]/);
	const view = grab(/view:\s*['"]([^'"]+)['"]/);
	const viewPathsMatch = src.match(/viewPaths:\s*['"]([^'"]+)['"]/);
	if (viewPathsMatch) {
		out.viewPaths = viewPathsMatch[1];
	}
	const orm = grab(/orm:\s*['"]([^'"]+)['"]/);
	const driver = grab(/driver:\s*['"]([^'"]+)['"]/);
	const url = grab(/url:\s*process\.env\.DATABASE_URL\s*\?\?\s*['"]([^'"]+)['"]/);
	const frontend = grab(/frontend:\s*['"]([^'"]+)['"]/);
	const ssr = grab(/ssr:\s*(true|false)/);
	const version = grab(/version:\s*['"]([^'"]+)['"]/);
	if (routing) out.routing = routing;
	if (view) out.view = view;
	if (orm) out.orm = orm;
	if (driver) out.dbDriver = driver;
	if (url !== undefined) out.dbUrl = url;
	if (frontend) out.inertiaFrontend = frontend;
	if (ssr) out.inertiaSSR = ssr === "true";
	if (version) out.inertiaVersion = version;
	return out;
}

/** Map a `db` driver name to a drizzle-kit dialect. */
function driverToDialect(driver: string): string {
	switch (driver) {
		case "bun-sqlite":
		case "node-sqlite":
		case "libsql":
			return "sqlite";
		case "postgres":
			return "postgresql";
		case "mysql":
			return "mysql";
		default:
			return "sqlite";
	}
}

/** Default DATABASE_URL fallback based on the driver. */
function defaultDbUrl(driver: string): string {
	if (driver === "bun-sqlite" || driver === "node-sqlite" || driver === "libsql") {
		return "app.db";
	}
	return "";
}

export const configCommand: Command = {
	name: "config",
	aliases: ["cfg"],
	summary: "Update or create nx.config.ts (+ drizzle.config.ts if Drizzle is selected)",
	description:
		"Re-renders nx.config.ts from the current values (parsed from the existing file, or prompted) plus any flag overrides. Also creates or updates drizzle.config.ts when the ORM is `drizzle`.",
	examples: [
		"nx config",
		"nx config --db postgres --db-url postgres://localhost/mydb",
		"nx config --orm drizzle --db bun-sqlite",
		"nx config --view inertia --frontend vue --no-ssr",
		"nx config --force",
	],
	flags: [
		{ name: "target", description: "Target directory (default: cwd)" },
		{
			name: "style",
			description: "Routing style (nest|adonis|functional|mixed)",
		},
		{ name: "view", description: "View engine (rendu|edge|inertia|none)" },
		{
			name: "view-paths",
			description: "Comma-separated directories searched for view files (e.g. resources/views)",
		},
		{ name: "orm", description: "ORM driver (drizzle|prisma|kysely|none)" },
		{
			name: "db",
			description:
				"Database driver (bun-sqlite|node-sqlite|libsql|postgres|mysql|none)",
		},
		{
			name: "db-url",
			description: "Default DATABASE_URL when the env var is unset",
		},
		{
			name: "frontend",
			description: "Inertia frontend (react|vue|svelte|solid)",
		},
		{ name: "ssr", description: "Enable Inertia SSR" },
		{ name: "no-ssr", description: "Disable Inertia SSR" },
		{ name: "force", description: "Overwrite even if file already exists" },
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
			return 1;
		}

		// 1. Start with the existing file's values (or defaults)
		const nxConfigPath = resolve(target, "nx.config.ts");
		const values: NxConfigValues = parseExistingConfig(nxConfigPath);

		// 2. Apply flag overrides
		const flag = (k: string) => ctx.flags[k] as string | undefined;
		const flagBoolStrict = (k: string, def: boolean) =>
			flagBool(ctx.flags, k, def);
		if (flag("style")) values.routing = flag("style")!;
		if (flag("view")) values.view = flag("view")!;
	if (flag("view-paths")) {
		values.viewPaths = flag("view-paths")!;
	}
		if (flag("orm")) values.orm = flag("orm")!;
		if (flag("db")) values.dbDriver = flag("db")!;
		if (flag("db-url") !== undefined) values.dbUrl = flag("db-url")!;
		if (flag("frontend")) values.inertiaFrontend = flag("frontend")!;
		if (flagBoolStrict("ssr", false)) values.inertiaSSR = true;
		if (flagBoolStrict("no-ssr", false)) values.inertiaSSR = false;
		// --inertia-version intentionally not exposed — too internal

		// 3. Interactive prompt for fields the user didn't supply
		// (only if the file didn't already exist OR they passed no
		// flags at all — i.e. they want a guided setup)
		const anyFlag = Object.values(ctx.flags).some(
			(v) => v !== undefined && v !== false,
		);
		if (interactive && !anyFlag && !existsSync(nxConfigPath)) {
			values.routing =
				(await select("Routing style", ["nest", "adonis", "functional"], {
					interactive,
					default: values.routing,
				})) ?? values.routing;
			values.view =
				(await select("View engine", ["inertia", "rendu", "edge", "none"], {
					interactive,
					default: values.view,
				})) ?? values.view;
			values.orm =
				(await select("ORM driver", ["drizzle", "prisma", "kysely", "none"], {
					interactive,
					default: values.orm,
				})) ?? values.orm;
			values.dbDriver =
				(await select(
					"Database driver",
					["bun-sqlite", "node-sqlite", "libsql", "postgres", "mysql", "none"],
					{ interactive, default: values.dbDriver },
				)) ?? values.dbDriver;
			values.inertiaFrontend =
				(await select(
					"Inertia frontend",
					["react", "vue", "svelte", "solid"],
					{ interactive, default: values.inertiaFrontend },
				)) ?? values.inertiaFrontend;
		}

		// 4. Derive dbUrl from driver if user didn't pass --db-url
		if (flag("db-url") === undefined && flag("db") !== undefined) {
			values.dbUrl = defaultDbUrl(values.dbDriver);
		}

		// 5. Render and write
		const existed = existsSync(nxConfigPath);
		if (existed && !force) {
			// Existing file: rewrite only if something actually changed.
			// (Always rewrite when the user passed any flag, since
			// they're explicitly asking for a change.)
			if (anyFlag) {
				writeNxConfig(target, values);
				logger.info(`  ~ nx.config.ts (updated)`);
			} else {
				logger.info(`  - nx.config.ts (unchanged; pass --force or a flag to update)`);
			}
		} else {
			writeNxConfig(target, values);
			logger.info(`  + nx.config.ts`);
		}

		// 6. Handle drizzle.config.ts
		const drizzleConfigPath = resolve(target, "drizzle.config.ts");
		if (values.orm === "drizzle") {
			const dialect = driverToDialect(values.dbDriver);
			const dbUrl = values.dbUrl;
			const existedDrizzle = existsSync(drizzleConfigPath);
			if (existedDrizzle && !force && !anyFlag) {
				logger.info(`  - drizzle.config.ts (unchanged; pass --force or a flag to update)`);
			} else {
				writeDrizzleConfig(target, { dialect, dbUrl });
				logger.info(`  ${existedDrizzle ? "~" : "+"} drizzle.config.ts`);
			}
		} else if (existsSync(drizzleConfigPath)) {
			logger.info(
				`  - drizzle.config.ts (left as-is; ORM is '${values.orm}', not 'drizzle')`,
			);
		}

		logger.blank();
		logger.success(`config updated in ${target}`);
		logger.blank();
		logger.heading("Next steps");
		logger.info(`  cd ${target === ctx.cwd ? "." : target}`);
		if (values.orm === "drizzle") {
			logger.info(`  bun run db:generate    # generate migrations`);
		}
		logger.blank();

		return 0;
	},
};

// ---------------------------------------------------------------------------
// Writers
// ---------------------------------------------------------------------------

function writeNxConfig(target: string, values: NxConfigValues): void {
	const code = render(templates.project["nx.config.ts"], values);
	writeFileSync(resolve(target, "nx.config.ts"), code);
}

function writeDrizzleConfig(
	target: string,
	values: { dialect: string; dbUrl: string },
): void {
	const code = render(templates.project["drizzle.config.ts"], values);
	writeFileSync(resolve(target, "drizzle.config.ts"), code);
}

export default configCommand;
