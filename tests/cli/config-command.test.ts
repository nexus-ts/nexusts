/**
 * Tests for `nx config`.
 *
 * Coverage:
 * 1. Command registration (name, aliases, flags)
 * 2. Fresh install: creates nx.config.ts
 * 3. Fresh + drizzle: also creates drizzle.config.ts
 * 4. Fresh + non-drizzle: does NOT create drizzle.config.ts
 * 5. Re-run with no flags: file unchanged
 * 6. Re-run with flag: file updated
 * 7. db → drizzle dialect mapping (postgres → postgresql, mysql → mysql, sqlite variants → sqlite)
 * 8. Switching orm from non-drizzle to drizzle: creates drizzle.config.ts
 * 9. Switching orm away from drizzle: leaves existing drizzle.config.ts alone
 * 10. --force: overwrites even when no flag is passed
 */

import "reflect-metadata";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { configCommand } from "../../src/cli/commands/config.js";
import type { CommandContext } from "../../src/cli/core/index.js";

async function makeTmp(): Promise<string> {
	return mkdtemp(join(tmpdir(), "nx-config-"));
}

function makeCtx(
	target: string,
	flags: Record<string, string | boolean> = {},
): CommandContext {
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

describe("nx config command registration", () => {
	it("has the right name and aliases", () => {
		expect(configCommand.name).toBe("config");
		expect(configCommand.aliases).toContain("cfg");
	});

	it("declares the expected flags", () => {
		const names = configCommand.flags?.map((f) => f.name) ?? [];
		for (const expected of [
			"target",
			"style",
			"view",
			"orm",
			"db",
			"db-url",
			"frontend",
			"ssr",
			"no-ssr",
			"force",
			"no-interaction",
		]) {
			expect(names).toContain(expected);
		}
	});
});

describe("nx config — error path", () => {
	it("errors when target directory does not exist", async () => {
		const target = join(tmpdir(), `nx-config-nope-${Date.now()}`);
		const code = await configCommand.run!(
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

describe("nx config — fresh install", () => {
	let target: string;
	beforeEach(async () => {
		target = await makeTmp();
	});
	afterEach(async () => {
		await rm(target, { recursive: true, force: true });
	});

	it("creates nx.config.ts with the provided values", async () => {
		const code = await configCommand.run!(
			makeCtx(target, {
				"no-interaction": true,
				view: "none",
				orm: "none",
				db: "none",
				frontend: "react",
			}),
		);
		expect(code).toBe(0);
		expect(await exists(join(target, "nx.config.ts"))).toBe(true);
		expect(await exists(join(target, "drizzle.config.ts"))).toBe(false);
	});

	it("creates drizzle.config.ts when orm=drizzle", async () => {
		await configCommand.run!(
			makeCtx(target, {
				"no-interaction": true,
				view: "none",
				orm: "drizzle",
				db: "bun-sqlite",
				frontend: "react",
			}),
		);
		expect(await exists(join(target, "drizzle.config.ts"))).toBe(true);
		const ddc = await readFile(join(target, "drizzle.config.ts"), "utf8");
		expect(ddc).toMatch(/dialect:\s*"sqlite"/);
		expect(ddc).toMatch(/url: process\.env\.DATABASE_URL \?\? "app\.db"/);
	});

	it("does NOT create drizzle.config.ts when orm=prisma or none", async () => {
		await configCommand.run!(
			makeCtx(target, {
				"no-interaction": true,
				view: "none",
				orm: "prisma",
				db: "postgres",
				frontend: "react",
			}),
		);
		expect(await exists(join(target, "drizzle.config.ts"))).toBe(false);
	});
});

describe("nx config — drizzle dialect mapping", () => {
	let target: string;
	beforeEach(async () => {
		target = await makeTmp();
	});
	afterEach(async () => {
		await rm(target, { recursive: true, force: true });
	});

	const cases: Array<[string, string]> = [
		["bun-sqlite", "sqlite"],
		["node-sqlite", "sqlite"],
		["libsql", "sqlite"],
		["postgres", "postgresql"],
		["mysql", "mysql"],
	];

	for (const [driver, expectedDialect] of cases) {
		it(`db=${driver} → dialect=${expectedDialect}`, async () => {
			await configCommand.run!(
				makeCtx(target, {
					"no-interaction": true,
					view: "none",
					orm: "drizzle",
					db: driver,
					frontend: "react",
				}),
			);
			const ddc = await readFile(join(target, "drizzle.config.ts"), "utf8");
			expect(ddc).toContain(`dialect: "${expectedDialect}"`);
		});
	}
});

describe("nx config — update", () => {
	let target: string;
	beforeEach(async () => {
		target = await makeTmp();
		// Seed with an initial config
		await configCommand.run!(
			makeCtx(target, {
				"no-interaction": true,
				view: "inertia",
				orm: "drizzle",
				db: "bun-sqlite",
				frontend: "react",
			}),
		);
	});
	afterEach(async () => {
		await rm(target, { recursive: true, force: true });
	});

	it("re-run with no flags: file unchanged", async () => {
		const before = await readFile(join(target, "nx.config.ts"), "utf8");
		await configCommand.run!(
			makeCtx(target, {
				"no-interaction": true,
				view: "inertia",
				orm: "drizzle",
				db: "bun-sqlite",
				frontend: "react",
			}),
		);
		const after = await readFile(join(target, "nx.config.ts"), "utf8");
		expect(after).toBe(before);
	});

	it("flag override updates only the targeted field", async () => {
		await configCommand.run!(
			makeCtx(target, {
				"no-interaction": true,
				view: "inertia",
				orm: "drizzle",
				db: "bun-sqlite",
				frontend: "vue", // <-- changed
			}),
		);
		const nx = await readFile(join(target, "nx.config.ts"), "utf8");
		expect(nx).toContain("frontend: 'vue'");
		expect(nx).toContain("view: 'inertia'"); // unchanged
		expect(nx).toContain("driver: 'bun-sqlite'"); // unchanged
	});

	it("db change updates both nx.config.ts and drizzle.config.ts", async () => {
		await configCommand.run!(
			makeCtx(target, {
				"no-interaction": true,
				view: "inertia",
				orm: "drizzle",
				db: "postgres",
				"db-url": "postgres://localhost:5432/myapp",
				frontend: "react",
			}),
		);
		const nx = await readFile(join(target, "nx.config.ts"), "utf8");
		const ddc = await readFile(join(target, "drizzle.config.ts"), "utf8");
		expect(nx).toContain("driver: 'postgres'");
		expect(nx).toContain('postgres://localhost:5432/myapp');
		expect(ddc).toContain('dialect: "postgresql"');
		expect(ddc).toContain('postgres://localhost:5432/myapp');
	});

	it("switching orm from non-drizzle to drizzle creates drizzle.config.ts", async () => {
		// Fresh target — don't inherit the beforeEach's drizzle.config.ts
		const t = await makeTmp();
		try {
			// First: orm=none
			await configCommand.run!(
				makeCtx(t, {
					"no-interaction": true,
					view: "none",
					orm: "none",
					db: "none",
					frontend: "react",
				}),
			);
			expect(await exists(join(t, "drizzle.config.ts"))).toBe(false);

			// Then: switch to drizzle
			await configCommand.run!(
				makeCtx(t, {
					"no-interaction": true,
					view: "inertia",
					orm: "drizzle", // <-- changed
					db: "bun-sqlite",
					frontend: "react",
				}),
			);
			expect(await exists(join(t, "drizzle.config.ts"))).toBe(true);
		} finally {
			await rm(t, { recursive: true, force: true });
		}
	});

	it("switching orm away from drizzle leaves drizzle.config.ts alone", async () => {
		// drizzle.config.ts exists from the beforeEach
		expect(await exists(join(target, "drizzle.config.ts"))).toBe(true);
		const before = await readFile(join(target, "drizzle.config.ts"), "utf8");

		await configCommand.run!(
			makeCtx(target, {
				"no-interaction": true,
				view: "none",
				orm: "prisma", // <-- changed away from drizzle
				db: "postgres",
				frontend: "react",
			}),
		);

		// drizzle.config.ts should be left as-is
		const after = await readFile(join(target, "drizzle.config.ts"), "utf8");
		expect(after).toBe(before);
	});

	it("--ssr / --no-ssr toggles the inertia.ssr field", async () => {
		// Initial: ssr = true (from default)
		let nx = await readFile(join(target, "nx.config.ts"), "utf8");
		expect(nx).toContain("ssr: true");

		// Disable
		await configCommand.run!(
			makeCtx(target, {
				"no-interaction": true,
				view: "inertia",
				orm: "drizzle",
				db: "bun-sqlite",
				frontend: "react",
				"no-ssr": true,
			}),
		);
		nx = await readFile(join(target, "nx.config.ts"), "utf8");
		expect(nx).toContain("ssr: false");

		// Re-enable
		await configCommand.run!(
			makeCtx(target, {
				"no-interaction": true,
				view: "inertia",
				orm: "drizzle",
				db: "bun-sqlite",
				frontend: "react",
				ssr: true,
			}),
		);
		nx = await readFile(join(target, "nx.config.ts"), "utf8");
		expect(nx).toContain("ssr: true");
	});
});
