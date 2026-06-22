#!/usr/bin/env node
/**
 * create-nexusjs — scaffold a new NexusJS project.
 *
 * Usage:
 *   bunx create-nexusjs my-app
 *   npx create-nexusjs my-app --view rendu --orm drizzle --db bun-sqlite
 */

import { spawn } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";

const args = process.argv.slice(2);
const name = args[0];

if (!name || name.startsWith("-")) {
  console.error("Usage: bunx create-nexusjs <project-name> [options]");
  console.error("");
  console.error("Examples:");
  console.error("  bunx create-nexusjs my-app");
  console.error("  bunx create-nexusjs my-app --orm drizzle --db postgres");
  console.error("  bunx create-nexusjs my-app --view none");
  process.exit(1);
}

const target = resolve(process.cwd(), name);

if (existsSync(target)) {
  console.error(`Error: Directory "${name}" already exists.`);
  process.exit(1);
}

mkdirSync(target, { recursive: true });

// Create a minimal package.json so the init command can merge into it.
const { writeFileSync } = await import("node:fs");
const { join } = await import("node:path");
writeFileSync(
  join(target, "package.json"),
  JSON.stringify({ name, type: "module", private: true }, null, 2) + "\n",
);

console.log(`\nScaffolding ${name}...\n`);

// Run nx init in the target directory.
const child = spawn(
  "npx",
  ["@kabyeon/nexusjs", "init", "--no-interaction", ...args.slice(1)],
  {
    cwd: target,
    stdio: "inherit",
    shell: process.platform === "win32",
  },
);

child.on("exit", (code) => {
  if (code === 0) {
    console.log(`\nDone! cd ${name} && bun install && bun run dev\n`);
  } else {
    process.exit(code ?? 1);
  }
});
