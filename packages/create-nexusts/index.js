#!/usr/bin/env node
/**
 * create-nexusts — scaffold a new NexusTS project.
 *
 * Usage:
 *   bun create nexusts@latest
 *   bunx create-nexusts@latest
 *
 * Examples:
 *   bun create nexusts@latest my-app
 *   bun create nexusts@latest my-app --view rendu --orm drizzle --db bun-sqlite
 *
 * Internally calls `bunx @nexusts/core init` in the new directory to
 * do the heavy lifting.
 */

import { spawn } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve, join } from "node:path";

const args = process.argv.slice(2);
const name = args[0];

// ── Help / version flags ────────────────────────────────────────────
if (!name || name === "-h" || name === "--help" || name === "-?") {
	console.log(`
  create-nexusts — scaffold a new NexusTS project

  Usage:
    bun create nexusts@latest [name] [options]

  Examples:
    bun create nexusts@latest my-app
    bun create nexusts@latest my-app --view rendu --orm drizzle --db bun-sqlite

  Options:
    --style <nest|adonis|functional>   Routing style (default: nest)
    --view  <rendu|edge|eta|inertia|none>   View engine (default: rendu)
    --orm   <drizzle|prisma|kysely|none>   ORM (default: drizzle)
    --db    <bun-sqlite|postgres|mysql|none>   Database (default: bun-sqlite)
`);
	process.exit(name ? 0 : 1);
}

if (name === "-v" || name === "--version") {
	const pkg = JSON.parse(
		(await import("node:fs")).readFileSync(
			new URL("./package.json", import.meta.url),
			"utf8",
		),
	);
	console.log(`create-nexusts v${pkg.version}`);
	process.exit(0);
}

const target = resolve(process.cwd(), name);

if (existsSync(target)) {
	console.error(`\n  ✖  Error: Directory "${name}" already exists.\n`);
	process.exit(1);
}

mkdirSync(target, { recursive: true });

// Create a minimal package.json so the init command can merge into it.
writeFileSync(
	join(target, "package.json"),
	JSON.stringify({ name, type: "module", private: true }, null, 2) + "\n",
);

console.log(`\n  ✦  Scaffolding ${name}...\n`);

// Bun is always the runner.
const runner = "bunx";

// Determine if we're running inside the monorepo (local development).
// If so, use the local CLI directly instead of downloading from npm.
const monorepoRoot = resolve(import.meta.dirname, "..", "..");
const cliEntry = join(monorepoRoot, "packages", "cli", "src", "index.ts");
const isLocalDev = existsSync(cliEntry);

let child;
if (isLocalDev) {
	// Local dev: run the CLI directly from the monorepo.
	const initArgs = ["init", "--no-interaction", ...args.slice(1)];
	child = spawn(process.argv[0], [cliEntry, ...initArgs], {
		cwd: target,
		stdio: "inherit",
		shell: process.platform === "win32",
	});
} else {
	// Published: run @nexusts/cli init via the package runner.
	const initArgs = ["@nexusts/cli", "init", "--no-interaction", ...args.slice(1)];
	child = spawn(runner, initArgs, {
		cwd: target,
		stdio: "inherit",
		shell: process.platform === "win32",
	});
}

child.on("exit", (code) => {
	if (code === 0) {
		console.log(`
  ✦  Done!

     cd ${name}
     bun install
     bun run dev

  Happy hacking with NexusTS!
`);
	} else {
		process.exit(code ?? 1);
	}
});
