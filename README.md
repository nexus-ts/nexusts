# NexusJS

**Bun Native Fullstack Framework** — NestJS structure × Adonis productivity × Hono edge performance.

> **v0.4 — observability & DX.** All 22 modules ship. Tier 1 and
> Tier 2 gaps from the NestJS / AdonisJS gap analyses are now fully
> closed. New in v0.4: `nexusjs/openapi`, `nexusjs/upload`, `nexusjs/sse`,
> `nexusjs/tracing`, `nexusjs/metrics`, and request-scoped DI in the
> core. See [CHANGELOG.md](./CHANGELOG.md) for the v0.4 release
> notes.

---

## What's in v0.6

The framework now ships **26 independent modules** — every one is
its own bundle entry point, so you install only what you use. Tier 1
and Tier 2 gaps from the NestJS / AdonisJS gap analyses are now
fully closed.

| Module | Purpose |
| ------ | ------- |
| `nexusjs` (core) | MVC + DI + validation + 3 routing styles + view engines + Inertia.js |
| `nexusjs/cli` (`nx`) | Adonis ACE-style command runner — `new`, `init`, `make:*`, `migrate`, `info` |
| `nexusjs/auth` | better-auth integration with `@CurrentUser` and `authMiddleware` |
| `nexusjs/queue` | BullMQ + Cloudflare Queues + memory backends. `@OnQueueReady` decorator |
| `nexusjs/schedule` | Custom cron parser. `@Cron` / `@Interval` / `@Timeout` decorators |
| `nexusjs/events` | `NexusEventEmitter` with wildcards, priorities, guards. `@OnEvent` decorator |
| `nexusjs/session` | Cookie (HMAC) + memory + **Drizzle** backends. Sliding expiry, rotation |
| `nexusjs/health` | `/health/live` · `/health/ready` · `/health/startup`. Built-in indicators |
| `nexusjs/config` | Zod-validated configuration. Layered loading from env, `.env`, `load()` |
| `nexusjs/logger` | Pino-backed structured logging. Pretty-print in dev, JSON in prod |
| `nexusjs/static` | Static file serving with ETag, Range, path-traversal protection |
| `nexusjs/limiter` | Rate limiting. 3 strategies × memory / **Drizzle** storage |
| `nexusjs/shield` | Security suite: CSRF + HSTS + CSP + X-Frame-Options + Referrer-Policy |
| `nexusjs/cache` | Application cache. Memory (LRU) / **Drizzle** backends. Tag invalidation |
| `nexusjs/drive` | File storage abstraction. Memory / Local / S3 / R2 drivers |
| `nexusjs/mail` | Outbound email. Null / File / SMTP transports. MJML rendering |
| `nexusjs/drizzle` | **Default ORM.** 5 dialects, `DrizzleModel`, `DrizzleRepository`, migrations, raw SQL (injection-safe) |
| `nexusjs/openapi` | OpenAPI 3.1 spec generation + Scalar UI. Auto-derives from Zod validation schemas |
| `nexusjs/upload` | Multipart file upload. `@Upload()` / `@UploadedFile()` decorators. Size, MIME, count validation |
| `nexusjs/sse` | Server-Sent Events. `SseStream` with pending-write tracking. `sse(c, handler)` helper |
| `nexusjs/tracing` | OpenTelemetry distributed tracing. Lazy SDK loading. `@Trace()` decorator. W3C + B3 propagation |
| `nexusjs/metrics` | Prometheus / OpenMetrics. Counter / Gauge / Histogram / Summary. `@Counted()` / `@Timed()` decorators |
| **Request-scoped DI** *(core)* | `@Injectable({ scope: 'request' })` for per-request provider lifetime via `AsyncLocalStorage` |
| `nexusjs/ws` | WebSockets on Bun (primary) and Node (via `ws`). `@WebSocketGateway()`, `@OnWebSocketMessage()`, rooms, broadcast |
| `nexusjs/crypto` | AES-256-GCM encryption + HMAC + scrypt/argon2 password hashing. Single APP_KEY for sessions, CSRF, encrypted data |
| `nexusjs/i18n` | Locale-aware translations + date/number/currency formatters via `Intl`. `I18nService`, `@CurrentLocale()`, JSON message catalogs |
| `nexusjs/redis` | Runtime-aware Redis client (Bun / Node / Workers KV). Powers `redis` / `cloudflare-kv` session & cache backends |

