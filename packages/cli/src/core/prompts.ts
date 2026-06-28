/**
 * Lightweight interactive prompts.
 *
 * Avoids a runtime dependency on a TTY prompt library — we only need
 * confirm / select / text prompts, all of which can be done with
 * `readline` and a fallback to defaults when stdin is not a TTY.
 *
 * Every prompt can be skipped with `--no-interaction` or by passing the
 * answer via flags. This mirrors Adonis ACE and Symfony Console.
 */

import { createInterface } from "node:readline";
import { logger } from "./logger.js";

export interface PromptOptions {
	/** Default value when the user just presses enter. */
	default?: string;
	/** Choices for select. The first one is the default. */
	choices?: string[];
	/** When false, stdin must be a TTY — otherwise the default is used. */
	interactive?: boolean;
}

export async function prompt(
	message: string,
	options: PromptOptions = {},
): Promise<string> {
	const interactive = options.interactive ?? true;
	const fallback = options.default ?? options.choices?.[0];

	if (!interactive || !process.stdin.isTTY) {
		if (fallback === undefined) {
			throw new Error(
				`No default provided for non-interactive prompt: ${message}`,
			);
		}
		return fallback;
	}

	const rl = createInterface({ input: process.stdin, output: process.stdout });
	return new Promise((resolve) => {
		const suffix = options.choices ? ` [${options.choices.join("/")}]` : "";
		const def = options.default ?? options.choices?.[0] ?? "";
		const promptStr = `  ${message}${suffix} (${def}): `;
		rl.question(promptStr, (answer) => {
			rl.close();
			const trimmed = answer.trim();
			resolve(trimmed === "" ? def : trimmed);
		});
	});
}

export async function confirm(
	message: string,
	defaultYes = false,
	options: PromptOptions = {},
): Promise<boolean> {
	const interactive = options.interactive ?? true;
	if (!interactive || !process.stdin.isTTY) return defaultYes;

	const rl = createInterface({ input: process.stdin, output: process.stdout });
	return new Promise((resolve) => {
		const suffix = defaultYes ? " [Y/n]" : " [y/N]";
		rl.question(`  ${message}${suffix}: `, (answer) => {
			rl.close();
			const v = answer.trim().toLowerCase();
			if (v === "") resolve(defaultYes);
			else resolve(v === "y" || v === "yes");
		});
	});
}

export async function select(
	message: string,
	choices: string[],
	options: PromptOptions = {},
): Promise<string> {
	return prompt(message, { ...options, choices });
}

// ---------------------------------------------------------------------------
// Shared project scaffolding options (used by both `new` and `init`)
// ---------------------------------------------------------------------------

/** Valid values for each interactive project-scaffold prompt. */
export const VALID_PROJECT_OPTIONS = {
	runtime: ["bun", "cloudflare"] as const,
	style: ["nest", "adonis", "functional"] as const,
	view: ["rendu", "edge", "eta", "inertia", "none"] as const,
	orm: ["drizzle", "kysely", "none"] as const,
	db: ["sqlite",  "postgres", "mysql", "none"] as const,
	frontend: ["react", "vue", "svelte", "solid"] as const,
} as const;

/**
 * Resolve a project option from flags or interactive prompt.
 * Validates flag values against the allowed list and re-prompts on invalid input.
 * Shared between `nx new` and `nx init`.
 */
export async function resolveProjectOption(
	flags: Record<string, unknown>,
	key: string,
	valid: readonly string[],
	defaultVal: string,
	interactive: boolean,
): Promise<string> {
	const flagVal = flags[key] as string | undefined;
	if (flagVal) {
		if (valid.includes(flagVal)) return flagVal;
		if (!interactive) {
			logger.error(`Invalid --${key} "${flagVal}". Valid values: ${valid.join(", ")}`);
			process.exit(1);
		}
		logger.warn(`"${flagVal}" is not valid for --${key}. Please choose from the list.`);
	}

	const label = key === "runtime"
		? "Runtime target" as const
		: key === "style"
			? "Routing style" as const
			: key === "view"
				? "View engine" as const
				: key === "orm"
					? "ORM" as const
					: key === "db"
						? "Database" as const
						: key === "frontend"
							? "Inertia frontend" as const
							: key;

	// Loop until the user provides a valid value (interactive only).
	for (;;) {
		const answer = await select(label, [...valid], { default: defaultVal });
		if (valid.includes(answer)) return answer;
		logger.warn(`"${answer}" is not valid. Please choose from: ${valid.join(", ")}`);
	}
}
