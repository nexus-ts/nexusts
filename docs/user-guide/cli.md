# CLI · `nx` command runner

> 한국어 버전: [`cli.ko.md`](./cli.ko.md)

Nexus ships an Adonis ACE / Ruby on Rails-style CLI under the
`nx` command. It scaffolds controllers, services, modules, models,
migrations, middleware, validators, and **full CRUD slices** for any
resource — all driven by `nx.config.ts` so the generated code matches
your project's chosen routing style, view engine, ORM, and database.

---

## 1. Install

The CLI is part of the `nexus` package — no extra dependency:

```bash
bun add nexus reflect-metadata zod hono
```

After install, `bunx nx ...` works automatically via the `bin` entry
in `nexus/package.json`.

---

## 2. Quick reference

| Command | What it does |
| ------- | ------------ |
| `nx new <name>` | Scaffold a new project |
| `nx init` | Generate `nx.config.ts` in the current directory |
| `nx make:crud <Name>` | Full CRUD slice (Rails-style scaffold) |
| `nx make:controller <Name>` | Single controller class |
| `nx make:service <Name>` | Service class |
| `nx make:module <Name>` | `@Module()` wiring |
| `nx make:model <Name>` | Table schema (Drizzle / Prisma / Kysely) |
| `nx make:migration <Name>` | Migration file |
| `nx make:middleware <Name>` | Middleware class |
| `nx make:validator <Name>` | Zod DTO |
| `nx route:list` | List registered routes |
| `nx info` | Print resolved config + env |
| `nx help [command]` | Show help |

Every command has **short aliases**:

| Command | Aliases |
| ------- | ------- |
| `nx make:controller` | `mc`, `make-controller` |
| `nx make:service` | `ms`, `make-service` |
| `nx make:module` | `mm`, `make-module` |
| `nx make:model` | `mmodel`, `make-model` |
| `nx make:migration` | `mkm`, `make-migration` |
| `nx make:middleware` | `mwm`, `make-middleware` |
| `nx make:validator` | `mv`, `make-validator` |
| `nx make:crud` | `crud`, `make-crud`, `scaffold` |
| `nx route:list` | `routes`, `route-list` |
| `nx info` | `i` |
| `nx new` | `n` |
| `nx init` | `i` |

---

## 3. `nx new <name>`

Scaffold a new project from scratch.

```bash
nx new my-app
# Interactive — picks routing/view/orm/db

nx new my-app --style nest --view inertia --orm drizzle --db bun-sqlite --no-interaction
# Non-interactive
```

What you get:

```
my-app/
├── nx.config.ts
├── package.json
├── tsconfig.json
├── README.md
└── src/app/
    ├── main.ts
    ├── app.module.ts
    └── controllers/
        └── home.controller.ts
```

Then:

```bash
cd my-app
bun install
bun run dev
```

---

## 4. `nx init`

Generate (or refresh) `nx.config.ts` in an existing project.

```bash
nx init
# Asks: routing / view / orm / db / frontend

nx init --style nest --view inertia --orm drizzle --db bun-sqlite --no-interaction
# Skips prompts

nx init --merge
# Keeps existing fields; only fills missing ones
```

Generated `nx.config.ts`:

```ts
/**
 * Nexus project configuration.
 * Run `nx info` to see the resolved values.
 */

export default {
  routing: 'nest',
  view: 'inertia',
  orm: 'drizzle',
  database: {
    driver: 'bun-sqlite',
    url: process.env.DATABASE_URL ?? 'app.db',
  },
  inertia: {
    frontend: 'react',
    ssr: true,
    version: '1.0.0',
  },
  paths: {
    app:         'src/app',
    controllers: 'src/app/controllers',
    services:    'src/app/services',
    modules:     'src/app/modules',
    models:      'src/app/models',
    migrations:  'src/app/database/migrations',
    middleware:  'src/app/middleware',
    dto:         'src/app/dto',
  },
};
```

---

## 5. `nx make:crud <Name>` (the headline command)

Generate a **complete feature slice** for a single resource —
controller, service, repository, model, DTO, module, and test, all in
one shot. Mirrors `rails generate scaffold`.

```bash
nx make:crud Post
```

For a `Post` model, the CLI produces:

```
src/app/controllers/post.controller.ts
src/app/services/post.service.ts
src/app/models/post.model.ts
src/app/dto/post.dto.ts
src/app/modules/post.module.ts
tests/post.test.ts
```

The generated files **adapt to your `nx.config.ts`**:

- **Routing style** → controller template
  - `nest` → `@Controller` / `@Get` decorators
  - `adonis` → plain class methods
  - `functional` → object of Hono-native handlers
- **View engine** → `inertia` adds `inertia.render(...)` calls
- **ORM** → Drizzle / Prisma / Kysely template selection

### Flags

| Flag | Effect |
| ---- | ------ |
| `--no-views` | Skip Inertia rendering even if `view === 'inertia'` |
| `--no-repo` | Skip the repository / model (use plain in-memory service) |
| `--no-test` | Skip the test file |
| `--style nest\|adonis\|functional` | Override routing style |
| `--orm drizzle\|prisma\|kysely` | Override ORM |

