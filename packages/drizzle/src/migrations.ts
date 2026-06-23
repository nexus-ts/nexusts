/**
 * Migration utilities for Drizzle ORM.
 *
 * Programmatic wrappers around `drizzle-kit` for generating migrations
 * and pushing schema changes directly to the database — no CLI needed.
 *
 * @example
 * ```ts
 * import { generateMigrations } from "nexusjs/drizzle";
 *
 * await generateMigrations({
 *   schema: ["./src/schema/users.ts", "./src/schema/posts.ts"],
 *   out: "./drizzle",
 *   dialect: "postgresql",
 * });
 * ```
 */
import fs from "node:fs";
import path from "node:path";

/**
 * Generate migration files using drizzle-kit.
 *
 * @param options - Migration generation options
 *
 * @example
 * ```ts
 * await generateMigrations({
 *   schema: "./src/schema",
 *   out: "./drizzle",
 *   dialect: "sqlite",
 * });
 * ```
 */
export async function generateMigrations(options?: {
	schema?: string | string[];
	out?: string;
	dialect?: "sqlite" | "postgresql" | "mysql";
}): Promise<void> {
	const schema = options?.schema ?? "./src/schema";
	const out = options?.out ?? "./drizzle";
	const dialect = options?.dialect ?? "sqlite";

	const schemaPaths = Array.isArray(schema) ? schema : [schema];
	const configContent = `import { defineConfig } from "drizzle-kit";
export default defineConfig({
  schema: ${JSON.stringify(schemaPaths)},
  out: ${JSON.stringify(out)},
  dialect: ${JSON.stringify(dialect)},
});
`;

	const configFile = "./drizzle.config.generated.ts";
	try {
		fs.writeFileSync(configFile, configContent, "utf-8");

		const { spawnSync } = await import("bun");
		const result = spawnSync(["bunx", "drizzle-kit", "generate", `--config=${configFile}`], {
			stdio: ["inherit", "inherit", "inherit"],
		});

		if (result.exitCode !== 0) {
			throw new Error(`drizzle-kit generate failed (exit ${result.exitCode})`);
		}

		console.log(`[nexus] Migrations generated in ${out}`);
	} catch (error) {
		throw new Error(
			`Failed to generate migrations: ${error instanceof Error ? error.message : error}`,
		);
	} finally {
		try {
			fs.unlinkSync(configFile);
		} catch {
			// Temp file cleanup is best-effort.
		}
	}
}

/**
 * Push schema changes directly to the database (without migrations).
 * Useful for rapid development / prototyping. Not recommended for production.
 *
 * @param options - Schema push options
 *
 * @example
 * ```ts
 * await pushSchema({
 *   schema: "./src/schema",
 *   dialect: "postgresql",
 *   url: process.env.DATABASE_URL!,
 * });
 * ```
 */
export async function pushSchema(options?: {
	schema?: string | string[];
	dialect?: "sqlite" | "postgresql" | "mysql";
	url?: string;
}): Promise<void> {
	const schema = options?.schema ?? "./src/schema";
	const dialect = options?.dialect ?? "sqlite";
	const url = options?.url ?? process.env["DATABASE_URL"] ?? ":memory:";

	const schemaPaths = Array.isArray(schema) ? schema : [schema];
	const configContent = `import { defineConfig } from "drizzle-kit";
export default defineConfig({
  schema: ${JSON.stringify(schemaPaths)},
  dialect: ${JSON.stringify(dialect)},
  dbCredentials: { url: ${JSON.stringify(url)} },
});
`;

	const configFile = "./drizzle.config.generated.ts";
	try {
		fs.writeFileSync(configFile, configContent, "utf-8");

		const { spawnSync } = await import("bun");
		const pushCmd =
			dialect === "sqlite" ? "push:sqlite" : dialect === "mysql" ? "push:mysql" : "push:pg";
		const result = spawnSync(["bunx", "drizzle-kit", pushCmd, `--config=${configFile}`], {
			stdio: ["inherit", "inherit", "inherit"],
		});

		if (result.exitCode !== 0) {
			throw new Error(`drizzle-kit ${pushCmd} failed (exit ${result.exitCode})`);
		}

		console.log(`[nexus] Schema pushed (${dialect})`);
	} catch (error) {
		throw new Error(
			`Failed to push schema: ${error instanceof Error ? error.message : error}`,
		);
	} finally {
		try {
			fs.unlinkSync(configFile);
		} catch {
			// Temp file cleanup is best-effort.
		}
	}
}
