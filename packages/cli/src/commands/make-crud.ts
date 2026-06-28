/**
 * `nx make:crud <Name>` — generate a full CRUD scaffold for a resource.
 *
 * Mirrors Ruby on Rails' `rails generate scaffold`:
 *
 *   nx make:crud Post
 *
 * Produces (under app/):
 *
 *   controllers/post.controller.ts   — RESTful routes (Nest/Adonis/Functional)
 *   services/post.service.ts        — business logic
 *   repositories/post.repository.ts — DB access (only if orm !== 'none')
 *   models/post.model.ts            — table schema (only if orm !== 'none')
 *   dto/post.dto.ts                 — Zod validation schemas
 *   modules/post.module.ts          — @Module({...}) wiring
 *   tests/post.test.ts              — Vitest integration test
 *
 * The output adapts to `nx.config.ts`:
 *   - routing → controller template
 *   - view    → emits Inertia render() when 'inertia', otherwise plain JSON
 *   - orm     → Drizzle/Kysely template selection
 *
 * Use `--no-views` to skip view-aware parts even when `view === 'inertia'`.
 */

import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import type { Command, CommandContext } from "../core/index.js";
import {
	flagBool,
	logger,
	nameVariants,
	render,
	writeFile,
} from "../core/index.js";
import { templates } from "../templates/index.js";
import {
	mapDrizzleType,
	renderDrizzleDialect,
} from "../templates/model/drizzle-dialect.js";