### Example

```bash
nx make:crud User --no-views --style functional
```

Produces a JSON-only functional API:

```ts
// src/app/controllers/user.controller.ts (functional style)
export const userRoutes = {
  list: async (c: Context) => c.json([]),
  show: async (c: Context) => c.json({ id: c.req.param('id') }),
  create: async (c: Context) => {
    const body = await c.req.json();
    return c.json({ created: body }, 201);
  },
  // ...
};
```

---

## 6. Per-resource `make:*` commands

### `nx make:controller <Name>`

```bash
nx make:controller User
nx make:controller Comment --style functional
nx make:controller Webhook --no-service
```

### `nx make:service <Name>`

```bash
nx make:service User
nx make:service Comment --no-repo
```

### `nx make:module <Name>`

```bash
nx make:module User
nx make:module User --no-controller --no-service
```

### `nx make:model <Name>`

```bash
nx make:model User
nx make:model User --columns "name:text,email:text,bio:text,age:integer"
nx make:model User --orm drizzle
```

### `nx make:migration <Name>`

```bash
nx make:migration create_users_table
nx make:migration create_users_table --columns "name:text,email:text"
nx make:migration add_email_to_users
```

Filename pattern: `YYYYMMDD_HHmmss_<snake>.sql` (or `.ts` for Drizzle).

### `nx make:middleware <Name>`

```bash
nx make:middleware Auth
nx make:middleware RateLimit
```

### `nx make:validator <Name>`

```bash
nx make:validator User
nx make:validator CreateOrder
```

---

## 7. `nx info`

Print the resolved configuration and environment. Useful for
debugging the config layer.

```bash
nx info
```

Output:

```
────────────────────────────
  Nexus CLI — Project Info
────────────────────────────

ℹ  Resolved configuration

  routing           nest
  view              inertia
  orm               drizzle
  database.driver   bun-sqlite
  database.url      app.db
  inertia.frontend  react
  inertia.ssr       true
  inertia.version   1.0.0

ℹ  Paths
  ...

ℹ  Environment
  NODE_ENV  (unset)
  NX_ORM    drizzle
  ...
```

---

## 8. `nx route:list`

Lists every registered HTTP route, reading `@Controller` / `@Get`
metadata from controllers. Color-codes HTTP methods (GET=cyan,
POST=green, DELETE=red, …).

```bash
nx route:list
nx route:list --format json
```

For Adonis-style or functional controllers, no routes will be listed
(dynamic registration), and the command emits an informational message.

---

## 9. Environment overrides

Every config field can be overridden via env vars. Useful in CI.

| Variable | Effect |
| -------- | ------ |
| `NX_ROUTING` | Routing style |
| `NX_VIEW` | View engine |
| `NX_ORM` | ORM driver |
| `NX_DATABASE_DRIVER` | Database driver |
| `NX_DATABASE_URL` | Database URL |
| `NX_INERTIA_FRONTEND` | Inertia frontend |
| `NX_INERTIA_SSR` | `true` / `false` |
| `NX_INERTIA_VERSION` | Asset version string |

Example:

```bash
NX_ORM=prisma nx make:crud User
```

---

## 10. Non-interactive mode

Pass `--no-interaction` to skip prompts (essential for CI):

```bash
nx make:crud Post --no-interaction --style nest --view inertia --orm drizzle
```

---

## 11. Programmatic API

Every CLI module is also importable from `nexus/cli`:

```ts
import { loadConfig, render, parseArgs } from 'nexus/cli';
import controllerTemplate from 'nexus/cli/templates/controller/nest.js';

const config = await loadConfig();
const code = render(controllerTemplate, {
  name: 'User',
  service: 'UserService',
  serviceCamel: 'userService',
  kebab: 'user',
  camel: 'user',
  snake: 'user',
});
```

This is what the `make:*` commands do internally.

---

## 12. Writing your own command

```ts
// src/cli/commands/make-feature.ts
import type { Command, CommandContext } from 'nexus/cli';
import { logger, writeFile, render } from 'nexus/cli';

export default {
  name: 'make:feature',
  summary: 'Generate a feature flag',
  async run(ctx: CommandContext): Promise<number> {
    const name = ctx.positional[0];
    if (!name) {
      logger.error('Usage: nx make:feature <Name>');
      return 1;
    }
    writeFile(`src/feature-flags/${name.toLowerCase()}.ts`, `// TODO`);
    logger.success(`created ${name}`);
    return 0;
  },
};
```

Register in `src/cli/commands/index.ts`:

```ts
import makeFeature from './make-feature.js';
commands.push(makeFeature);
```

---

## 13. See also

- [`controllers.md`](./controllers.md) — three routing styles
- [`dependency-injection.md`](./dependency-injection.md) — modules & DI
- [`validation.md`](./validation.md) — Zod DTOs
- [`view-engines.md`](./view-engines.md) — Rendu / Edge / Inertia
- [Design: architecture](../design/architecture.md) — where the CLI sits in the stack
