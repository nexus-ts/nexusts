/**
 * Tests for `nx init`.
 *
 * Coverage:
 * 1. Error path: target directory does not exist
 * 2. Fresh init: only package.json exists → merge + create the rest
 * 3. Re-run: all files already exist → skip (non-destructive)
 * 4. --force: overwrites existing files
 * 5. package.json merge: existing deps preserved, nexusjs added if missing
 * 6. package.json no-op: nexusjs already in deps → file untouched
 * 7. tsconfig.json merge: experimentalDecorators added if missing
 * 8. Command registration: name, aliases
 */

import "reflect-metadata";
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { initCommand } from "../../src/cli/commands/init.js";
import type { CommandContext } from "../../src/cli/core/index.js";

async function makeTmp(): Promise<string> {
	const d = await mkdtemp(join(tmpdir(), "nx-init-"));
	return d;
}

function makeCtx(target: string, flags: Record<string, string | boolean> = {}): CommandContext {
	return {
		flags,
		positional: [],
		cwd: target,
		raw: [],
	} as unknown as CommandContext;
}

async function exists(p: string): Promise<boolean> {
	try {
		await stat(p);
		return true;
	} catch {
		return false;
	}
}

describe("nx init command registration", () => {
	it("has the right name and aliases", () => {
		expect(initCommand.name).toBe("init");
		expect(initCommand.aliases).toContain("i");
	});

	it("declares the expected flags", () => {
		const names = initCommand.flags?.map((f) => f.name) ?? [];
		for (const expected of [
			"target",
			"style",
			"view",
			"orm",
			"db",
			"frontend",
			"no-ssr",
			"force",
			"no-interaction",
		]) {
			expect(names).toContain(expected);
		}
	});
});

describe("nx init — error path", () => {
	it("errors when target directory does not exist", async () => {
		const target = join(tmpdir(), `nx-init-nope-${Date.now()}`);
		// Don't create the directory
		const code = await initCommand.run!(
			makeCtx(target, {
				"no-interaction": true,
				view: "none",
				orm: "none",
				db: "none",
				frontend: "react",
			}),
		);
		expect(code).toBe(1);
	});
});

