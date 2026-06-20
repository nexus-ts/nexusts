#!/usr/bin/env bun
/**
 * DEPRECATED — Use the `nx` CLI instead.
 *
 *   bunx nx make:service <Name>
 *
 * The new CLI reads `nx.config.ts` and can inject a matching repository
 * automatically when an ORM is configured.
 *
 * See: docs/user-guide/cli.md
 *
 * This file is kept only so older workflows don't break. It will be
 * removed in v0.3.
 */
import { writeFileSync, mkdirSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";

console.warn(
	"\n⚠  scripts/make-service.ts is deprecated. Use `bunx nx make:service <Name>` instead.\n",
);

const name = process.argv[2];
if (!name) {
	console.error("Usage: bun make:service <Name>");
	process.exit(1);
}

const out = resolve(`src/app/services/${name.toLowerCase()}.service.ts`);
if (existsSync(out)) {
	console.error(
		`Refusing to overwrite ${out}. Delete it first if you want to regenerate.`,
	);
	process.exit(1);
}

mkdirSync(dirname(out), { recursive: true });

const template = `import { Injectable } from '../../core/decorators/injectable.js';

@Injectable()
export class ${name}Service {
  // TODO: implement your service methods.
}
`;

writeFileSync(out, template);
console.log(`[make:service] wrote ${out}`);
