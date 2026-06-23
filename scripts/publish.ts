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

	// Skip if this exact version is already published on the registry.
	// This makes the script idempotent — re-running a workflow after a
	// partial publish only retries the missing packages.
	const check = spawnSync(
		"npm",
		["view", `${pkgJson.name}@${pkgJson.version}`, "version"],
		{ stdio: "pipe" },
	);
	if (check.status === 0) {
		console.log(
			`[publish] ↷ ${pkgJson.name}@${pkgJson.version} already published; skipping`,
		);
		continue;
	}

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

	// npm 11+ uses device authorization flow for 2FA. When npm publish
	// returns EOTP, it prints a URL like
	//   https://www.npmjs.com/auth/cli/<id>
	// The user must open that URL in a browser, complete 2FA + WebAuthn,
	// and the CLI will then continue automatically. We detect this and
	// pass through stdin/stdout/stderr to the user so they can complete
	// the flow interactively.

	// Retry on 429 (Too Many Requests) with longer backoff. The npm
	// public registry rate-limits burst publishes — once you hit 429,
	// you need to wait 1-2 minutes before the next attempt has any
	// chance of succeeding. We use a 3-attempt strategy with 60s/120s
	// waits to stay under the workflow's 60-minute timeout.
	const maxAttempts = 3;
	let attempt = 0;
	let result: ReturnType<typeof spawnSync> | null = null;
	while (attempt < maxAttempts) {
		attempt++;
		result = spawnSync(
			"npm",
			["publish", "--access", "public", "--registry=https://registry.npmjs.org/"],
			{
				cwd: join(PACKAGES_DIR, pkg),
				// For local runs: inherit stdio so the user sees the
				// device-flow URL from npm 11+ 2FA.
				// For CI runs: pipe so we can detect 429 retry.
				stdio:
					process.env.CI === "true" || process.env.GITHUB_ACTIONS
						? ["ignore", "pipe", "pipe"]
						: "inherit",
				env: { ...process.env, NODE_AUTH_TOKEN: npmToken },
			},
		);
		// Echo the subprocess output so the user still sees it.
		const stdout = (result.stdout ?? Buffer.from("")).toString();
		const stderr = (result.stderr ?? Buffer.from("")).toString();
		if (stdout) process.stdout.write(stdout);
		if (stderr) process.stderr.write(stderr);
		if (result.status === 0) break;
		const combined = stdout + "\n" + stderr;
		const isRateLimit =
			/429|Too Many Requests|rate limit/i.test(combined);
		if (!isRateLimit) {
			// Non-rate-limit error: bail out, no point retrying.
			break;
		}
		// Long backoff: 60s, 120s — npm rate limits are sticky and need
		// a real wait before they reset. Going any shorter just wastes
		// attempts.
		const sleepSec = attempt === 1 ? 60 : 120;
		console.warn(
			`[publish] ⚠ rate-limited (attempt ${attempt}/${maxAttempts}); sleeping ${sleepSec}s before retry…`,
		);
		await new Promise((r) => setTimeout(r, sleepSec * 1000));
	}

	// Clean up the temporary .npmrc
	try {
		unlinkSync(npmrcPath);
	} catch {
		/* ignore */
	}

	if (result && result.status === 0) {
		published++;
		console.log(`[publish] ✓ ${pkgJson.name}@${pkgJson.version}`);
	} else {
		failed++;
		console.error(`[publish] ✖ ${pkgJson.name}@${pkgJson.version} failed`);
	}

	// Always wait between publishes to be a good citizen of the npm
	// registry and avoid 429s on subsequent packages.
	if (pkg !== publishOrder[publishOrder.length - 1]) {
		const between = 3_000;
		console.log(`[publish] waiting ${between / 1000}s before next package…`);
		await new Promise((r) => setTimeout(r, between));
	}
}

console.log(`\n[publish] done: ${published} succeeded, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
