#!/usr/bin/env bun
/**
 * DEPRECATED — Use the `nx` CLI instead.
 *
 *   bunx nx make:module <Name>
 *
 * The new CLI supports optional controllers/services/repositories
 * (use --no-controller, --no-service, --no-repo) and reads
 * `nx.config.ts` to determine paths.
 *
 * See: docs/user-guide/cli.md
 *
 * This file is kept only so older workflows don't break. It will be
 * removed in v0.3.
 */
import { writeFileSync, mkdirSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";

console.warn(
	"\n⚠  scripts/make-module.ts is deprecated. Use `bunx nx make:module <Name>` instead.\n",
);

const name = process.argv[2];
if (!name) {
	console.error("Usage: bun make:module <Name>");
	process.exit(1);
}

const out = resolve(`src/app/modules/${name.toLowerCase()}.module.ts`);
if (existsSync(out)) {
	console.error(`Refusing to overwrite ${out}.`);
	process.exit(1);
}

mkdirSync(dirname(out), { recursive: true });

const template = `import { Module } from '../../core/decorators/module.js';
import { ${name}Controller } from '../controllers/${name.toLowerCase()}.controller.js';
import { ${name}Service } from '../services/${name.toLowerCase()}.service.js';

@Module({
  controllers: [${name}Controller],
  providers: [${name}Service],
  exports: [${name}Service],
})
export class ${name}Module {}
`;

writeFileSync(out, template);
console.log(`[make:module] wrote ${out}`);

// Best-effort: add the import + module to AppModule if it exists.
const appModule = resolve("src/app/app.module.ts");
if (existsSync(appModule)) {
	const { readFileSync } = require("node:fs") as typeof import("node:fs");
	const content = readFileSync(appModule, "utf8");
	if (!content.includes(`${name}Module`)) {
		const updated = content
			.replace(/(@Module\(\{[\s\S]*?imports:\s*\[)/, `$1${name}Module, `)
			.replace(
				/(import\s+\{\s*Module\s*\}\s+from\s+['"][^'"]+['"];?)/,
				`$1\nimport { ${name}Module } from './modules/${name.toLowerCase()}.module.js';`,
			);
		writeFileSync(appModule, updated);
		console.log(`[make:module] wired ${name}Module into AppModule`);
	}
}