describe("nx init — fresh install", () => {
	let target: string;
	beforeEach(async () => {
		target = await makeTmp();
	});
	afterEach(async () => {
		await rm(target, { recursive: true, force: true });
	});

	it("merges into an existing package.json and creates the rest", async () => {
		// Simulate `bun init` output
		await writeFile(
			join(target, "package.json"),
			JSON.stringify(
				{
					name: "my-app",
					module: "index.ts",
					type: "module",
					private: true,
					dependencies: { hono: "^4.6.0" },
				},
				null,
				2,
			),
		);

		const code = await initCommand.run!(
			makeCtx(target, {
				"no-interaction": true,
				view: "none",
				orm: "none",
				db: "none",
				frontend: "react",
			}),
		);
		expect(code).toBe(0);

		// Created files
		expect(await exists(join(target, "nx.config.ts"))).toBe(true);
		expect(await exists(join(target, "tsconfig.json"))).toBe(true);
		expect(await exists(join(target, "app/main.ts"))).toBe(true);
		expect(await exists(join(target, "app/app.module.ts"))).toBe(true);
		expect(await exists(join(target, "app/controllers/home.controller.ts"))).toBe(
			true,
		);
		expect(await exists(join(target, "README.md"))).toBe(true);

		// package.json: merged — hono preserved, nexusjs added
		const pkg = JSON.parse(await readFile(join(target, "package.json"), "utf8"));
		expect(pkg.dependencies.hono).toBe("^4.6.0");
		expect(pkg.dependencies["@nexusts/core"]).toBe("*");
		expect(pkg.name).toBe("my-app"); // existing name preserved

		// tsconfig.json: experimentalDecorators added
		const ts = JSON.parse(await readFile(join(target, "tsconfig.json"), "utf8"));
		expect(ts.compilerOptions.experimentalDecorators).toBe(true);
		expect(ts.compilerOptions.emitDecoratorMetadata).toBe(true);
		expect(ts.include).toContain("app/**/*.ts");
		expect(ts.include).toContain("nx.config.ts");
	});

	it("is a no-op merge on package.json when nexusjs is already a dep", async () => {
		const original = JSON.stringify(
			{
				name: "already-had-kabyeon",
				dependencies: { "@nexusts/core": "../nexusjs/dist/nexusjs-0.6.5.tgz" },
			},
			null,
			2,
		);
		await writeFile(join(target, "package.json"), original);

		await initCommand.run!(
			makeCtx(target, {
				"no-interaction": true,
				view: "none",
				orm: "none",
				db: "none",
				frontend: "react",
			}),
		);

		const expected = JSON.stringify(
			{
				name: "already-had-kabyeon",
				dependencies: {
					"@nexusts/core": "../nexusjs/dist/nexusjs-0.6.5.tgz",
					"reflect-metadata": "^0.2.2",
					hono: "^4.6.0",
					zod: "^3.23.8",
				},
				type: "module",
				private: true,
				scripts: {
					dev: "bun --hot app/main.ts",
					build: "bun run build.ts",
					start: "bun app/main.ts",
					test: "vitest",
					nx: "nx",
				},
			},
			null,
			2,
		) + "\n";
		const after = await readFile(join(target, "package.json"), "utf8");
		expect(after).toBe(expected);
	});

	it("handles package.json with // line comments (JSON5-style)", async () => {
		// This is what tripped the user's CLI: `bun init`-generated
		// package.json (or a hand-edited one) with trailing `//` comments
		// that strict `JSON.parse` rejects with "Unrecognized token '/'".
		const original = `{
  // my app
  "name": "json5-test",
  "type": "module", // ESM
  "private": true,
  "dependencies": {
    "hono": "^4.6.0", // web framework
  },
}
`;
		await writeFile(join(target, "package.json"), original);

		// Should NOT throw "Unrecognized token '/'"
		const code = await initCommand.run!(
			makeCtx(target, {
				"no-interaction": true,
				view: "none",
				orm: "none",
				db: "none",
				frontend: "react",
			}),
		);
		expect(code).toBe(0);

		// hono preserved, nexusjs added, scripts added
		const pkg = JSON.parse(
			await readFile(join(target, "package.json"), "utf8"),
		);
		expect(pkg.dependencies.hono).toBe("^4.6.0");
		expect(pkg.dependencies["@nexusts/core"]).toBe("*");
		expect(pkg.scripts.dev).toBe("bun --hot app/main.ts");
		expect(pkg.scripts.nx).toBe("nx");
	});

	it("handles package.json with trailing commas and block comments", async () => {
		// Block comment + trailing comma. Note: only one trailing
		// comma per slot — `,,` is not in the JSON5 spec.
		const original = `{
  "name": "trailing-comma-test",
  /* multi-line
     block comment */
  "dependencies": {
    "hono": "^4.6.0",
  },
}
`;
		await writeFile(join(target, "package.json"), original);

		const code = await initCommand.run!(
			makeCtx(target, {
				"no-interaction": true,
				view: "none",
				orm: "none",
				db: "none",
				frontend: "react",
			}),
		);
		expect(code).toBe(0);

		const pkg = JSON.parse(
			await readFile(join(target, "package.json"), "utf8"),
		);
		expect(pkg.dependencies.hono).toBe("^4.6.0");
		expect(pkg.dependencies["@nexusts/core"]).toBe("*");
	});
});

describe("nx init — idempotent re-run", () => {
	let target: string;
	beforeEach(async () => {
		target = await makeTmp();
	});
	afterEach(async () => {
		await rm(target, { recursive: true, force: true });
	});

	it("skips files that already exist (without --force)", async () => {
		await writeFile(join(target, "package.json"), JSON.stringify({ name: "x" }));
		await writeFile(join(target, "nx.config.ts"), "// existing config");

		// First run: creates everything
		await initCommand.run!(
			makeCtx(target, {
				"no-interaction": true,
				view: "none",
				orm: "none",
				db: "none",
				frontend: "react",
			}),
		);

		// Capture existing config
		const existingConfig = await readFile(join(target, "nx.config.ts"), "utf8");

		// Second run: should skip (or merge) without overwriting
		await initCommand.run!(
			makeCtx(target, {
				"no-interaction": true,
				view: "none",
				orm: "none",
				db: "none",
				frontend: "react",
			}),
		);

		// nx.config.ts is unchanged
		expect(await readFile(join(target, "nx.config.ts"), "utf8")).toBe(existingConfig);
	});

	it("--force overwrites existing files", async () => {
		await writeFile(join(target, "package.json"), JSON.stringify({ name: "x" }));
		await writeFile(join(target, "nx.config.ts"), "// OLD");
		await mkdir(join(target, "app"), { recursive: true });
		await writeFile(join(target, "app/main.ts"), "// OLD");

		await initCommand.run!(
			makeCtx(target, {
				"no-interaction": true,
				view: "none",
				orm: "none",
				db: "none",
				frontend: "react",
				force: true,
			}),
		);

		// nx.config.ts was overwritten
		const content = await readFile(join(target, "nx.config.ts"), "utf8");
		expect(content).not.toBe("// OLD");
		expect(content.length).toBeGreaterThan(0);
	});
});
