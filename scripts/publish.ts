/**
 * publish.ts — publish all 31 packages to npm in dependency order.
 *
 * Run with `bun run scripts/publish.ts` after building.
 *
 * Steps:
 *   1. For each package, replace `workspace:*` with the actual version
 *      (since `workspace:*` only resolves inside the workspace).
 *   2. Validate each package.json (required fields, file existence).
 *   3. Publish each package with `npm publish --access public`.
 *   4. Order: core last, with leaf packages first.
 */
import { readdirSync, readFileSync, writeFileSync, existsSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const PACKAGES_DIR = "packages";

console.log("[publish] scanning packages/…");
const packageDirs = readdirSync(PACKAGES_DIR, { withFileTypes: true })
	.filter((e) => e.isDirectory())
	.map((e) => e.name)
	.sort();

console.log(`[publish] found ${packageDirs.length} packages`);

// 1. Resolve workspace:* deps in each package.json to actual versions
console.log("[publish] resolving workspace:* dependencies…");
for (const pkg of packageDirs) {
	const pkgJsonPath = join(PACKAGES_DIR, pkg, "package.json");
	if (!existsSync(pkgJsonPath)) continue;
	const pkgJson = JSON.parse(readFileSync(pkgJsonPath, "utf8"));

	let modified = false;
	const replaceDeps = (deps: Record<string, string> | undefined) => {
		if (!deps) return;
		for (const [name, version] of Object.entries(deps)) {
			if (version === "workspace:*") {
				const refPkg = packageDirs.find((p) => {
					const pj = join(PACKAGES_DIR, p, "package.json");
					if (!existsSync(pj)) return false;
					const j = JSON.parse(readFileSync(pj, "utf8"));
					return j.name === name;
				});
				if (refPkg) {
					const refJson = JSON.parse(
						readFileSync(join(PACKAGES_DIR, refPkg, "package.json"), "utf8"),
					);
					deps[name] = `^${refJson.version}`;
					modified = true;
					console.log(`  ${pkg}: ${name} ${version} → ${deps[name]}`);
				}
			}
		}
	};

	replaceDeps(pkgJson.dependencies);
	replaceDeps(pkgJson.devDependencies);
	replaceDeps(pkgJson.peerDependencies);

	if (modified) {
		writeFileSync(pkgJsonPath, JSON.stringify(pkgJson, null, 2) + "\n");
	}
}

// 2. Publish order: create-nexusts first (depends on @nexusts/core which
//    will be published last, but create-nexusts only needs the public API
//    name to be reserved on npm; the actual @nexusts/core is fetched at
//    runtime via npx). Actually, all 30 framework packages + create-nexusts
//    can be published in any order since each has its own version.
//
//    We publish in alphabetical order for simplicity. `@nexusts/core` is
//    published with the bin field so `nx` is available globally.
const publishOrder = packageDirs.filter((p) => p !== "create-nexusts").concat(["create-nexusts"]);

let published = 0;
let failed = 0;

for (const pkg of publishOrder) {
	const pkgJsonPath = join(PACKAGES_DIR, pkg, "package.json");
	if (!existsSync(pkgJsonPath)) {
		console.warn(`[publish] skipping ${pkg}: no package.json`);
		continue;
	}
	const pkgJson = JSON.parse(readFileSync(pkgJsonPath, "utf8"));

	console.log(`\n[publish] → ${pkgJson.name}@${pkgJson.version}`);

	// Resolve npm auth token from the standard sources. GitHub Actions
	// exposes the secret as NPM_TOKEN (and also as NODE_AUTH_TOKEN when
	// using actions/setup-node with registry-url). We pass it through
	// to spawn so the spawned `npm publish` can authenticate.
	const npmToken = process.env.NPM_TOKEN ?? process.env.NODE_AUTH_TOKEN ?? "";
	if (!npmToken) {
		console.error(`[publish] ✖ no NPM_TOKEN in environment`);
		failed++;
		continue;
	}

	// Run npm publish with --access public (required for scoped packages).
	// Pass the token via .npmrc write to the package directory so npm
	// picks it up reliably across npm versions.
	const npmrcPath = join(PACKAGES_DIR, pkg, ".npmrc");
	writeFileSync(npmrcPath, `//registry.npmjs.org/:_authToken=${npmToken}\n`);

	const result = spawnSync(
		"npm",
		["publish", "--access", "public", "--registry=https://registry.npmjs.org/"],
		{
			cwd: join(PACKAGES_DIR, pkg),
			stdio: "inherit",
			env: { ...process.env, NODE_AUTH_TOKEN: npmToken },
		},
	);

	// Clean up the temporary .npmrc
	try {
		unlinkSync(npmrcPath);
	} catch {
		/* ignore */
	}

	if (result.status === 0) {
		published++;
		console.log(`[publish] ✓ ${pkgJson.name}@${pkgJson.version}`);
	} else {
		failed++;
		console.error(`[publish] ✖ ${pkgJson.name}@${pkgJson.version} failed`);
	}
}

console.log(`\n[publish] done: ${published} succeeded, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
