/**
 * Build script — bundles all 30 framework packages + create-nexusts
 * using Bun.build (which handles TypeScript natively).
 *
 * Run with `bun run build` from the monorepo root.
 *
 * We skip the tsc --emitDeclarationOnly phase for now because of
 * workspace + cross-package type-resolution issues. Bun.build produces
 * plain JavaScript; type definitions can be added later via a per-
 * package build step or skipped entirely (consumers import the
 * @nexusts/* packages and get types from the published .d.ts files
 * once they exist).
 */
import { existsSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const PACKAGES_DIR = "packages";
const ENTRY = "src/index.ts";

// Special entries that don't follow the standard src/index.ts pattern.
const SPECIAL_ENTRIES: Record<string, Array<{ entry: string; outDir: string }>> = {
	// The core package exposes the `nx` CLI binary at dist/cli/index.js.
	// The CLI source lives in packages/cli/src/index.ts.
	core: [
		{ entry: "packages/cli/src/index.ts", outDir: "packages/core/dist/cli" },
	],
};

console.log("[build] scanning packages/…");
const packageDirs = readdirSync(PACKAGES_DIR, { withFileTypes: true })
	.filter((e) => e.isDirectory())
	.map((e) => e.name)
	.sort();

console.log(`[build] found ${packageDirs.length} packages`);

let totalOutputs = 0;
const failed: string[] = [];

for (const pkg of packageDirs) {
	const srcDir = join(PACKAGES_DIR, pkg, "src");
	const entry = join(srcDir, "index.ts");
	if (!existsSync(entry)) {
		console.warn(`[build] skipping ${pkg}: no ${ENTRY}`);
		continue;
	}

	// Build the main entry (src/index.ts → dist/index.js)
	const outDir = join(PACKAGES_DIR, pkg, "dist");
	console.log(`[build] building @nexusts/${pkg}…`);
	if (existsSync(outDir)) rmSync(outDir, { recursive: true, force: true });
	mkdirSync(outDir, { recursive: true });

	// Phase 1: bun.build() — produces runtime artifacts.
	//   Each package's entry becomes ./dist/index.js.
	const result = await Bun.build({
		entrypoints: [entry],
		outdir: outDir,
		target: "bun",
		format: "esm",
		splitting: false,
		minify: false,
		sourcemap: "linked",
		naming: "[dir]/[name].[ext]",
		loader: { ".ts": "ts" },
		packages: "external",
	});

	if (!result.success) {
		console.error(`[build] ${pkg}: bun.build() failed:`);
		for (const log of result.logs) console.error(log);
		failed.push(pkg);
		continue;
	}

	totalOutputs += result.outputs.length;
	console.log(`[build] ✓ @nexusts/${pkg} (${result.outputs.length} files)`);

	// Build any special entries (e.g., CLI binary for core package)
	const specials = SPECIAL_ENTRIES[pkg];
	if (specials) {
		for (const sp of specials) {
			const spResult = await Bun.build({
				entrypoints: [sp.entry],
				outdir: sp.outDir,
				target: "bun",
				format: "esm",
				splitting: false,
				minify: false,
				sourcemap: "linked",
				naming: "[dir]/[name].[ext]",
				loader: { ".ts": "ts" },
				packages: "external",
			});
			if (spResult.success) {
				totalOutputs += spResult.outputs.length;
				console.log(`[build] ✓ @nexusts/${pkg} (special: ${sp.entry})`);
			} else {
				console.error(`[build] ${pkg}: special build failed:`);
				for (const log of spResult.logs) console.error(log);
			}
		}
	}
}

console.log(`\n[build] done: ${totalOutputs} runtime files written`);

// Phase 2: Generate .d.ts files for consumers.
//
// `Bun.build` does not emit TypeScript declaration files, so we
// invoke `tsc --emitDeclarationOnly` for each package. This is a
// best-effort step: if a package's types do not resolve cleanly
// across the workspace (a known issue with the monorepo layout),
// we log a warning and keep the runtime .js — the build is still
// usable from a JavaScript consumer or via `// @ts-expect-error`.
console.log("[build] generating type declarations via tsc…");
for (const pkg of packageDirs) {
	const srcDir = join(PACKAGES_DIR, pkg, "src");
	const outDir = join(PACKAGES_DIR, pkg, "dist");
	const entry = join(srcDir, "index.ts");
	if (!existsSync(entry)) continue;

	const tsc = spawnSync(
		"bun",
		[
			"x",
			"tsc",
			"--emitDeclarationOnly",
			"--declaration",
			"--target",
			"ES2022",
			"--module",
			"ESNext",
			"--moduleResolution",
			"Bundler",
			"--experimentalDecorators",
			"--useDefineForClassFields",
			"false",
			"--skipLibCheck",
			"--noEmit",
			"false",
			"--rootDir",
			srcDir,
			"--outDir",
			outDir,
			entry,
		],
		{ stdio: "pipe" },
	);
	if (tsc.status === 0) {
		console.log(`[build] ✓ @nexusts/${pkg} (.d.ts)`);
	} else {
		const stderr = (tsc.stderr ?? Buffer.from("")).toString();
		// Only log first 3 lines of error to avoid spam
		const firstLines = stderr.split("\n").slice(0, 3).join("\n");
		console.warn(`[build] ⚠ @nexusts/${pkg} .d.ts failed: ${firstLines}`);
	}
}

if (failed.length > 0) {
	console.error(`[build] FAILED for ${failed.length} packages: ${failed.join(", ")}`);
	process.exit(1);
}
