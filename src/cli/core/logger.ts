/**
 * Colored logger for the `nx` CLI.
 *
 * Mirrors the look-and-feel of Adonis ACE / Rails:
 *   - info    → cyan
 *   - success → green
 *   - warn    → yellow
 *   - error   → red
 *   - debug   → dim gray
 *
 * Honors the `NO_COLOR` env var and disables color when stdout is not a
 * TTY (so logs piped into a file don't contain escape codes).
 */

const USE_COLOR =
	process.env["NO_COLOR"] === undefined &&
	process.env["FORCE_COLOR"] !== "0" &&
	process.stdout.isTTY === true;

const wrap = (open: number, close: number) => (s: string) =>
	USE_COLOR ? `\x1b[${open}m${s}\x1b[${close}m` : s;

const c = {
	reset:    wrap(0, 0),
	bold:     wrap(1, 22),
	dim:      wrap(2, 22),
	red:      wrap(31, 39),
	green:    wrap(32, 39),
	yellow:   wrap(33, 39),
	blue:     wrap(34, 39),
	magenta:  wrap(35, 39),
	cyan:     wrap(36, 39),
	gray:     wrap(90, 39),
};

const PREFIXES = {
	info:    `${c.cyan("ℹ")}`,
	success: `${c.green("✔")}`,
	warn:    `${c.yellow("⚠")}`,
	error:   `${c.red("✖")}`,
	debug:   `${c.gray("·")}`,
	finger:  `${c.magenta("➜")}`,
};

export type LoggerLevel = "info" | "success" | "warn" | "error" | "debug";

export class Logger {
	private verbose = false;

	setVerbose(v: boolean) {
		this.verbose = v;
	}

	info(message: string) {
		console.log(`${PREFIXES.info}  ${message}`);
	}

	success(message: string) {
		console.log(`${PREFIXES.success}  ${message}`);
	}

	warn(message: string) {
		console.warn(`${PREFIXES.warn}  ${c.yellow(message)}`);
	}

	error(message: string) {
		console.error(`${PREFIXES.error}  ${c.red(message)}`);
	}

	debug(message: string) {
		if (!this.verbose) return;
		console.log(`${PREFIXES.debug}  ${c.gray(message)}`);
	}

	finger(message: string) {
		console.log(`${PREFIXES.finger}  ${c.magenta(message)}`);
	}

	/**
	 * Render a small table. `rows` is an array of `[label, value]`
	 * tuples; the label column is dimmed.
	 */
	table(rows: Array<[string, string]>) {
		const labelWidth = Math.max(...rows.map(([l]) => l.length));
		for (const [label, value] of rows) {
			const padded = label.padEnd(labelWidth);
			console.log(`  ${c.dim(padded)}  ${value}`);
		}
	}

	heading(text: string) {
		const bar = "─".repeat(text.length + 4);
		console.log(`\n${c.bold(c.cyan(bar))}`);
		console.log(`${c.bold(c.cyan(`  ${text}  `))}`);
		console.log(`${c.bold(c.cyan(bar))}\n`);
	}

	blank() {
		console.log("");
	}
}

export const logger = new Logger();

/** ANSI helpers (exported for templates that want colored output). */
export const colors = c;