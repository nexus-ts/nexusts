/**
 * Minimal argv parser for the `nx` CLI.
 *
 * Supports:
 *   - positional args
 *   - short flags (-v, -p 3000)
 *   - long flags (--verbose, --port=3000, --port 3000)
 *   - boolean toggles (--no-color / --color)
 *   - `--` end-of-options marker
 *
 * Usage:
 *   const { command, positional, flags } = parseArgs(process.argv.slice(2));
 */

export interface ParsedArgs {
	/** Subcommand name (first positional arg, e.g. `make:controller`). */
	command: string | undefined;
	/** Remaining positional args after the command. */
	positional: string[];
	/** Flag map: long → string | boolean | string[]. */
	flags: Record<string, string | boolean | string[]>;
}

const LONG_RE = /^--([^=]+)(?:=(.*))?$/;
const SHORT_RE = /^-([A-Za-z])$/;

export function parseArgs(argv: string[]): ParsedArgs {
	const positional: string[] = [];
	const flags: Record<string, string | boolean | string[]> = {};
	let endOfOptions = false;

	let i = 0;
	while (i < argv.length) {
		const arg = argv[i]!;

		if (arg === "--") {
			endOfOptions = true;
			i++;
			continue;
		}

		if (endOfOptions || !arg.startsWith("-")) {
			positional.push(arg);
			i++;
			continue;
		}

		const longMatch = LONG_RE.exec(arg);
		if (longMatch) {
			const [, name, inline] = longMatch;
			const flagName = name!;

			if (inline !== undefined) {
				setFlag(flags, flagName, inline);
				i++;
				continue;
			}

			// `--flag` (boolean) or `--flag value` (consume next arg if no leading dash)
			const next = argv[i + 1];
			if (next !== undefined && !next.startsWith("-")) {
				setFlag(flags, flagName, next);
				i += 2;
			} else {
				setFlag(flags, flagName, true);
				i++;
			}
			continue;
		}

		const shortMatch = SHORT_RE.exec(arg);
		if (shortMatch) {
			const flagName = shortMatch[1]!;
			const next = argv[i + 1];
			if (next !== undefined && !next.startsWith("-")) {
				setFlag(flags, flagName, next);
				i += 2;
			} else {
				setFlag(flags, flagName, true);
				i++;
			}
			continue;
		}

		// Unknown flag shape — treat as positional.
		positional.push(arg);
		i++;
	}

	const command = positional.shift();
	return { command, positional, flags };
}

function setFlag(
	flags: Record<string, string | boolean | string[]>,
	name: string,
	value: string | boolean,
) {
	// `--no-foo` toggles `foo` to false.
	if (name.startsWith("no-") && value === true) {
		const key = name.slice(3);
		flags[key] = false;
		return;
	}

	const existing = flags[name];
	if (existing === undefined) {
		flags[name] = value;
	} else if (Array.isArray(existing)) {
		existing.push(typeof value === "string" ? value : String(value));
	} else {
		flags[name] = [String(existing), typeof value === "string" ? value : String(value)];
	}
}

/** Coerce a flag value to string with a default. */
export function flagString(
	flags: Record<string, string | boolean | string[]>,
	name: string,
	fallback?: string,
): string | undefined {
	const v = flags[name];
	if (v === undefined || v === false) return fallback;
	if (typeof v === "string") return v;
	if (Array.isArray(v)) return v[0];
	return String(v);
}

/** Coerce a flag value to boolean with a default. */
export function flagBool(
	flags: Record<string, string | boolean | string[]>,
	name: string,
	fallback = false,
): boolean {
	const v = flags[name];
	if (v === undefined) return fallback;
	if (typeof v === "boolean") return v;
	return v !== "false" && v !== "0" && v !== "no";
}

/** Read a flag list (each occurrence appends). */
export function flagList(
	flags: Record<string, string | boolean | string[]>,
	name: string,
): string[] {
	const v = flags[name];
	if (v === undefined) return [];
	if (Array.isArray(v)) return v;
	if (typeof v === "string") return [v];
	return [String(v)];
}