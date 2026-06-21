/**
 * Build script — bundles the framework into `dist/`.
 *
 * Run with `bun run build`. Two phases:
 * 1. `bun.build()` produces ESM JavaScript (this is what Bun natively
 *    produces and what consumers execute).
 * 2. `tsc --emitDeclarationOnly` produces TypeScript declaration files
 *    so consumers get full type information.
 *
 * We split the two because Bun's bundler does not currently emit `.d.ts`.
 *
 * NOTE: Only `src/core/**` and `src/index.ts` are bundled. The example
 * app under `src/app/**` is intentionally excluded — it lives alongside
 * the framework source so users can read it, but it's not part of the
 * published package.
 */
import { rmSync, mkdirSync, existsSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const DIST = "dist";

console.log("[build] cleaning…");
if (existsSync(DIST)) rmSync(DIST, { recursive: true, force: true });
mkdirSync(DIST, { recursive: true });

// -------------------------------------------------------------------------
// Phase 1: bun.build() — produces runtime artifacts.
//          We bundle three entry points: the public `nexus` package
//          (`src/index.ts`), the `nx` CLI (`src/cli/index.ts`), and
//          the optional `nexus/auth` module (`src/auth/index.ts`).
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
//          We use tsconfig.build.json which sets `--include` for the SSR
//          ambient module declarations, so the optional peer deps
//          (react, vue, svelte, solid) type-check correctly.
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

// Emit the top-level declarations too.
await Bun.write(
	`${DIST}/index.d.ts`,
	`export * from './core/index.js';\nexport { default } from './core/application.js';\n`,
);
await Bun.write(
	`${DIST}/cli/index.d.ts`,
	`export {} from '../core/cli/index.js';\n`,
);

// -------------------------------------------------------------------------
// Phase 3: emit a consumer-facing package.json.
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