See [docs/user-guide/drizzle.md](./docs/user-guide/drizzle.md) for the
Drizzle integration guide, [docs/user-guide/tracing.md](./docs/user-guide/tracing.md)
for OpenTelemetry, [docs/user-guide/metrics.md](./docs/user-guide/metrics.md)
for Prometheus, and [CHANGELOG.md](./CHANGELOG.md) for the detailed
v0.4 release notes.

---

## Why Nexus?

| Capability                       | NestJS | Adonis | Hono  | **Nexus** |
| -------------------------------- | :----: | :----: | :---: | :-------: |
| Bun-native runtime               |   ❌   |   △    |   ✅   |    ✅     |
| Cloudflare Workers / Edge        |   △    |   ❌   |   ✅   |    ✅     |
| MVC + Service + Repository       |   △    |   ✅   |   ❌   |    ✅     |
| Class decorators (Nest style)    |   ✅   |   ❌   |   ❌   |    ✅     |
| Adonis-style router              |   ❌   |   ✅   |   ❌   |    ✅     |
| Functional handler (Hono style)  |   △    |   ❌   |   ✅   |    ✅     |
| Zod validation pipeline          |   △    |   ✅   |   ❌   |    ✅     |
| Three view engines (Rendu/Edge/Inertia) | ❌ |   ✅   |   ❌   |    ✅     |
| **Default ORM (Drizzle, 5 dialects)** |   △   | Lucid  |   ❌   |    ✅     |
| **Multi-pod session, cache, limiter via Drizzle** |  △ | ✅ | ❌ | **✅** |
| **26 independent bundle entry points** |   ❌   |   △   |   ❌   |    ✅     |
| **SQL-injection-safe raw queries by construction** |   △   |   △   |   ❌   |    ✅     |
| **Migrations + autoMigrate on boot** |   △   |   ✅   |   ❌   |    ✅     |

---

## Install

```bash
bunx create-nexus my-app   # scaffold a new project
cd my-app
bun install
bun run dev
```

Or use it as a library in an existing project:

```bash
bun add nexus reflect-metadata zod hono
# Add the modules you need:
bun add nexus/auth nexus/queue nexus/drizzle
```

Every module is its own bundle entry point — install only what you
use. The CLI (`nx`) is shipped as the `nx` bin and the `nexusjs/cli`
import:

```bash
bun add nexus/cli     # optional — for the `nx` command runner
```

---

## Quick start

A minimal app with the **default ORM (Drizzle)** and the most
common modules:

```ts
// src/db/schema.ts
import { pgTable, serial, text, timestamp } from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  email: text('email').notNull().unique(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});
```

```ts
// src/app/app.module.ts
import { Module } from 'nexusjs';
import { DrizzleModule } from 'nexusjs/drizzle';
import { ConfigModule } from 'nexusjs/config';
import { LoggerModule } from 'nexusjs/logger';
import { HealthModule } from 'nexusjs/health';
import { LimiterModule } from 'nexusjs/limiter';
import { SessionModule } from 'nexusjs/session';
import { CacheModule } from 'nexusjs/cache';
import { DriveModule } from 'nexusjs/drive';
import { MailModule } from 'nexusjs/mail';
import { ShieldModule } from 'nexusjs/shield';
import { AuthModule } from 'nexusjs/auth';
import { OpenAPIModule } from 'nexusjs/openapi';
import { UploadModule } from 'nexusjs/upload';
import { TracingModule } from 'nexusjs/tracing';
import { MetricsModule } from 'nexusjs/metrics';
import { UserModule } from './modules/user.module.js';
import { configSchema } from './config/schema.js';

@Module({
  imports: [
    ConfigModule.forRoot({ schema: configSchema, exitOnError: true }),
    LoggerModule.forRoot({ pretty: process.env.NODE_ENV !== 'production' }),
    HealthModule.forRoot({ builtIn: { memory: true, disk: { threshold: 0.1 } } }),
    DrizzleModule.forRoot({
      dialect: 'postgres',
      connection: { url: process.env.DATABASE_URL! },
    }),
    SessionModule.forRoot({ backend: 'cookie', cookie: { secret: process.env.SESSION_SECRET! } }),
    CacheModule.forRoot({ defaultTtl: 300 }),
    DriveModule.forRoot({ driver: new LocalDriver({ root: '/var/data' }) }),
    MailModule.forRoot({ defaultFrom: 'no-reply@example.com' }),
    LimiterModule.forRoot({ rules: [{ path: '/api/*', points: 100, duration: '1m' }] }),
    ShieldModule.forRoot({ csrf: { enabled: true }, hsts: { maxAge: 31_536_000 } }),
    AuthModule.forRoot({ /* better-auth config */ }),
    OpenAPIModule.forRoot({ title: 'My App', version: '1.0.0', path: '/docs' }),
    UploadModule.forRoot({ maxFileSize: 10 * 1024 * 1024 }),
    TracingModule.forRoot({ serviceName: 'my-app', exporter: 'otlp-http' }),
    MetricsModule.forRoot({ path: '/metrics' }),
    UserModule,
  ],
})
export class AppModule {}
```

