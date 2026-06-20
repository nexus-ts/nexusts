/**
 * Filesystem helpers for the CLI.
 */

import { existsSync, mkdirSync, writeFileSync, statSync, readFileSync } from "node:fs";
import { dirname, resolve, isAbsolute, relative } from "node:path";

export interface WriteOptions {
	/** Skip writing if the file exists. Default `false` (overwrite OK). */
	skipIfExists?: boolean;
	/** Make the path absolute relative to this directory. Default cwd. */
	base?: string;
}

/**
 * Write a file, creating parent directories as needed.
 * Throws if `skipIfExists` is `true` and the file already exists.
 */
export function writeFile(path: string, contents: string, opts: WriteOptions = {}): boolean {
	const base = opts.base ?? process.cwd();
	const target = isAbsolute(path) ? path : resolve(base, path);

	if (opts.skipIfExists && existsSync(target)) {
		return false;
	}

	mkdirSync(dirname(target), { recursive: true });
	writeFileSync(target, contents);
	return true;
}

/**
 * Read a file, or return `undefined` if missing.
 */
export function readFile(path: string): string | undefined {
	if (!existsSync(path)) return undefined;
	return readFileSync(path, "utf8");
}

/** True if a file exists at the given path. */
export function fileExists(path: string): boolean {
	return existsSync(path);
}

/** True if a directory exists at the given path. */
export function directoryExists(path: string): boolean {
	try {
		return existsSync(path) && statSync(path).isDirectory();
	} catch {
		return false;
	}
}

/** Compute a project-relative path. */
export function relativePath(from: string, to: string): string {
	const r = relative(from, to);
	return r.startsWith(".") ? r : `./${r}`;
}

/**
 * Convert a name like "User", "user", "users", "user_profile" into a
 * consistent set of variants used by templates.
 */
export function nameVariants(input: string) {
	const trimmed = input.replace(/\.(ts|js|tsx|jsx)$/, "");

	// PascalCase.
	const pascal = trimmed
		.split(/[\s_-]+/)
		.map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
		.filter(Boolean)
		.join("") || input;

	// camelCase.
	const camel = pascal.charAt(0).toLowerCase() + pascal.slice(1);

	// snake_case.
	const snake = pascal
		.split(/(?=[A-Z])/)
		.map((w) => w.toLowerCase())
		.filter(Boolean)
		.join("_");

	// kebab-case.
	const kebab = snake.replace(/_/g, "-");

	return {
		pascal,
		camel,
		snake,
		kebab,
		plural: pluralize(pascal),
		pluralSnake: pluralize(snake),
		pluralKebab: pluralize(kebab),
	};
}

/** English pluralization (matches `core/template.ts`). */
function pluralize(s: string): string {
	if (!s) return s;
	if (/(s|x|z|ch|sh)$/i.test(s)) return `${s}es`;
	if (/[^aeiou]y$/i.test(s)) return `${s.slice(0, -1)}ies`;
	if (/y$/i.test(s)) return `${s}s`;
	return `${s}s`;
}