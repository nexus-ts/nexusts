/**
 * `nx.config.ts` loader.
 *
 * Reads the project's `nx.config.ts` (or `.nxrc.json`) and merges it
 * with environment overrides (`NX_ROUTING`, `NX_VIEW`, `NX_ORM`,
 * `NX_DATABASE_URL`, etc.).
 *
 * The config file is dynamically imported so users can write it in
 * TypeScript with full type checking.
 */

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

export type RoutingStyle = "nest" | "adonis" | "functional" | "mixed";
export type ViewEngine = "rendu" | "edge" | "inertia" | "none";
export type OrmDriver = "drizzle" | "prisma" | "kysely" | "none";
export type InertiaFrontend = "react" | "vue" | "svelte" | "solid";
export type DatabaseDriver =
	| "bun-sqlite"
	| "node-sqlite"
	| "libsql"
	| "postgres"
	| "mysql"
	| "none";

export interface NxConfig {
	/** Routing style for `make:controller` templates. */
	routing: RoutingStyle;
	/** View engine for view templates. */
	view: ViewEngine;
	/** ORM driver. */
	orm: OrmDriver;
	/** Database driver. */
	database: {
		driver: DatabaseDriver;
		url: string;
	};
	/** Inertia-specific config (only consulted when `view === 'inertia'`). */
	inertia: {
		frontend: InertiaFrontend;
		ssr: boolean;
		version: string;
	};
	/** Where to scaffold files. */
	paths: {
		app: string;
		controllers: string;
		services: string;
		modules: string;
		models: string;
		migrations: string;
		middleware: string;
		dto: string;
	};
	/** Names that get auto-included in `@Module({ controllers: [...] })`. */
	moduleStyle: "nest" | "adonis";
}

export const DEFAULT_CONFIG: NxConfig = {
	routing: "nest",
	view: "inertia",
	orm: "drizzle",
	database: {
		driver: "bun-sqlite",
		url: "app.db",
	},
	inertia: {
		frontend: "react",
		ssr: true,
		version: "1.0.0",
	},
	paths: {
		app: "src/app",
		controllers: "src/app/controllers",
		services: "src/app/services",
		modules: "src/app/modules",
		models: "src/app/models",
		migrations: "src/app/database/migrations",
		middleware: "src/app/middleware",
		dto: "src/app/dto",
	},
	moduleStyle: "nest",
};

const CONFIG_CANDIDATES = ["nx.config.ts", "nx.config.js", "nx.config.mjs", ".nxrc.json"];

/**
 * Load the project's nx.config file, falling back to defaults.
 * Merges with environment overrides.
 *
 * Missing / unloadable config files are not fatal — we log a debug
 * message and use defaults so the CLI works in fresh projects where
 * `nexus` hasn't been installed yet.
 */
export async function loadConfig(cwd: string = process.cwd()): Promise<NxConfig> {
	let config: Partial<NxConfig> = {};
	let configSource = "<defaults>";

	for (const candidate of CONFIG_CANDIDATES) {
		const path = resolve(cwd, candidate);
		if (!existsSync(path)) continue;

		try {
			if (candidate.endsWith(".json")) {
				const raw = readFileSync(path, "utf8");
				config = JSON.parse(raw) as Partial<NxConfig>;
			} else {
				// Dynamic import — works under Bun and Node (tsx).
				// Some nx.config.ts files import from `nexus/cli` for
				// type-safety. When nexus isn't installed yet (e.g. in
				// a fresh project after `nx new`), swallow the import
				// failure and fall back to defaults.
				try {
					const mod: any = await import(path);
					config = (mod.default ?? mod) as Partial<NxConfig>;
				} catch (importErr: any) {
					// If the file imports from nexus and nexus isn't installed,
					// try to extract the config by evaluating the export with a
					// simple regex (last resort). For now, just log and fall back.
					console.warn(
						`[nx] Could not dynamically import ${candidate}: ${importErr.message ?? importErr}. Falling back to defaults.`,
					);
					config = {};
				}
			}
			configSource = candidate;
			break;
		} catch (err: any) {
			throw new Error(
				`Failed to load ${candidate}: ${err.message ?? String(err)}`,
			);
		}
	}

	const merged = mergeWithEnv(DEFAULT_CONFIG, config);

	// Sanity-check enum values.
	assertEnum("routing", merged.routing, ["nest", "adonis", "functional", "mixed"]);
	assertEnum("view", merged.view, ["rendu", "edge", "inertia", "none"]);
	assertEnum("orm", merged.orm, ["drizzle", "prisma", "kysely", "none"]);
	assertEnum("database.driver", merged.database.driver, [
		"bun-sqlite", "node-sqlite", "libsql", "postgres", "mysql", "none",
	]);
	assertEnum("inertia.frontend", merged.inertia.frontend, ["react", "vue", "svelte", "solid"]);

	if (process.env["NX_DEBUG"] === "1") {
		console.log(`[nx] config source: ${configSource}`);
	}

	return merged;
}

/**
 * Apply environment overrides on top of a config object.
 * Recognized env vars:
 *   NX_ROUTING, NX_VIEW, NX_ORM, NX_DATABASE_DRIVER, NX_DATABASE_URL,
 *   NX_INERTIA_FRONTEND, NX_INERTIA_SSR, NX_INERTIA_VERSION
 */
function mergeWithEnv(base: NxConfig, override: Partial<NxConfig>): NxConfig {
	const env = process.env;
	const merged: NxConfig = {
		...base,
		...override,
		database: { ...base.database, ...(override.database ?? {}) },
		inertia: { ...base.inertia, ...(override.inertia ?? {}) },
		paths: { ...base.paths, ...(override.paths ?? {}) },
	};

	if (env["NX_ROUTING"]) merged.routing = env["NX_ROUTING"] as RoutingStyle;
	if (env["NX_VIEW"]) merged.view = env["NX_VIEW"] as ViewEngine;
	if (env["NX_ORM"]) merged.orm = env["NX_ORM"] as OrmDriver;
	if (env["NX_DATABASE_DRIVER"])
		merged.database.driver = env["NX_DATABASE_DRIVER"] as DatabaseDriver;
	if (env["NX_DATABASE_URL"]) merged.database.url = env["NX_DATABASE_URL"]!;
	if (env["NX_INERTIA_FRONTEND"])
		merged.inertia.frontend = env["NX_INERTIA_FRONTEND"] as InertiaFrontend;
	if (env["NX_INERTIA_SSR"])
		merged.inertia.ssr = env["NX_INERTIA_SSR"] !== "false" && env["NX_INERTIA_SSR"] !== "0";
	if (env["NX_INERTIA_VERSION"])
		merged.inertia.version = env["NX_INERTIA_VERSION"]!;

	return merged;
}

function assertEnum<K extends string>(
	key: string,
	value: string,
	allowed: readonly K[],
): asserts value is K {
	if (!allowed.includes(value as K)) {
		throw new Error(
			`Invalid value for ${key}: "${value}". Allowed: ${allowed.join(", ")}.`,
		);
	}
}