```ts
// src/app/main.ts
import 'reflect-metadata';
import { Application } from 'nexusjs';
import { AppModule } from './app.module.js';

const app = new Application(AppModule);
await app.listen(3000);
```

```ts
// src/app/modules/user/user.module.ts
import { Module } from 'nexusjs';
import { UserController } from './user.controller.js';
import { UserService } from './user.service.js';
import { UserRepository } from './user.repository.js';

@Module({
  controllers: [UserController],
  providers: [UserService, UserRepository],
})
export class UserModule {}
```

```ts
// src/app/modules/user/user.service.ts
import { Inject, Injectable } from 'nexusjs';
import { DrizzleService } from 'nexusjs/drizzle';
import { eq } from 'drizzle-orm';
import { users } from '../../db/schema.js';

@Injectable()
export class UserService {
  constructor(@Inject(DrizzleService.TOKEN) private db: DrizzleService) {}

  findAll() { return this.db.select().from(users).all(); }
  findById(id: number) { return this.db.select().from(users).where(eq(users.id, id)).get(); }
  async create(email: string) {
    return (await this.db.insert(users).values({ email }).returning())[0];
  }
}
```

```ts
// src/app/modules/user/user.controller.ts
import { z } from 'zod';
import { Body, Controller, Delete, Get, Inject, Param, Post, Query, Validate } from 'nexusjs';
import { UserService } from './user.service.js';

const CreateUserSchema = z.object({
  email: z.string().email(),
});

@Controller('/users')
export class UserController {
  constructor(@Inject(UserService) private users: UserService) {}

  @Get('/')        async index() { return this.users.findAll(); }
  @Get('/:id')     async show(@Param('id') id: string) { return this.users.findById(Number(id)); }
  @Post('/')       @Validate({ body: CreateUserSchema }) async create(@Body() body: z.infer<typeof CreateUserSchema>) { return this.users.create(body.email); }
  @Delete('/:id')  async destroy(@Param('id') id: string) { /* ... */ }
}
```

```bash
$ bun run dev
[nexus] Routes registered. Listening on :3000
[nexus] Listening on http://localhost:3000

$ curl http://localhost:3000/users
[{"id":1,"email":"alice@example.com", ...}]

$ curl -X POST http://localhost:3000/users \
       -H "Content-Type: application/json" \
       -d '{"email":"bob@example.com"}'
{"id":2,"email":"bob@example.com"}
```

### Generate the schema with the CLI

```bash
# Initialise nx.config.ts + drizzle.config.ts
nx init --orm drizzle --db postgres

# Generate a model
nx make:model User --columns 'email:text,status:boolean' --dialect postgres

# Generate a migration
nx make:migration create_users_table --dialect postgres --columns 'email:text'

# Apply pending migrations
nx db:migrate

# Inspect migration state
nx db:migrate --status

# Run database seeds
nx db:seed

# Scaffold a new seed file
nx db:seed --create users
```

See [docs/user-guide/drizzle.md](./docs/user-guide/drizzle.md) for the
full Drizzle integration guide.

---

## Three routing styles

### 1. Nest style (class decorators)

```ts
@Controller('/users')
class UserController {
  constructor(@Inject(UserService) private users: UserService) {}

  @Get('/')        list() {}
  @Get('/:id')     show(@Param('id') id: string) {}
  @Post('/')       create(@Body() body: CreateUserDto) {}
  @Put('/:id')     update(@Param('id') id: string, @Body() body: UpdateUserDto) {}
  @Delete('/:id')  destroy(@Param('id') id: string) {}
}
```

