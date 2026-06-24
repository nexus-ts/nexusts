/**
 * Re-exports for the CLI core.
 */

export * from "./args.js";
export * from "./config.js";
export * from "./fs.js";
export * from "./logger.js";
export * from "./loose-json.js";
export * from "./prompts.js";
export * from "./template.js";
export { VERSION } from "./version.js";
export { ensureDirectories, computeDeps, buildPackageJson, generateProjectFiles } from "./scaffold.js";

/**
 * The CLI command contract. Every command module exports a default
 * `Command` object that the entry point dispatches against.
 */
export interface Command {
	/** Primary command name, e.g. `"make:controller"`. */
	name: string;
	/** Aliases (`"mc"` for `make:controller`). */
	aliases?: string[];
	/** One-line summary for `nx help`. */
	summary: string;
	/** Detailed description for `nx help <command>`. */
	description?: string;
	/** Example invocations. */
	examples?: string[];
	/** Flag schema (used for `nx help <command>` rendering). */
	flags?: Array<{
		name: string;
		short?: string;
		description: string;
		default?: string | boolean;
		required?: boolean;
	}>;
	/** The handler. Receives parsed args + cwd + loaded config. */
	run(ctx: CommandContext): Promise<number>;
}

export interface CommandContext {
	cwd: string;
	config: import("./config.js").NxConfig;
	positional: string[];
	flags: Record<string, string | boolean | string[]>;
}

/**
 * Context passed to seed file default exports.
 *
 *   import type { SeedContext } from "@nexusts/cli";
 *   export default async function seed(ctx: SeedContext) { ... }
 */
export interface SeedContext {
	db: import("@nexusts/drizzle").DrizzleService;
	logger: import("@nexusts/logger").Logger;
	dialect: string;
	truncate: (table: any) => Promise<void>;
}
