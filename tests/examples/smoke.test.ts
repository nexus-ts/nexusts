/**
 * Smoke-test runner for every example under `examples/`.
 *
 * For each numbered example we:
 *   1. Read the source (`main.ts`) and `README.md` to confirm they exist
 *      and the README has reasonable content.
 *   2. Spawn the example as a Bun subprocess, watch for either:
 *        a) a "listening" / "started" marker (we kill the process); or
 *        b) a crash within the boot window.
 *      Sequential port assignment + per-process env injection keeps
 *      27 examples from fighting over the same port.
 *
 * The test is intentionally generous — it does NOT make HTTP calls
 * because the examples expose wildly different surfaces (gRPC, SSE,
 * WebSocket, raw HTTP, etc.). A clean boot is the contract.
 *
 * Note: examples use a local tsconfig.json in this folder to map
 * `@nexusts/core` to the framework's `src/` so the build doesn't
 * need a published package. This lets us test against the in-tree
 * code we're about to release.
 */

import { type ChildProcess, spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readdir, readFile, rm, stat, symlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const EXAMPLES_DIR = path.resolve(__dirname, "../../examples");
const START_PORT = 14_000;   // keep clear of the 3xxx block used by manual testing
const BOOT_TIMEOUT_MS = 8_000;
const SHUTDOWN_GRACE_MS = 1_500;

interface ExampleSpec {
	name: string;
	mainTs: string;
	readme: string;
}

async function listExamples(): Promise<ExampleSpec[]> {
	const entries = await readdir(EXAMPLES_DIR, { withFileTypes: true });
	const out: ExampleSpec[] = [];
	for (const entry of entries) {
		if (!entry.isDirectory()) continue;
		if (!/^\d{2}-/.test(entry.name)) continue;
		const mainTs = path.join(EXAMPLES_DIR, entry.name, "main.ts");
		const readme = path.join(EXAMPLES_DIR, entry.name, "README.md");
		if (!existsSync(mainTs)) continue;
		out.push({ name: entry.name, mainTs, readme });
	}
	out.sort((a, b) => a.name.localeCompare(b.name));
	return out;
}

/** Per-example tsconfig. Without one, Bun defaults to the new
 *  (stage-3) decorator semantics, which break our legacy
 *  `MethodDecorator` callsites (descriptor comes in as `undefined`).
 *  We drop a stub into each example folder in `beforeAll` and clean
 *  them up in `afterAll` so the source tree stays clean. */
const createdConfigs: string[] = [];
const EXAMPLE_TSCONFIG = {
	// Extend the root tsconfig so Bun picks up experimentalDecorators
	// via the extends chain. Without this, Bun 1.3.10+ emits stage-3
	// decorators (PR oven-sh/bun#30478's fix only kicks in when the
	// tsconfig is part of an extends chain).
	extends: "../../tsconfig.json",
	compilerOptions: {
		target: "ES2022",
		module: "ESNext",
		moduleResolution: "Bundler",
		lib: ["ES2022", "DOM"],
		experimentalDecorators: true,
		emitDecoratorMetadata: true,
		useDefineForClassFields: false,
		esModuleInterop: true,
		skipLibCheck: true,
		noEmit: true,
		// Some examples (28–31) import .tsx components from the
		// server. `react-jsx` avoids the "React is not defined"
		// runtime error from the classic JSX transform.
		jsx: "react-jsx",
		types: ["bun-types"],
		baseUrl: ".",
		paths: {
			"@nexusts/*": ["../../packages/*/src/index.ts"],
			"@nexusts/core": ["../../packages/core/src/index.ts"],
		},
	},
	include: ["./**/*.ts", "./*.tsx", "./**/*.tsx", "../../packages/*/src/**/*.ts"],
};
/** Drop a tsconfig.json AND a node_modules/ shim into each example
 *  so bun can resolve both `@nexusts/*` (via tsconfig paths) and
 *  npm packages like `reflect-metadata` (via a small symlink tree
 *  pointing at the root node_modules). */
const createdSymlinks: string[] = [];
async function ensureExampleNodeModules(exampleDir: string): Promise<void> {
	const nmDir = path.join(exampleDir, "node_modules");
	if (!existsSync(nmDir)) {
		await mkdir(nmDir, { recursive: true });
		createdSymlinks.push(nmDir);
	}
	// Symlink every package in the root's node_modules/.bun/ into the
	// example's node_modules. The .bun/ layout stores packages under
	// `node_modules/.bun/<name>@<version>/node_modules/<name>` so we
	// walk one level and link the inner name to the example's nm.
	const bunDir = path.resolve(__dirname, "../../node_modules/.bun");
	try {
		const entries = await readdir(bunDir, { withFileTypes: true });
		for (const entry of entries) {
			if (!entry.isDirectory() || !entry.name.startsWith(".")) continue;
			const innerNm = path.join(bunDir, entry.name, "node_modules");
			try {
				const innerEntries = await readdir(innerNm, { withFileTypes: true });
				for (const inner of innerEntries) {
					if (!inner.isDirectory() && !inner.isSymbolicLink()) continue;
					if (inner.name.startsWith(".")) continue;
					const target = path.join(innerNm, inner.name);
					const link = path.join(nmDir, inner.name);
					if (existsSync(link)) continue;
					await symlink(target, link);
					createdSymlinks.push(link);
				}
			} catch {
				/* skip entries without inner node_modules */
			}
		}
	} catch {
		/* root .bun/ might not exist; nothing to symlink */
	}
}
async function ensureExampleTsconfig(exampleDir: string): Promise<void> {
	const target = path.join(exampleDir, "tsconfig.json");
	if (!existsSync(target)) {
		await writeFile(target, JSON.stringify(EXAMPLE_TSCONFIG, null, 2));
		createdConfigs.push(target);
	}
}

interface BootResult {
	ok: boolean;
	stdout: string;
	stderr: string;
	reason: "ready" | "crash" | "timeout";
}

/** Spawn the example and wait for it to either boot or crash. */
async function bootExample(spec: ExampleSpec, port: number): Promise<BootResult> {
	return await new Promise((resolve) => {
		const proc: ChildProcess = spawn("bun", ["run", spec.mainTs], {
			cwd: path.dirname(spec.mainTs),
			env: {
				...process.env,
				NODE_ENV: "test",
				PORT: String(port),
				APP_KEY: "0123456789abcdef0123456789abcdef",
				// Some modules print ANSI color codes; force plain output.
				NO_COLOR: "1",
				// Disable the OTEL SDK auto-init; we don't want tracing
				// or metrics examples to try to reach a collector.
				OTEL_SDK_DISABLED: "true",
				OTEL_EXPORTER_OTLP_ENDPOINT: "",
			},
			stdio: ["ignore", "pipe", "pipe"],
		});

		let stdout = "";
		let stderr = "";
		let settled = false;
		let bootTimer: NodeJS.Timeout | undefined;

		const finish = (result: BootResult) => {
			if (settled) return;
			settled = true;
			if (bootTimer) clearTimeout(bootTimer);
			if (!proc.killed) {
				proc.kill("SIGTERM");
				setTimeout(() => {
					if (!proc.killed) proc.kill("SIGKILL");
				}, SHUTDOWN_GRACE_MS);
			}
			resolve(result);
		};

		proc.stdout?.on("data", (chunk) => {
			stdout += chunk.toString();
			// Common success markers the examples print. We accept
			// any of them as proof that the app booted.
			if (/(?:listening|server|started|ready|on port|\bon http)/i.test(stdout)) {
				finish({ ok: true, stdout, stderr, reason: "ready" });
			}
		});

		proc.stderr?.on("data", (chunk) => {
			stderr += chunk.toString();
		});

		proc.on("exit", (_code, signal) => {
			if (settled) return;
			// If we get killed by SIGTERM / SIGKILL we initiated, treat
			// as success. Otherwise it crashed during boot.
			if (signal === "SIGTERM" || signal === "SIGKILL") {
				finish({ ok: true, stdout, stderr, reason: "ready" });
				return;
			}
			finish({ ok: false, stdout, stderr, reason: "crash" });
		});

		proc.on("error", () => {
			finish({ ok: false, stdout, stderr, reason: "crash" });
		});

		bootTimer = setTimeout(() => {
			finish({ ok: false, stdout, stderr, reason: "timeout" });
		}, BOOT_TIMEOUT_MS);
	});
}

const allExamples = await listExamples();

describe("examples/ — smoke tests", () => {
	beforeAll(async () => {
		// Sanity: the directory must be readable and populated.
		const stats = await stat(EXAMPLES_DIR);
		expect(stats.isDirectory()).toBe(true);
		// Drop a tsconfig.json into every example so bun can resolve
		// `@nexusts/core` to the in-tree source.
		for (const spec of allExamples) {
			await ensureExampleTsconfig(path.dirname(spec.mainTs));
			await ensureExampleNodeModules(path.dirname(spec.mainTs));
		}
	});

	afterAll(async () => {
		// Remove the per-example tsconfigs and symlinks we wrote.
		await Promise.all(
			createdConfigs.map((file) => rm(file, { force: true })),
		);
		for (const sym of createdSymlinks) {
			await rm(sym, { recursive: true, force: true });
		}
	});

	it("discovers at least 10 numbered examples", () => {
		expect(allExamples.length).toBeGreaterThanOrEqual(10);
	});

	describe("structure", () => {
		for (const spec of allExamples) {
			it(`${spec.name} has README.md`, async () => {
				const content = await readFile(spec.readme, "utf8").catch(() => "");
				expect(content.length).toBeGreaterThan(200);
				// Every README should have a "How to run" section.
				expect(content).toMatch(/how to run|run:|```bash/i);
			});
		}
	});

	describe("boots a process", () => {
		// Boot one example at a time. Each gets a unique port so 27
		// subprocesses don't all try to bind 3000.
		for (let i = 0; i < allExamples.length; i++) {
			const spec = allExamples[i];
			const port = START_PORT + i;
			it(`${spec.name} starts and listens`, async () => {
				const result = await bootExample(spec, port);
				if (!result.ok) {
					const tail = (result.stderr || result.stdout).split("\n").slice(-30).join("\n");
					throw new Error(
						`${spec.name} did not boot (${result.reason}):\n${tail}`,
					);
				}
			}, BOOT_TIMEOUT_MS + 5_000);
		}
	});
});
