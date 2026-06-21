/**
 * Lenient JSON parser.
 *
 * Standard `JSON.parse` rejects three things that show up regularly
 * in hand-edited `package.json` / `tsconfig.json` files:
 *
 *   1. Line comments:    `// like this`
 *   2. Block comments:   `/* like this *\/`
 *   3. Trailing commas:  `\{ "a": 1, \}` or `[ 1, 2, ]`
 *
 * `bun init` and several other generators emit files with at least
 * some of these (the user's `package.json` had `//` comments and
 * tripped the CLI with `Unrecognized token '/'`).
 *
 * Bun has full JSON5 support built in (`Bun.JSON5.parse()`,
 * `Bun.JSON5.stringify()` — see
 * https://bun.sh/docs/runtime/json5#bun-json5-parse), so this
 * module is a thin pass-through rather than a reimplementation.
 * The CLI runs in Bun >= 1.1.0 (see `engines` in package.json).
 *
 * Use this anywhere the CLI reads a user-owned `package.json` or
 * `tsconfig.json`. For framework-owned files (like the templates
 * we render), use plain `JSON.parse` — they're always strict.
 */
export function parseJsonLoose<T = Record<string, unknown>>(text: string): T {
	return Bun.JSON5.parse(text) as T;
}