### 2. Adonis style

```ts
app.server.router.add('GET',  '/users',      UserController, 'list');
app.server.router.add('POST', '/users',      UserController, 'create');
app.server.router.add('GET',  '/users/:id',  UserController, 'show');
app.server.router.add('DELETE', '/users/:id', UserController, 'destroy');
```

### 3. Functional style (Hono-native)

```ts
app.server.router.raw('GET', '/health', (c) => c.json({ ok: true }));
app.server.router.raw('POST', '/webhooks/stripe', async (c) => {
  const event = await c.req.json();
  // ...
});
```

---

## Parameter decorators

| Decorator    | Reads                                         |
| ------------ | --------------------------------------------- |
| `@Body(key?)`| Parsed request body (JSON / form / multipart) |
| `@Query(k?)` | URL query string                              |
| `@Param(k?)` | Path parameters                               |
| `@Headers(k?)`| Request headers                              |
| `@Req()` / `@Ctx()` | Hono context                        |
| `@Res()`     | Hono response                                 |
| `@Next()`    | next() callback (for middleware-style)       |
| `@User()`    | Authenticated user (set by auth middleware)   |

When a parameter has no key argument (e.g. `@Body()`), the full parsed
object is injected. With a key (e.g. `@Param('id')`), only that property
is injected.

---

## Validation with Zod

```ts
@Post('/')
@Validate({
  body: z.object({ name: z.string(), email: z.string().email() }),
  query: z.object({ dryRun: z.coerce.boolean().optional() }),
  params: z.object({ id: z.coerce.number() }),
})
async create(@Body() body, @Query() query, @Param() params) { ... }
```

Failed validation returns a 400 with details:

```json
{
  "error": "Validation failed",
  "issues": [
    { "code": "invalid_string", "validation": "email", "path": ["email"], "message": "Invalid email" }
  ]
}
```

---

## Dependency injection

NestJS-style constructor injection via the `@Inject(Token)` parameter
decorator. Use `@Injectable()` on services and repositories, and the
container resolves the dependency graph automatically.

```ts
@Injectable()
class UserService {
  constructor(@Inject('DB') private db: DrizzleLike) {}
}

@Injectable()
class UserRepository {
  constructor(@Inject('DB') private db: DrizzleLike) {}
}

@Module({
  providers: [
    UserService,
    UserRepository,
    { provide: 'DB', useValue: drizzleInstance },
  ],
  exports: [UserService],
})
class UserModule {}
```

> **Why `@Inject(Token)`?** Bun's native TypeScript transformer does not
> emit `design:paramtypes` metadata. The framework falls back to
> explicit `@Inject()` tokens for portability. If you build with `tsc`
> first and run with `node` or `bun src/...`, the bare-type form works.

---

## Inertia.js adapter

Single-page-app UX without writing an API. The framework ships a
server-side [Inertia.js v2/v3 protocol](https://inertiajs.com/the-protocol)
adapter that returns either JSON (XHR) or a full HTML shell (first
load) depending on the request.

### Enable it

```ts
const app = new Application(AppModule, {
  inertia: {
    version: '1.0.0',                 // asset version for 409 on mismatch
    title: 'My App',
    sharedProps: () => ({              // per-request global props
      appName: 'My App',
      currentUser: await getCurrentUser(),
    }),
  },
});
```

### Render a page

```ts
@Controller('/users')
class UserController {
  constructor(@Inject(Inertia.TOKEN) private inertia: Inertia) {}

  @Get('/')
  index() {
    return this.inertia.render('Users/Index', {
      users: this.userService.findAll(),
    });
  }
}
```

The router detects the response (via a discriminator tag) and emits:

- **First load (no `X-Inertia` header)** — full HTML page with the page
  object embedded as `data-page` JSON.
- **Subsequent visits (`X-Inertia: true`)** — JSON page object only.

### Lazy-evaluation helpers

Wrap a callback in one of these helpers to control *when* it resolves
and how the client merges the value:

| Helper                | Behaviour                                              |
| --------------------- | ------------------------------------------------------ |
| `defer(fn, group?)`   | Send `null` placeholder; client refetches later        |
| `always(fn)`          | Include on every partial reload, even if filtered out  |
| `optional(fn, n?)`    | Skip on partial reloads when length ≤ threshold        |
| `merge(fn, ids?)`     | Client merges new value with previous (pagination)     |
| `deepMerge(fn)`       | Client deep-merges new value with previous             |
| `once(fn)`            | Include only on the first (HTML) load                  |

```ts
@Get('/dashboard')
dashboard() {
  return this.inertia.render('Dashboard', {
    // Always included, even when the client only fetches one prop.
    currentUser: always(() => ({ id: 1, name: 'Alice' })),

    // Deferred — placeholder, then a follow-up partial reload.
    stats: defer(async () => ({ visits: 1234 }), 'metrics'),

    // Pagination — the client appends to its existing array.
    users: merge(() => this.userService.page(1), [['id']]),

    // Only on first page load (HTML).
    featureFlags: once(() => ({ newDashboard: true })),
  });
}
```

### Asset versioning

When `version` is configured and the client's `X-Inertia-Version`
header doesn't match, the adapter responds with **409 Conflict** and
the `X-Inertia-Location` header pointing at the same URL — the client
then does a full page reload (refetching CSS/JS bundles).

```http
GET /dashboard
X-Inertia: true
X-Inertia-Version: 0.9.0

HTTP/1.1 409 Conflict
X-Inertia-Location: /dashboard
```

### Full-page navigation and history

Force the client to bypass Inertia's client-side history (useful for
logout or any flow where you want a clean reload):

