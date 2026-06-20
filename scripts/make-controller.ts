#!/usr/bin/env bun
/**
 * DEPRECATED — Use the `nx` CLI instead.
 *
 *   bunx nx make:controller <Name>
 *
 * The new CLI supports routing-style selection (nest/adonis/functional),
 * reads the project config from `nx.config.ts`, and offers a much richer
 * set of generators (`make:crud`, `make:model`, `make:migration`, …).
 *
 * See: docs/user-guide/cli.md
 *
 * This file is kept only so older workflows don't break. It will be
 * removed in v0.3.
 */
import { writeFileSync, mkdirSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";

console.warn(
	"\n⚠  scripts/make-controller.ts is deprecated. Use `bunx nx make:controller <Name>` instead.\n",
);

const name = process.argv[2];
if (!name) {
	console.error("Usage: bun make:controller <Name>");
	process.exit(1);
}

const out = resolve(`src/app/controllers/${name.toLowerCase()}.controller.ts`);
if (existsSync(out)) {
	console.error(
		`Refusing to overwrite ${out}. Delete it first if you want to regenerate.`,
	);
	process.exit(1);
}

mkdirSync(dirname(out), { recursive: true });

const template = `import { Body, Controller, Delete, Get, Inject, Param, Post, Put, Query, Validate } from '../../core/decorators/index.js';

@Controller('/${name.toLowerCase()}s')
export class ${name}Controller {
  @Get('/')
  async index() {
    return [];
  }

  @Get('/:id')
  async show(@Param('id') id: string) {
    return { id };
  }

  @Post('/')
  @Validate({ body: undefined })
  async create(@Body() body: any) {
    return { created: body };
  }

  @Put('/:id')
  async update(@Param('id') id: string, @Body() body: any) {
    return { id, body };
  }

  @Delete('/:id')
  async destroy(@Param('id') id: string) {
    return { removed: id };
  }
}
`;

writeFileSync(out, template);
console.log(`[make:controller] wrote ${out}`);
