/**
 * CLI version — read from the CLI's own package.json at import time.
 *
 * Uses `readFileSync` + `JSON.parse` because the CLI is bundled into a
 * single `dist/index.js` by Bun.build, and dynamic `import()` of
 * `package.json` would resolve relative to the bundle file at runtime
 * (which is correct here — the package.json always sits one level up
 * from `dist/`).
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Resolve relative to this source file: ../package.json
// In the bundled dist/index.js, __dirname = packages/cli/dist/
// So ../package.json = packages/cli/package.json ✓
const PKG_JSON = resolve(__dirname, "..", "package.json");

function loadVersion(): string {
	try {
		if (!existsSync(PKG_JSON)) return "0.0.0";
		const raw = readFileSync(PKG_JSON, "utf-8");
		const pkg = JSON.parse(raw) as { version?: string };
		return pkg.version ?? "0.0.0";
	} catch {
		return "0.0.0";
	}
}

export const VERSION: string = loadVersion();
