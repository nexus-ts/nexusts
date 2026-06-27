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

export type RuntimeType = "bun" | "cloudflare";

export type RoutingStyle = "nest" | "adonis" | "functional" | "mixed";
export type ViewEngine = "rendu" | "edge" | "inertia" | "none";
export type OrmDriver = "drizzle" | "kysely" | "none";
export type InertiaFrontend = "react" | "vue" | "svelte" | "solid";
export type Database =
	| "sqlite"
	| "postgres"
	| "mysql"
	| "none";
export type QueueBackendKind = "bullmq" | "cloudflare" | "memory";

/** Authentication surface. Mirrors `src/auth/types.ts` (kept inline so
 * the CLI doesn't depend on the auth module). */
export interface NxAuthConfig {
	/** Mount path for better-auth handler. Default: `/api/auth`. */
	basePath?: string;
	/** Email + password authentication. */
	emailAndPassword?: {
		enabled?: boolean;
		requireEmailVerification?: boolean;
		minPasswordLength?: number;
		maxPasswordLength?: number;
	};
	/** Social providers keyed by name (github, google, discord, ...). */
	socialProviders?: Record<
		string,
		{
			clientId: string;
			clientSecret: string;
			scope?: string[];
			redirectURI?: string;
		}
	>;
	/** JWT plugin (token + JWKS endpoint). */
	jwt?: {
		enabled: boolean;
		jwksPath?: string;
		issuer?: string;
		audience?: string;
		expiresIn?: number;
	};
	/** Passkey plugin (WebAuthn). */
	passkey?: {
		enabled: boolean;
		rpName: string;
		rpId: string;
		origin: string | string[];
	};
	/** Session TTL in seconds. Default: 7 days. */
	sessionExpiresInSeconds?: number;
	/** Cookie domain for subdomains. */
	cookieDomain?: string;
	/** Cross-subdomain cookies. */
	crossSubDomainCookies?: {
		enabled: boolean;
		domain?: string;
	};
	/** Cookie `SameSite` attribute. */
	cookieSameSite?: "lax" | "strict" | "none";
	/** Cookie `Secure` flag. Default: true in production. */
	cookieSecure?: boolean;
}

export interface NxConfig {
	/** Runtime target. Default: "bun". */
	runtime: RuntimeType;
	/** Routing style for `make:controller` templates. */
	routing: RoutingStyle;
	/** View engine for view templates. */
	view: ViewEngine;
	/** ORM driver. */
	orm: OrmDriver;
	/** Drizzle dialect (when `orm === 'drizzle'`). */
	dialect?: "postgres" | "mysql" | "sqlite" | "d1";
	/** Database driver. */
	database: {
		driver: Database;
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
		seeds?: string;
		middleware: string;
		dto: string;
	};
	/** Names that get auto-included in `@Module({ controllers: [...] })`. */
	moduleStyle: "nest" | "adonis";

	/** Authentication (better-auth) configuration. Optional. */
	auth?: NxAuthConfig;

	/** Queue (BullMQ / Cloudflare Queues) configuration. Optional. */
	queue?: {
		backend: QueueBackendKind;
		bullmq?: {
			connection: string | { host: string; port: number; password?: string };
			prefix?: string;
		};
		cloudflare?: {
			/** Name of the Queue binding on the Worker (e.g. 'MY_QUEUE'). */
			bindingName: string;
			queueName?: string;
		};
		defaults?: {
			delaySeconds?: number;
			attempts?: number;
			backoff?: { type: "fixed" | "exponential"; delayMs: number };
		};
	};
}

export const DEFAULT_CONFIG: NxConfig = {
	runtime: "bun",
	routing: "nest",
	view: "inertia",
	orm: "drizzle",
	database: {
		driver: "sqlite",
		url: "app.db",
	},
	inertia: {
		frontend: "react",
		ssr: true,
		version: "1.0.0",
	},
	paths: {
		app: "app",
		controllers: "app/controllers",
		services: "app/services",
		modules: "app/modules",
		models: "app/models",
		migrations: "app/database/migrations",
		seeds: "db/seeds",
		middleware: "app/middleware",
		dto: "app/dto",
	},
	moduleStyle: "nest",
	auth: undefined,
	queue: undefined,
};

const CONFIG_CANDIDATES = [
	"nx.config.ts",
	"nx.config.js",
	"nx.config.mjs",
	".nxrc.json",
];

/**
 * Load the project's nx.config file, falling back to defaults.
 * Merges with environment overrides.
 *
 * Missing / unloadable config files are not fatal — we log a debug
 * message and use defaults so the CLI works in fresh projects where
 * `nexusts` hasn't been installed yet.
 */
export async function loadConfig(
	cwd: string = process.cwd(),
): Promise<NxConfig> {
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
				// Some nx.config.ts files import from `@nexusts/cli` for
				// type-safety. When NexusTS isn't installed yet (e.g. in
				// a fresh project after `nx new`), swallow the import
				// failure and fall back to defaults.
				try {
					const mod: { default?: unknown } = await import(path);
					config = (mod.default ?? mod) as Partial<NxConfig>;
				} catch (importErr: unknown) {
					// If the file imports from NexusTS and NexusTS isn't installed,
					// try to extract the config by evaluating the export with a
					// simple regex (last resort). For now, just log and fall back.
					// Use a direct console.warn here to avoid circular import with logger (config is loaded before logger is ready).
					process.stderr.write(`[nx] Could not dynamically import ${candidate}: ${importErr instanceof Error ? importErr.message : String(importErr)}. Falling back to defaults.\n`);
					config = {};
				}
			}
			configSource = candidate;
			break;
		} catch (err: unknown) {
			throw new Error(
				`Failed to load ${candidate}: ${err instanceof Error ? err.message : String(err)}`,
			);
		}
	}

	const merged = mergeWithEnv(DEFAULT_CONFIG, config);

	// Sanity-check enum values.
	assertEnum("routing", merged.routing, [
		"nest",
		"adonis",
		"functional",
		"mixed",
	]);
	assertEnum("view", merged.view, ["rendu", "edge", "inertia", "none"]);
	assertEnum("orm", merged.orm, ["drizzle", "kysely", "none"]);
	assertEnum("database.driver", merged.database.driver, [
		"sqlite",
		
		"postgres",
		"mysql",
		"none",
	]);
	assertEnum("inertia.frontend", merged.inertia.frontend, [
		"react",
		"vue",
		"svelte",
		"solid",
	]);

	if (process.env.NX_DEBUG === "1") {
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

	if (env.NX_RUNTIME) merged.runtime = env.NX_RUNTIME as RuntimeType;
	if (env.NX_ROUTING) merged.routing = env.NX_ROUTING as RoutingStyle;
	if (env.NX_VIEW) merged.view = env.NX_VIEW as ViewEngine;
	if (env.NX_ORM) merged.orm = env.NX_ORM as OrmDriver;
	if (env.NX_DATABASE_DRIVER)
		merged.database.driver = env.NX_DATABASE_DRIVER as Database;
	if (env.NX_DATABASE_URL) merged.database.url = env.NX_DATABASE_URL as string;
	if (env.NX_INERTIA_FRONTEND)
		merged.inertia.frontend = env.NX_INERTIA_FRONTEND as InertiaFrontend;
	if (env.NX_INERTIA_SSR)
		merged.inertia.ssr =
			env.NX_INERTIA_SSR !== "false" && env.NX_INERTIA_SSR !== "0";
	if (env.NX_INERTIA_VERSION)
		merged.inertia.version = env.NX_INERTIA_VERSION as string;

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
