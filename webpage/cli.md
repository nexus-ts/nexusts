---
title: CLI Reference
description: NexusTS CLI (nx) command reference
---

# CLI Reference

The `nx` CLI is NexusTS' command runner, inspired by AdonisJS Ace and Laravel Artisan.

## Global Usage

```bash
bun nx <command> [args...]

# Show help
bun nx help
bun nx <command> --help

# Show version
bun nx --version
```

> All examples below use `nx <command>` for brevity. Run `bun nx <command>`,
> `bun run nx <command>`, or `bunx nx <command>` in your project.
> Scaffolded projects include `"nx": "nx"` in `package.json` scripts,
> so `bun nx <command>` is the shortest form.

## Project Commands

### `nx init` / `nx i`

Initialize NexusTS in an existing directory (non-destructive).

```bash
nx init [dir] [options]
nx init --style nest --view inertia --orm drizzle --db sqlite --frontend react
```

| Flag | Description |
|------|-------------|
| `--style` | Routing style: `nest` / `adonis` / `functional` |
| `--view` | View engine: `rendu` / `edge` / `eta` / `inertia` / `none` |
| `--orm` | ORM driver: `drizzle` / `kysely` / `none` |
| `--db` | Database: 'sqlite' / `postgres` / `mysql` / `none` |
| `--frontend` | Inertia frontend: `react` / `vue` / `svelte` / `solid` |
| `--no-ssr` | Disable Inertia SSR |
| `--force` | Overwrite existing files |
| `--no-interaction` | Skip interactive prompts |

### `nx new` / `nx n`

Create a new NexusTS project in a fresh directory.

```bash
nx new <name> [options]
nx new my-app --style nest --view inertia --orm drizzle --db sqlite --frontend react
```

Same flags as `nx init`.

## Generator Commands

### `nx make:controller`

Generate a controller class.

```bash
nx make:controller User
# Creates app/controllers/user.controller.ts
```

### `nx make:service`

Generate a service class.

```bash
nx make:service User
# Creates app/services/user.service.ts
```

### `nx make:crud`

Generate a full CRUD scaffold (controller + service + model + repository).

```bash
nx make:crud Post
nx make:crud Post --no-views
```

### `nx make:model`

Generate a Drizzle model with schema.

```bash
nx make:model User
# Supports --columns, --timestamps, --soft-delete
```

### `nx make:repository`

Generate a repository class.

```bash
nx make:repository User
```

### `nx make:module`

Generate a feature module.

```bash
nx make:module Billing
```

### `nx make:migration`

Generate a database migration.

```bash
nx make:migration create_users_table
nx make:migration create_users_table --columns "name:text,email:text"
```

### `nx make:auth`

Scaffold authentication (better-auth integration).

```bash
nx make:auth
```

### `nx make:schedule`

Generate a scheduled task.

```bash
nx make:schedule DailyReport
```

### `nx make:listener`

Generate an event listener.

```bash
nx make:listener UserRegistered
```

### `nx make:middleware`

Generate a middleware.

```bash
nx make:middleware Logger
```

### `nx make:session`

Generate session configuration.

```bash
nx make:session
```

### `nx make:validator`

Generate a validation schema.

```bash
nx make:validator CreateUser
```

### `nx make:queue`

Generate a queue job.

```bash
nx make:queue SendEmail
```

## Database Commands

### `nx db:generate`

Generate Drizzle migrations from schema files.

```bash
nx db:generate
```

### `nx db:migrate`

Run pending migrations.

```bash
nx db:migrate
```

### `nx db:seed`

Run seed files.

```bash
nx db:seed
nx db:seed --create users    # Create a seed file
```

## Debug Commands

### `nx route:list`

List all registered routes.

```bash
nx route:list
```

### `nx repl`

Interactive debug console.

```bash
nx repl
# .services — list registered services
# .modules — list registered modules
# .routes — list registered routes
# .help — show available commands
```

### `nx info`

System diagnostics.

```bash
nx info
# Shows: node version, bun version, platform, framework version
```

## Configuration

NexusTS is configured via `nx.config.ts` at the project root:

```ts
import { defineConfig } from '@nexusts/core';

export default defineConfig({
  routing: 'nest',           // nest | adonis | functional
  view: 'rendu',             // rendu | edge | eta | inertia | none
  viewPaths: 'resources/views',  // template directory
  orm: 'drizzle',            // drizzle | kysely | none
  dbDriver: 'sqlite',    // sqlite | postgres | mysql | ...
  dbUrl: 'app.db',           // database URL
});
```