```ts
@Post('/logout')
logout() {
  // 303-style redirect — full page reload to /login.
  return this.inertia.location('/login');
}
```

`inertia.back()` returns a 302 with `Location: back` — the client
steps back in its history.

### Shared data

```ts
app.inertia.share('flash', { type: 'success', message: 'Saved!' });
// or
app.inertia.share({ csrfToken: '...', currentUser: { id: 1 } });
```

Shared props appear in every page response and survive partial reloads.

### SSR

Plug in a server-side renderer for React, Vue, Svelte, or Solid:

```ts
import { reactSsr } from '@nexus/inertia-react';

app.inertia.setSsrAdapter(reactSsr());
```

Without an adapter the framework falls back to a minimal HTML shell —
the client hydrates from `data-page` after JS loads. (This is the
recommended starting point.)

### Protocol reference

- **Response headers**
  - `Vary: X-Inertia` — every response
  - `X-Inertia: true` — JSON responses only
  - `X-Inertia-Location: <url>` — on 409 (asset version mismatch) and
    `inertia.location(...)`
- **Request headers** (sent by the client)
  - `X-Inertia: true` — marks an XHR visit
  - `X-Inertia-Version: <string>` — for asset mismatch checks
  - `X-Inertia-Partial-Component: <name>` — for partial reloads
  - `X-Inertia-Partial-Data: a,b,c` — `only` filter
  - `X-Inertia-Partial-Except: a,b,c` — `except` filter
  - `X-Inertia-Reset: a,b,c` — client-discard markers

---

### Forms (`<Form>` server-side helper)

Inertia v3's `<Form>` component pairs with this server-side helper to
keep form submissions out of the controller's hot path. The pattern
is the classic **Post/Redirect/Get**:

```ts
import { z } from 'zod';
import { Body, Controller, Post } from 'nexusjs';
import { Inertia } from 'nexusjs/view/inertia';

const UserSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
});

@Controller('/users')
class UserController {
  constructor(@Inject(Inertia.TOKEN) private inertia: Inertia) {}

  @Post('/')
  async store(@Body() input: Record<string, any>) {
    const form = this.inertia.form('Users/Create');
    const result = UserSchema.safeParse(input);

    if (!result.success) {
      const errors: Record<string, string[]> = {};
      for (const issue of result.error.issues) {
        const path = issue.path.join('.');
        (errors[path] ??= []).push(issue.message);
      }
      return form
        .withErrorBag('createUser')
        .withErrors(errors)
        .withValues(input)   // re-populate the form
        .render();
    }

    return form.redirect('/users'); // 303 (PRG pattern)
  }
}
```

| Builder method   | Effect                                                     |
| ---------------- | ---------------------------------------------------------- |
| `withProps()`    | Merge a batch of props at once                             |
| `with(k, v)`     | Set a single prop                                          |
| `withErrors()`   | Attach validation errors (string or string[]) per field   |
| `withError()`    | Add a single error to a field                              |
| `withErrorBag()` | Name the form's error namespace (multiple forms / page)   |
| `withValues()`   | Re-populate the form inputs after a failed submission      |
| `render()`       | Emit the page (with errors + values injected)             |
| `redirect(url)`  | 303 redirect (PRG — prevents double-submit)                |
| `back(to?)`      | 303 redirect to `back` (or a specific URL)                 |

