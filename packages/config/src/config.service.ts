/**
 * `ConfigService` — type-safe access to validated environment
 * variables and configuration values.
 */
import { Inject, Injectable } from "@nexusts/core";
import type {
	ConfigSchema,
	InferConfig,
	ConfigOptions,
} from "./types.js";

@Injectable()
export class ConfigService<S extends ConfigSchema = ConfigSchema> {
	static readonly TOKEN = Symbol.for("nexus:ConfigService");

	@Inject("CONFIG_OPTIONS") declare private _diOptions: ConfigOptions<S>;

	readonly config: InferConfig<S>;
	#raw: Record<string, string | undefined>;
	#cache = new Map<string, unknown>();
	#strict: boolean;
	#options: ConfigOptions<S>;

	constructor(options?: ConfigOptions<S>) {
		const opts = options ?? this._diOptions ?? ({} as ConfigOptions<S>);
		this.#options = opts;
		const loaded = loadConfig(opts);
		this.config = loaded.value as InferConfig<S>;
		this.#raw = loaded.raw;
		this.#strict = opts.strict ?? false;
		if (loaded.errors.length > 0) {
			const msg = `[nexus/config] Configuration validation failed:\n` +
				loaded.errors.map((e) => `  - ${e}`).join("\n");
			if (opts.exitOnError) { console.error(msg); process.exit(1); }
			throw new Error(msg);
		}
	}

	get<K extends keyof InferConfig<S>>(key: K): InferConfig<S>[K];
	get<K extends keyof InferConfig<S>>(key: K, options: { default: InferConfig<S>[K] }): InferConfig<S>[K];
	get(key: string): unknown;
	get(key: string, options?: { default?: unknown }): unknown {
		const opts = this.#options;
		if (opts.cache !== false && this.#cache.has(key)) return this.#cache.get(key);
		const fromConfig = (this.config as Record<string, unknown>)[key];
		if (fromConfig !== undefined) {
			if (opts.cache !== false) this.#cache.set(key, fromConfig);
			return fromConfig;
		}
		if (options && "default" in options) return options.default;
		if (this.#strict) throw new Error(`[nexus/config] Unknown config key "${key}"`);
		return undefined;
	}

	require<K extends keyof InferConfig<S>>(key: K): InferConfig<S>[K] {
		const v = this.get(key);
		if (v === undefined || v === null || v === "") throw new Error(`[nexus/config] Required config key "${String(key)}" is missing`);
		return v as InferConfig<S>[K];
	}

	env(key: string): string | undefined {
		return this.#raw[key];
	}

	reload(): void {
		this.#cache.clear();
		const loaded = loadConfig(this.#options);
		Object.assign(this.config as object, loaded.value);
		this.#raw = loaded.raw;
	}
}

// ===========================================================================
// Internal helpers
// ===========================================================================

interface LoadedConfigResult<S extends ConfigSchema = ConfigSchema> {
	value: InferConfig<S>;
	raw: Record<string, string | undefined>;
	errors: string[];
}

function loadConfig<S extends ConfigSchema>(options: ConfigOptions<S>): LoadedConfigResult<S> {
	const env: Record<string, string | undefined> = {};
	for (const [k, v] of Object.entries(process.env)) env[k] = v;

	const paths = options.envFilePaths ?? [];
	const useEnvFile = options.envFile !== false;
	if (useEnvFile) {
		const nodeEnv = options.nodeEnv ?? process.env.NODE_ENV ?? "development";
		if (!paths.includes(".env")) paths.unshift(".env");
		if (!paths.includes(".env.local")) paths.push(".env.local");
		const envSpecific = `.env.${nodeEnv}`;
		if (!paths.includes(envSpecific)) paths.push(envSpecific);
	}
	for (const p of paths) {
		const file = readDotEnv(p);
		for (const [k, v] of Object.entries(file)) {
			if (env[k] === undefined) env[k] = v;
		}
	}

	const merged: Record<string, unknown> = { ...env };
	if (options.load) {
		for (const layer of options.load) {
			for (const [k, v] of Object.entries(layer)) {
				if (!(k in env)) merged[k] = v;
			}
		}
	}

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

function readDotEnv(path: string): Record<string, string> {
	try {
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
			if (!value.startsWith('"') && !value.startsWith("'")) {
				const hash = value.indexOf(" #");
				if (hash >= 0) value = value.slice(0, hash).trim();
			}
			if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
				value = value.slice(1, -1);
			}
			out[key] = value;
		}
		return out;
	} catch {
		return {};
	}
}
