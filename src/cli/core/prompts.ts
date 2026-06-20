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