### Lazy props

`lazy(fn, tag?)` wraps a callback so its result is computed **once
per request** and shared across every key that points at the same
tag. Useful for any expensive computation that doesn't need to wait
for a partial reload but shouldn't repeat within the same response:

```ts
return this.inertia.render('Dashboard', {
  a: lazy(() => this.computeA(), 'stats'),
  b: lazy(() => this.computeB(), 'stats'),
});
```

### SSR adapters

The framework ships first-class adapters for React, Vue, Svelte,
and Solid. Each lazy-imports its engine — install only what you
use:

```ts
import { createReactAdapter, ComponentRegistry } from 'nexusjs/view/inertia/ssr';

const components = new ComponentRegistry()
  .register('Home', HomePage)
  .register('Users/Index', UsersIndexPage);

app.inertia.setSsrAdapter(createReactAdapter({ components }));
```

| Adapter                  | Engine    | SSR API                                        |
| ------------------------ | --------- | ---------------------------------------------- |
| `createReactAdapter`     | React 18+ | `react-dom/server.renderToString`              |
| `createVueAdapter`       | Vue 3     | `vue/server-renderer.renderToString`           |
| `createSvelteAdapter`    | Svelte 4/5| `svelte/server.render` or `Component.render`  |
| `createSolidAdapter`     | Solid     | `solid-js/web.renderToString`                  |

### Form middleware (CSRF)

```ts
import { inertiaFormMiddleware } from 'nexusjs/view/inertia';

app.server.app.use('*', inertiaFormMiddleware({
  validateCsrf: true,
  csrfHeader: 'X-CSRF-Token',
  csrfField: '_token',
  csrfSharedKey: 'csrfToken',
}));
```

Returns **419 Page Expired** on mismatch. The form helper still owns
the per-field validation flow; this is the upstream CSRF gate.

---

---

## View engine

The framework ships with a Rendu adapter (PHP-style templates, fast on
every runtime) and an Edge adapter (mustache-style, AdonisJS-compatible).

```ts
import { RenduAdapter } from 'nexusjs/view';

const rendu = new RenduAdapter();
const html = await rendu.render(
  `<h1>Hello, <?= name ?>!</h1>
   <? for (const item of items) { ?>
     <li><?= item ?></li>
   <? } ?>`,
  { name: 'Nexus', items: ['a', 'b', 'c'] }
);
```

To use a different engine, implement the `ViewAdapter` interface:

```ts
import type { ViewAdapter } from 'nexusjs/view';

class MyEngine implements ViewAdapter {
  readonly name = 'my-engine';
  async render(template: string, data: Record<string, any>) { /* ... */ }
}

app.setViewAdapter(new MyEngine());
```

Or use the controller-level shortcut:

```ts
@Get('/users')
async index() {
  return {
    view: '<h1>Users</h1><?= users.length ?>',
    data: { users: this.users.findAll() },
  };
}
```

---

## Runtime adapters

The framework auto-detects Bun, Node, and Cloudflare Workers and loads
the appropriate adapter.

```ts
// Bun (default)
await app.listen(3000);

// Node
// (no extra setup — the server picks the Node adapter automatically)

// Cloudflare Workers
export default {
  fetch: app.fetch,
};
```

---

## Project layout (the framework source)

