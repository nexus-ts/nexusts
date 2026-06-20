/**
 * CRUD scaffold — controller + service + repository + dto + module + tests.
 *
 * This is the Rails-style "scaffolding" command. The Makefile-like flow:
 *   nx make:crud Post
 *
 * Generates an entire feature slice in one shot. The controller's view
 * rendering branches on `nx.config.ts`'s `view` setting.
 *
 * Context:
 *   name        — PascalCase (e.g. "Post")
 *   camel       — camelCase (e.g. "post")
 *   kebab       — kebab-case (e.g. "post")
 *   snake       — snake_case (e.g. "post")
 *   tableName   — plural snake_case (e.g. "posts")
 *   service     — PascalCase service (e.g. "PostService")
 *   repository  — PascalCase repository (e.g. "PostRepository")
 *   controller  — PascalCase controller (e.g. "PostController")
 *   dto         — PascalCase DTO (e.g. "PostDto")
 *   viewComponent — PascalCase Inertia component (e.g. "Posts/Index")
 *   routing     — routing style (nest|adonis|functional)
 *   view        — view engine (rendu|edge|inertia|none)
 *   orm         — ORM driver (drizzle|prisma|kysely|none)
 *   hasOrm      — boolean string ("true"/"false") — used in {{#hasOrm}} blocks
 *   hasViews    — boolean string
 *   frontend    — Inertia frontend (react|vue|svelte|solid) — only used when view === 'inertia'
 *
 * Renders ONLY the parts that need file content; the command handler is
 * responsible for writing multiple files.
 */

export default `/* CRUD scaffold placeholder — see make-crud.ts for the actual files generated. */`;