export const makeCrudCommand: Command = {
	name: "make:crud",
	aliases: ["crud", "make-crud", "scaffold"],
	summary: "Generate a full CRUD scaffold for a resource",
	description:
		"Generates controller + service + repository + model + dto + module + test for a single resource, adapted to the project's nx.config.ts.",
	examples: [
		"nx make:crud Post",
		"nx make:crud User --no-views",
		"nx make:crud Comment --no-repo --no-test",
	],
	flags: [
		{ name: "no-views", description: "Skip Inertia view rendering" },
		{ name: "no-repo", description: "Skip the repository / model" },
		{ name: "no-test", description: "Skip generating the test file" },
		{ name: "style", description: "Override routing style" },
		{ name: "orm", description: "Override ORM driver" },
		{
			name: "dialect",
			description:
				"Drizzle dialect (postgres|mysql|sqlite|d1). Default: sqlite",
		},
	],
	async run(ctx: CommandContext): Promise<number> {
		const name = ctx.positional[0];
		if (!name) {
			logger.error("Usage: nx make:crud <Name>");
			return 1;
		}

		const variants = nameVariants(name);
		const style =
			(ctx.flags.style as string | undefined) ?? ctx.config.routing;
		const orm = (ctx.flags.orm as string | undefined) ?? ctx.config.orm;
		const dialect =
			(ctx.flags.dialect as string | undefined) ??
			ctx.config.dialect ??
			"sqlite";
		const noRepo = flagBool(ctx.flags, "no-repo", false) || orm === "none";
		const noTest = flagBool(ctx.flags, "no-test", false);
		const hasInertia =
			ctx.config.view === "inertia" && !flagBool(ctx.flags, "no-views", false);

		// Service/repo/controller names.
		const controller = `${variants.pascal}Controller`;
		const service = `${variants.pascal}Service`;
		const repository = `${variants.pascal}Repository`;
		const tableName = variants.pluralSnake;
		const viewComponent = `${variants.pascal}s/Index`;
		const viewShowComponent = `${variants.pascal}s/Show`;

		logger.heading(
			`Scaffolding ${variants.pascal} (style=${style}, view=${ctx.config.view}, orm=${orm})`,
		);
		const written: string[] = [];

		// 1) Controller
		{
			const code = render(templates.crud.controller, {
				name: variants.pascal,
				camel: variants.camel,
				kebab: variants.kebab,
				snake: variants.snake,
				tableName,
				service,
				serviceCamel: `${variants.camel}Service`,
				controller,
				viewComponent,
				viewShowComponent,
				hasInertia,
			});
			const out = resolve(
				ctx.cwd,
				ctx.config.paths.controllers,
				`${variants.kebab}.controller.ts`,
			);
			if (!writeFile(out, code, { skipIfExists: true })) {
				logger.warn(`skipped (exists): ${out}`);
			} else {
				logger.success(`created ${out}`);
				written.push(out);
			}
		}

		// 2) Service
		{
			const code = render(templates.service, {
				name: variants.pascal,
				camel: variants.camel,
				kebab: variants.kebab,
				snake: variants.snake,
				hasRepo: !noRepo,
				repository,
				repositoryCamel: `${variants.camel}Repository`,
			});
			const out = resolve(
				ctx.cwd,
				ctx.config.paths.services,
				`${variants.kebab}.service.ts`,
			);
			if (!writeFile(out, code, { skipIfExists: true })) {
				logger.warn(`skipped (exists): ${out}`);
			} else {
				logger.success(`created ${out}`);
				written.push(out);
			}
		}

		// 3) Repository + Model (only if ORM is configured)
		if (!noRepo) {
			if (orm === "drizzle" || orm === "kysely") {
				let code: string;
				if (orm === "drizzle") {
					// Use the dialect-aware template.
					const tpl = renderDrizzleDialect(dialect);
					code = render(tpl, {
						name: variants.pascal,
						camel: variants.camel,
						kebab: variants.kebab,
						snake: variants.snake,
						tableName,
						columns: renderDrizzleColumns(dialect),
					});
				} else {
					const tpl = templates.model[orm];
					code = render(tpl, {
						name: variants.pascal,
						camel: variants.camel,
						kebab: variants.kebab,
						snake: variants.snake,
						tableName,
						columns: renderDefaultColumns(orm),
					});
				}
				const out = resolve(
					ctx.cwd,
					ctx.config.paths.models,
					`${variants.kebab}.model.ts`,
				);
				if (!writeFile(out, code, { skipIfExists: true })) {
					logger.warn(`skipped (exists): ${out}`);
				} else {
					logger.success(`created ${out}`);
					written.push(out);
				}
			}

			// Repository
			const ormRepo = orm === "kysely" ? templates.repository.kysely : templates.repository.drizzle;
			const repoCode = render(ormRepo, {
				name: variants.pascal,
				camel: variants.camel,
				kebab: variants.kebab,
				snake: variants.snake,
				tableName,
				repository,
			});
			const repoOut = resolve(
				ctx.cwd,
				`${ctx.config.paths.app}/repositories`,
				`${variants.kebab}.repository.ts`,
			);
			mkdirSync(dirname(repoOut), { recursive: true });
			if (!writeFile(repoOut, repoCode, { skipIfExists: true })) {
				logger.warn(`skipped (exists): ${repoOut}`);
			} else {
				logger.success(`created ${repoOut}`);
				written.push(repoOut);
			}
		}

		// 4) DTO
		{
			const code = render(templates.crud.dto, {
				name: variants.pascal,
				camel: variants.camel,
				kebab: variants.kebab,
			});
			const out = resolve(
				ctx.cwd,
				ctx.config.paths.dto,
				`${variants.kebab}.dto.ts`,
			);
			if (!writeFile(out, code, { skipIfExists: true })) {
				logger.warn(`skipped (exists): ${out}`);
			} else {
				logger.success(`created ${out}`);
				written.push(out);
			}
		}

		// 5) Module
		{
			const code = render(templates.crud.module, {
				name: variants.pascal,
				camel: variants.camel,
				kebab: variants.kebab,
				controller,
				service,
				repository,
				hasRepo: !noRepo,
			});
			const out = resolve(
				ctx.cwd,
				ctx.config.paths.modules,
				`${variants.kebab}.module.ts`,
			);
			if (!writeFile(out, code, { skipIfExists: true })) {
				logger.warn(`skipped (exists): ${out}`);
			} else {
				logger.success(`created ${out}`);
				written.push(out);
			}
		}

		// 6) Test
		if (!noTest) {
			const code = render(templates.crud.test, {
				name: variants.pascal,
				camel: variants.camel,
				kebab: variants.kebab,
				controller,
				service,
			});
			const out = resolve(ctx.cwd, "tests", `${variants.kebab}.test.ts`);
			if (!writeFile(out, code, { skipIfExists: true })) {
				logger.warn(`skipped (exists): ${out}`);
			} else {
				logger.success(`created ${out}`);
				written.push(out);
			}
		}

		logger.blank();
		logger.heading("Next steps");
		logger.info(`1. Review the generated files:`);
		for (const f of written) logger.info(`     ${f}`);
		logger.info(`2. Add ${variants.pascal}Module to AppModule.imports.`);
		logger.info(
			`3. ${noRepo ? "" : `Run \`bun nx db:generate && bun nx db:migrate\` (or your migration tool).`}`,
		);
		logger.info(`4. Start the dev server: \`bun run dev\`.`);
		logger.blank();

		return 0;
	},
};

function renderDefaultColumns(orm: string): string {
	if (orm === "drizzle") {
		return "  title: text('title').notNull(),";
	}
	if (orm === "kysely") {
		return "  title: string,";
	}
	return "  title text,";
}

function renderDrizzleColumns(dialect: string): string {
	const helper = mapDrizzleType(dialect, "text");
	return `  title: ${helper}('title').notNull(),`;
}

export default makeCrudCommand;