```
src/
├── core/                   # Framework core (always shipped)
│   ├── constants.ts        # Metadata keys, param types
│   ├── application.ts      # Main Application class
│   ├── di/                 # DIContainer, scanner, tokens
│   ├── decorators/         # @Module, @Controller, @Injectable, @Get, @Body, @Validate, ...
│   ├── http/               # NexusServer (Hono), multi-style router, middleware
│   ├── validation/         # Zod schema runner
│   ├── view/               # Rendu / Edge / Inertia adapters
│   └── runtime/            # Bun / Node / Cloudflare Workers adapters
├── cli/                    # `nx` command runner (optional bundle)
│   ├── commands/           # new, init, make:*, migrate, info
│   ├── templates/          # mustache-lite scaffolds
│   └── core/               # arg parser, prompts, fs helpers
├── auth/                   # `nexusjs/auth` (better-auth wrapper)
├── queue/                  # `nexusjs/queue` (BullMQ / Cloudflare / memory)
├── schedule/               # `nexusjs/schedule` (custom cron parser)
├── events/                 # `nexusjs/events` (typed emitter)
├── session/                # `nexusjs/session` (cookie / memory / drizzle backends)
├── health/                 # `nexusjs/health` (live/ready/startup + indicators)
├── config/                 # `nexusjs/config` (Zod-validated env config)
├── logger/                 # `nexusjs/logger` (Pino transports)
├── static/                 # `nexusjs/static` (file serving)
├── limiter/                # `nexusjs/limiter` (rate limiting)
├── shield/                 # `nexusjs/shield` (CSRF + security headers)
├── cache/                  # `nexusjs/cache` (LRU + drizzle)
├── drive/                  # `nexusjs/drive` (storage abstraction)
├── mail/                   # `nexusjs/mail` (SMTP / File / Null)
└── drizzle/                # `nexusjs/drizzle` (default ORM)
    ├── drivers/            # postgres / mysql / sqlite / bun-sqlite / d1
    ├── repository/         # DrizzleRepository (Lucid-style)
    ├── decorators/         # @Table / @Column / @PrimaryKey
    ├── drizzle.service.ts  # Main entry point
    └── drizzle.module.ts   # DI module
```

```

---

## Roadmap

The framework follows [Semantic Versioning](https://semver.org/).
Until v1.0, minor version bumps may include breaking changes. After
v1.0, only major bumps will.

### Shipped

- **v0.1** (2026-04-30) — MVC core, DI, validation, Rendu / Edge / Inertia adapters, CLI bootstrap.
- **v0.2** (2026-05-15) — `nexusjs/auth`, `nexusjs/queue`, `nexusjs/schedule`, `nexusjs/events`, `nexusjs/session`, full `nx` CLI.
- **v0.3** (2026-06-21) — production basics, cross-cutting features, `nexusjs/drizzle` as the default ORM.
- **v0.4** (2026-06-22) — observability + DX: `nexusjs/openapi`, `nexusjs/upload`, `nexusjs/sse`, `nexusjs/tracing`, `nexusjs/metrics`, request-scoped DI in core.
- **v0.5** (2026-06-23) — realtime + crypto + i18n + redis: `nexusjs/ws`, `nexusjs/crypto`, `nexusjs/i18n`, `nexusjs/redis`.
- **v0.6** (2026-06-24) — gRPC + tooling: `nexusjs/grpc` (reflection-based server + typed client) and a publishable `dist/` pipeline (`bin` field, `dist/src/*` flatten).
- **v0.6.1** (2026-06-25) — patch: `nexus` → `nexusjs` rename across all sources (191 files), `bin` field fix, `dist/src/*` flatten, docs in sync with the published name. No new features.

### Planned

- **v0.7** — `nexusjs/graphql` (code-first schema) and `nexusjs/resilience` (circuit breaker, retry, bulkhead).
- **v0.8** — `nexusjs/feature-flag` (canary / A/B testing), runtime parity test suite, performance benchmarks across Bun / Node / Workers.
- **v1.0** — stable public API surface with semver guarantees, removal of all v0.1 deprecated aliases, long-term LTS support plan.

Detailed release notes for every version live in
[`CHANGELOG.md`](./CHANGELOG.md).

## License

[MIT](./LICENSE) — Copyright © 2026 NexusJS Contributors.

The framework is released under the permissive MIT License. You can
use it in commercial and non-commercial projects, modify the source,
and distribute derivative works — as long as you preserve the
copyright notice and the license text. See the [LICENSE](./LICENSE)
file for the full text.

### Third-party notices

NexusJS depends on several open-source projects. Their licenses are
reproduced at install time via `bun install` (and `npm install`).
Notable runtime dependencies:

- **Hono** — MIT (web framework)
- **reflect-metadata** — Apache-2.0
- **Zod** — MIT (schema validation)
- **Rendu** — MIT (template engine)

Optional peer dependencies (each with its own license):

- **better-auth** — MIT
- **bullmq** — MIT
- **ioredis** — MIT
- **drizzle-orm** — Apache-2.0
- **@opentelemetry/*** — Apache-2.0
- **ws** — MIT
- **@grpc/grpc-js**, **@grpc/proto-loader** — Apache-2.0
