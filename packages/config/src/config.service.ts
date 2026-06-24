/**
 * `ConfigService` — type-safe access to validated environment
 * variables and configuration values.
 *
 * Usage:
 *   constructor(@Inject(ConfigService.TOKEN) private config: ConfigService<typeof schema>) {}
 *
 *   const dbUrl = this.config.get('DATABASE_URL');          // string
 *   const port = this.config.get('PORT', { default: 3000 }); // number
 *
 * For full type inference, parameterize the class with your schema:
 *   class MyService {
 *     constructor(@Inject(ConfigService.TOKEN) private config: ConfigService<typeof schema>) {}
 *   }
 */

import { Inject, Injectable } from "@nexusts/core";
import type {
	ConfigOptions,
	ConfigSchema,
	InferConfig,
	LoadedConfig,
} from "./types.js";

@Injectable()
export class ConfigService<S extends ConfigSchema = ConfigSchema> {
	/** DI token — use with `@Inject(ConfigService.TOKEN)`. */
	static readonly TOKEN = Symbol.for("nexus:ConfigService");

	/** The validated, fully-typed config. */
	readonly config: InferConfig<S>;

	#raw: Record<string, string | undefined>;
	#cache = new Map<string, unknown>();
	#strict: boolean;

	constructor(
		@Inject("CONFIG_OPTIONS") private readonly options: ConfigOptions<S> = {},
	) {
		const loaded = loadConfig(options);
		this.config = loaded.value as InferConfig<S>;
		this.#raw = loaded.raw;
		this.#strict = options.strict ?? false;

		if (loaded.errors.length > 0) {
			const msg =
				`[nexus/config] Configuration validation failed:\n` +
				loaded.errors.map((e) => `  - ${e}`).join("\n");
			if (options.exitOnError) {
				console.error(msg);
				process.exit(1);
			}
			throw new Error(msg);
		}
	}

	/**
	 * Look up a config value by key. Type-safe when the class is
	 * parameterized with the schema (`ConfigService<typeof schema>`).
	 */
	get<K extends keyof InferConfig<S>>(key: K): InferConfig<S>[K];
	get<K extends keyof InferConfig<S>>(
		key: K,
		options: { default: InferConfig<S>[K] },
	): InferConfig<S>[K];
	get(key: string): unknown;
	get(key: string, options?: { default?: unknown }): unknown {
		if (this.options.cache !== false && this.#cache.has(key)) {
			return this.#cache.get(key);
		}
		const fromConfig = (this.config as Record<string, unknown>)[key];
		if (fromConfig !== undefined) {
			if (this.options.cache !== false) this.#cache.set(key, fromConfig);
			return fromConfig;
		}
		if (options && "default" in options) {
			return options.default;
		}
		if (this.#strict) {
			throw new Error(`[nexus/config] Unknown config key "${key}"`);
		}
		return undefined;
	}

	/**
	 * Look up a config value by key, throwing if it's missing.
	 * Convenience for required values.
	 */
	require<K extends keyof InferConfig<S>>(key: K): InferConfig<S>[K] {
		const v = this.get(key);
		if (v === undefined || v === null || v === "") {
			throw new Error(`[nexus/config] Required config key "${String(key)}" is missing`);
		}
		return v as InferConfig<S>[K];
	}

	/**
	 * Read the raw env value (string), regardless of the schema.
	 * Useful for debugging.
	 */
	env(key: string): string | undefined {
		return this.#raw[key];
	}

	/** Reload from env. Drops the cache. */
	reload(): void {
		this.#cache.clear();
		const loaded = loadConfig(this.options);
		Object.assign(this.config as object, loaded.value);
		this.#raw = loaded.raw;
	}
}

/**
 * Internal: load + validate config.
 *
 * Order: static `load` overrides → `.env` files → `process.env`.
 * Env wins on conflict (most recent takes precedence).
 */
function loadConfig<S extends ConfigSchema>(
	options: ConfigOptions<S>,
): LoadedConfig<S> {
	// 1) process.env as the base layer
	const env: Record<string, string | undefined> = {};
	for (const [k, v] of Object.entries(process.env)) {
		env[k] = v;
	}

	// 2) .env files (overrides env defaults but env still wins)
	const paths = options.envFilePaths ?? [];

	// When envFile is enabled (default), auto-load environment-specific files.
	const useEnvFile = options.envFile !== false;
	if (useEnvFile) {
		const nodeEnv = options.nodeEnv ?? process.env["NODE_ENV"] ?? "development";
		// Base .env is always loaded first.
		if (!paths.includes(".env")) paths.unshift(".env");
		// .env.local — local overrides (should be .gitignored).
		if (!paths.includes(".env.local")) paths.push(".env.local");
		// .env.{NODE_ENV} — environment-specific (e.g. .env.production).
		const envSpecific = `.env.${nodeEnv}`;
		if (!paths.includes(envSpecific)) paths.push(envSpecific);
	}

	for (const p of paths) {
		const file = readDotEnv(p);
		for (const [k, v] of Object.entries(file)) {
			if (env[k] === undefined) env[k] = v;
		}
	}

	// 3) Static load() overrides
	const merged: Record<string, unknown> = { ...env };
	if (options.load) {
		for (const layer of options.load) {
			for (const [k, v] of Object.entries(layer)) {
				if (!(k in env)) merged[k] = v;
			}
		}
	}

	// 4) Validate through Zod
	const schema = options.schema;
	if (!schema) {
		return { value: merged as InferConfig<S>, raw: env, errors: [] };
	}
	const result = schema.safeParse(merged);
	if (result.success) {
		return { value: result.data as InferConfig<S>, raw: env, errors: [] };
	}
	const errors = result.error.issues.map(
		(i) => `${i.path.join(".") || "(root)"}: ${i.message}`,
	);
	return { value: merged as InferConfig<S>, raw: env, errors };
}

/**
 * Minimal .env reader. Avoids a runtime dep on `dotenv`.
 * Supports `KEY=value` lines, comments, and quoted values.
 */
function readDotEnv(path: string): Record<string, string> {
	try {
		// Bun has Bun.file(); Node has node:fs. Use whichever is available.
		// eslint-disable-next-line @typescript-eslint/no-require-imports
		const fs = require("node:fs") as typeof import("node:fs");
		if (!fs.existsSync(path)) return {};
		const text = fs.readFileSync(path, "utf8");
		const out: Record<string, string> = {};
		for (const rawLine of text.split(/\r?\n/)) {
			const line = rawLine.trim();
			if (!line || line.startsWith("#")) continue;
			const eq = line.indexOf("=");
			if (eq < 0) continue;
			const key = line.slice(0, eq).trim();
			let value = line.slice(eq + 1).trim();
			// Strip inline comments after unquoted values.
			if (!value.startsWith('"') && !value.startsWith("'")) {
				const hash = value.indexOf(" #");
				if (hash >= 0) value = value.slice(0, hash).trim();
			}
			// Strip surrounding quotes.
			if (
				(value.startsWith('"') && value.endsWith('"')) ||
				(value.startsWith("'") && value.endsWith("'"))
			) {
				value = value.slice(1, -1);
			}
			out[key] = value;
		}
		return out;
	} catch {
		return {};
	}
}