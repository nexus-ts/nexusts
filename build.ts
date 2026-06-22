/**
 * Build script — bundles the framework into `dist/`.
 *
 * Run with `bun run build`. Three phases:
 * 1. `bun.build()` produces ESM JavaScript (this is what Bun natively
 *    produces and what consumers execute).
 * 2. `tsc --emitDeclarationOnly` produces TypeScript declaration files
 *    so consumers get full type information.
 * 3. Move all files from `dist/src/*` to `dist/*` so the published
 *    layout matches `package.json` exports (which expect
 *    `./cli/index.js`, not `./src/cli/index.js`).
 *
 * We split phases 1 and 2 because Bun's bundler does not currently
 * emit `.d.ts`.
 *
 * NOTE: Only `src/**` is bundled. The example app under `src/app/**`
 * is intentionally excluded — it lives alongside the framework source
 * so users can read it, but it's not part of the published package.
 */
import {
	existsSync,
	mkdirSync,
	readdirSync,
	readFileSync,
	renameSync,
	rmSync,
	statSync,
} from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const DIST = "dist";

console.log("[build] cleaning…");
if (existsSync(DIST)) rmSync(DIST, { recursive: true, force: true });
mkdirSync(DIST, { recursive: true });

// -------------------------------------------------------------------------
// Phase 1: bun.build() — produces runtime artifacts.
//          Each entrypoint is a separate module under `src/<name>/index.ts`.
//          The bundler outputs them as `dist/src/<name>/index.js` (Bun
//          preserves the source path); phase 3 moves them to
//          `dist/<name>/index.js`.
// -------------------------------------------------------------------------
console.log("[build] bundling with bun.build()…");
const result = await Bun.build({
	entrypoints: [
		"./src/index.ts",
		"./src/cli/index.ts",
		"./src/auth/index.ts",
		"./src/queue/index.ts",
		"./src/schedule/index.ts",
		"./src/events/index.ts",
		"./src/session/index.ts",
		"./src/health/index.ts",
		"./src/config/index.ts",
		"./src/logger/index.ts",
		"./src/static/index.ts",
		"./src/limiter/index.ts",
		"./src/shield/index.ts",
		"./src/cache/index.ts",
		"./src/drive/index.ts",
		"./src/mail/index.ts",
		"./src/drizzle/index.ts",
		"./src/openapi/index.ts",
		"./src/upload/index.ts",
		"./src/sse/index.ts",
		"./src/tracing/index.ts",
		"./src/metrics/index.ts",
		"./src/ws/index.ts",
		"./src/crypto/index.ts",
		"./src/i18n/index.ts",
		"./src/redis/index.ts",
		"./src/grpc/index.ts",
		"./src/graphql/index.ts",
		"./src/resilience/index.ts",
		"./src/view/index.ts",
	],
	outdir: "./dist",
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
	console.error("[build] bun.build() failed:");
	for (const log of result.logs) console.error(log);
	process.exit(1);
}

console.log(`[build] wrote ${result.outputs.length} runtime files`);

// -------------------------------------------------------------------------
// Phase 2: tsc --emitDeclarationOnly — produces .d.ts files for consumers.
//          Outputs to `dist/src/*` (tsc preserves the rootDir structure);
//          phase 3 moves them to `dist/*`.
// -------------------------------------------------------------------------
console.log("[build] generating type declarations via tsc…");
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
		"--emitDecoratorMetadata",
		"--useDefineForClassFields",
		"false",
		"--skipLibCheck",
		"--project",
		"tsconfig.build.json",
		"--rootDir",
		"./src",
		"--outDir",
		`${DIST}`,
	],
	{ stdio: "inherit" },
);
if (tsc.status !== 0) {
	console.error("[build] tsc declaration emit failed");
	process.exit(tsc.status ?? 1);
}

// -------------------------------------------------------------------------
// Phase 3: flatten `dist/src/*` to `dist/*`.
//          Bun and tsc both emit `dist/src/<name>/...` because they
//          preserve the source path relative to the project root.
//          `package.json` `exports` points to `./<name>/index.js`,
//          so we move everything up one level.
// -------------------------------------------------------------------------
console.log("[build] flattening dist/src/* → dist/*…");
const SRC_DIST = join(DIST, "src");
if (existsSync(SRC_DIST)) {
	moveRecursive(SRC_DIST, DIST);
	rmSync(SRC_DIST, { recursive: true, force: true });
}

// Emit the top-level entry declarations.
await Bun.write(
	`${DIST}/index.d.ts`,
	`export * from './core/index.js';\nexport { default } from './core/application.js';\n`,
);
await Bun.write(
	`${DIST}/cli/index.d.ts`,
	`export * from '../core/cli/index.js';\n`,
);

// -------------------------------------------------------------------------
// Phase 4: emit a consumer-facing package.json.
// -------------------------------------------------------------------------
const rootPkg = JSON.parse(readFileSync("package.json", "utf8"));
const consumerPkg = {
	name: rootPkg.name,
	version: rootPkg.version,
	description: rootPkg.description,
	type: "module",
	main: "./index.js",
	module: "./index.js",
	types: "./index.d.ts",
	sideEffects: false,
	exports: {
		".": {
			types: "./index.d.ts",
			import: "./index.js",
		},
		"./*": {
			types: "./*/index.d.ts",
			import: "./*/index.js",
		},
	},
	// Expose the `nx` CLI as a binary so `bunx nx ...` and
	// `npx nx ...` work in apps that install the package.
	bin: {
		nx: "./cli/index.js",
	},
	keywords: rootPkg.keywords,
	license: rootPkg.license,
	engines: rootPkg.engines,
	dependencies: {
		hono: rootPkg.dependencies?.hono ?? "^4.6.0",
		"reflect-metadata": rootPkg.dependencies?.["reflect-metadata"] ?? "^0.2.2",
		zod: rootPkg.dependencies?.zod ?? "^3.23.8",
		rendu: rootPkg.dependencies?.rendu ?? "^0.1.0",
	},
	peerDependencies: rootPkg.peerDependencies,
};
await Bun.write(`${DIST}/package.json`, JSON.stringify(consumerPkg, null, 2));
console.log("[build] wrote dist/package.json");

console.log("[build] done.");

// -------------------------------------------------------------------------
// Helpers
// -------------------------------------------------------------------------

/**
 * Recursively move every file/dir from `srcDir` into `destDir`. If
 * a file already exists at the destination, it's overwritten.
 */
function moveRecursive(srcDir: string, destDir: string): void {
	for (const entry of readdirSync(srcDir)) {
		const srcPath = join(srcDir, entry);
		const destPath = join(destDir, entry);
		if (statSync(srcPath).isDirectory()) {
			mkdirSync(destPath, { recursive: true });
			moveRecursive(srcPath, destPath);
			rmSync(srcPath, { recursive: true, force: true });
		} else {
			renameSync(srcPath, destPath);
		}
	}
}
