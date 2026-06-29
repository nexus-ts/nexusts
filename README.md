> ⚠️ **Experimental** — This package is actively developed. The API may change without notice until v1.0.

# NexusTS

<p align="center">
  <img src="./webpage/public/logo.svg" alt="NexusTS" width="320">
</p>

[![npm (create-nexusts)](https://img.shields.io/npm/v/create-nexusts?label=create-nexusts)](https://www.npmjs.com/package/create-nexusts)
[![npm (core)](https://img.shields.io/npm/v/@nexusts/core?label=@nexusts/core)](https://www.npmjs.com/package/@nexusts/core)
[![CI (Bun)](https://github.com/nexus-ts/nexusts/actions/workflows/ci.yml/badge.svg?label=Bun)](https://github.com/nexus-ts/nexusts/actions/workflows/ci.yml)
[![CI (Workers)](https://github.com/nexus-ts/nexusts/actions/workflows/ci-workers.yml/badge.svg)](https://github.com/nexus-ts/nexusts/actions/workflows/ci-workers.yml)
[![Drizzle Dialects](https://github.com/nexus-ts/nexusts/actions/workflows/ci-drizzle.yml/badge.svg)](https://github.com/nexus-ts/nexusts/actions/workflows/ci-drizzle.yml)

**Bun Native Fullstack Framework** — NestJS structure × Adonis productivity × Hono edge performance × TC39 standard ES decorators.

<p align="center">
  <a href="https://nexus-ts.github.io/nexusts/">🌐 Website</a>
  ·
  <a href="https://github.com/nexus-ts/nexusts">📦 GitHub</a>
  ·
  <a href="https://github.com/nexus-ts/nexusts/blob/main/docs/user-guide">📚 Docs</a>
  ·
  <a href="https://github.com/nexus-ts/nexusts/blob/main/CHANGELOG.md">📝 Changelog</a>
</p>

> **v0.9.14 — Experimental notice + analysis docs + lint fixes.**
> Experimental banner on all 34 package READMEs. Comprehensive
> NestJS/AdonisJS analysis reports. Biome lint cleanup. Drizzle
> `@ts-ignore` compatibility fix.
> 33 independent modules. See [CHANGELOG.md](./CHANGELOG.md) for details.

---

## What's in v0.9

The framework ships **33 independent modules** — every one is
its own bundle entry point, so you install only what you use. Tier 1
and Tier 2 gaps from the NestJS / AdonisJS gap analyses are fully
closed.

| Module | Purpose |
| ------ | ------- |
| `@nexusts/core` (core) | MVC + DI + validation + 3 routing styles + view engines + Inertia.js |
| `@nexusts/cli` (`nx`) | Adonis ACE-style command runner — `new`, `init`, `make:*`, `migrate`, `info` |
| `@nexusts/auth` | better-auth integration with `@CurrentUser` and `authMiddleware` |
| `@nexusts/queue` | BullMQ + Cloudflare Queues + memory backends. `@OnQueueReady` decorator |
| `@nexusts/schedule` | Custom cron parser. `@Cron` / `@Interval` / `@Timeout` decorators |
| `@nexusts/events` | `NexusEventEmitter` with wildcards, priorities, guards. `@OnEvent` decorator |
| `@nexusts/session` | Cookie (HMAC) + memory + **Drizzle** backends. Sliding expiry, rotation |
| `@nexusts/health` | `/health/live` · `/health/ready` · `/health/startup`. Built-in indicators |
| `@nexusts/config` | Zod-validated configuration. Layered loading from env, `.env`, `load()` |
| `@nexusts/logger` | Pino-backed structured logging. Pretty-print in dev, JSON in prod |
| `@nexusts/static` | Static file serving with ETag, Range, path-traversal protection |
| `@nexusts/limiter` | Rate limiting. 3 strategies × memory / **Drizzle** storage |
| `@nexusts/shield` | Security suite: CSRF + HSTS + CSP + X-Frame-Options + Referrer-Policy |
| `@nexusts/cache` | Application cache. Memory (LRU) / **Drizzle** / **Redis** backends. Tag invalidation |
| `@nexusts/drive` | File storage abstraction. Memory / Local / S3 / R2 drivers |
| `@nexusts/mail` | Outbound email. Null / File / SMTP transports. MJML rendering |
| `@nexusts/drizzle` | **Default ORM.** 5 dialects, `DrizzleModel`, `DrizzleRepository`, migrations, raw SQL (injection-safe) |
| `@nexusts/openapi` | OpenAPI 3.1 spec generation + Scalar UI. Auto-derives from Zod validation schemas |
| `@nexusts/upload` | Multipart file upload. `@Upload()` / `@UploadedFile()` decorators. Size, MIME, count validation |
| `@nexusts/sse` | Server-Sent Events. `SseStream` with pending-write tracking. `sse(c, handler)` helper |
| `@nexusts/tracing` | OpenTelemetry distributed tracing. Lazy SDK loading. `@Trace()` decorator. W3C + B3 propagation |
| `@nexusts/metrics` | Prometheus / OpenMetrics. Counter / Gauge / Histogram / Summary. `@Counted()` / `@Timed()` decorators |
| **Request-scoped DI** *(core)* | `@Injectable({ scope: 'request' })` for per-request provider lifetime via `AsyncLocalStorage` |
| `@nexusts/ws` | WebSockets on Bun (primary) and Node (via `ws`). `@WebSocketGateway()`, `@OnWebSocketMessage()`, rooms, broadcast |
| `@nexusts/crypto` | AES-256-GCM encryption + HMAC + scrypt/argon2 password hashing. Single APP_KEY for sessions, CSRF, encrypted data |
| `@nexusts/i18n` | Locale-aware translations + date/number/currency formatters via `Intl`. `I18nService`, `@CurrentLocale()`, JSON message catalogs |
| `@nexusts/redis` | Runtime-aware Redis client (Bun / Node / Workers KV). Powers `redis` / `cloudflare-kv` session & cache backends |
| `@nexusts/grpc` | Reflection-based gRPC server + typed client. Loads `.proto` files at runtime via `@grpc/proto-loader`. All four call types: unary (`@GrpcMethod`), server-stream (`@GrpcServerStream`), client-stream (`@GrpcClientStream`), bidi (`@GrpcBidiStream`) |
| `@nexusts/graphql` | SDL-first + code-first GraphQL endpoint (`autoSchema: true`). `@Resolver` / `@Query` / `@Mutation` / `@Arg` decorators with full SDL synthesis. In-bundle GraphiQL playground. Requires `graphql` peer-dep |
| `@nexusts/feature-flag` | Canary / A–B testing. `isEnabled(flag, ctx)`, rollout %, allowlist/denylist, pluggable backends (Memory / custom). `@FeatureFlag()` guard decorator |
| `@nexusts/resilience` | Retry + Circuit Breaker + Bulkhead in a single DI singleton. Eager `applyResilience()` auto-wrap at controller mount. `ResilienceAdminModule` with HTTP admin endpoints. Cross-pod stores: Redis / Drizzle / Memory. Circuit metrics, `forceOpen`/`forceClose`. **Zero new dependencies.** |
| `@nexusts/view` | View engine with 3 adapters: Rendu (default, every runtime), Edge (Adonis-style `.edge`), Eta (EJS-style `.eta`). Auto-detects adapter by file extension. `setViewPaths()` for file-based templates, `Application.tryLoadNxConfig()` auto-loads from `nx.config.ts` |
| `@nexusts/kysely` | **Typed SQL query builder.** Kysely integration with type-safe queries. `KyselyService`, `KyselyRepository` (Lucid-style), `KyselyModule.forRoot()`, built-in migration support via Kysely Migrator. Optional peer-dep (`bun add kysely`). Supports all Kysely dialects (SQLite, PostgreSQL, MySQL, etc.) |

See [`docs/user-guide/drizzle.md`](./docs/user-guide/drizzle.md) for the
Drizzle integration guide, [`docs/user-guide/kysely.md`](./docs/user-guide/kysely.md)
for Kysely, [`docs/user-guide/graphql.md`](./docs/user-guide/graphql.md)
for GraphQL, [`docs/user-guide/resilience.md`](./docs/user-guide/resilience.md)
for retry/circuit/bulkhead, and [CHANGELOG.md](./CHANGELOG.md)
for the detailed v0.8 release notes.

> 36 working examples under `examples/` — one per major module —
> double as living documentation and as the smoke-test suite. See
> [`docs/user-guide/testing-examples.md`](./docs/user-guide/testing-examples.md).

---

## Why NexusTS?

| Capability                       | NestJS | Adonis | Hono  | **NexusTS** |
| -------------------------------- | :----: | :----: | :---: | :-------: |
| Bun-native runtime               |   ❌   |   △    |   ✅   |    ✅     |
| Cloudflare Workers / Edge        |   △    |   ❌   |   ✅   |    ✅     |
| MVC + Service + Repository       |   △    |   ✅   |   ❌   |    ✅     |
| Class decorators (Nest style)    |   ✅   |   ❌   |   ❌   |    ✅     |
| **TC39 standard ES decorators** (no experimentalDecorators, no reflect-metadata) | △ | ❌ | ❌ | **✅** |
| Adonis-style router              |   ❌   |   ✅   |   ❌   |    ✅     |
| Functional handler (Hono style)  |   △    |   ❌   |   ✅   |    ✅     |
| Zod validation pipeline          |   △    |   ✅   |   ❌   |    ✅     |
| Three view engines (Rendu/Edge/Inertia) | ❌ |   ✅   |   ❌   |    ✅     |
| **Default ORM (Drizzle, 5 dialects)** |   △   | Lucid  |   ❌   |    ✅     |
| **Multi-pod session, cache, limiter via Drizzle** |  △ | ✅ | ❌ | **✅** |
| **33 independent bundle entry points** |   ❌   |   △   |   ❌   |    ✅     |
| **SQL-injection-safe raw queries by construction** |   △   |   △   |   ❌   |    ✅     |
| **Migrations + autoMigrate on boot** |   △   |   ✅   |   ❌   |    ✅     |
| **First-party GraphQL** (SDL + code-first) |   ✅   |   △    |   ❌   |    ✅     |
| **First-party retry / circuit / bulkhead** |   △   |   ❌   |   ❌   |    ✅     |
| **First-party gRPC server + client** |   ✅   |   ❌   |   ❌   |    ✅     |
| **Inertia.js v3 server-side**    |   ❌   |   ✅   |   ❌   |    ✅     |

---

## Standard decorators (v0.9+)

NexusTS v0.9 migrates from legacy TypeScript decorators (`experimentalDecorators: true`) to **TC39 standard ES decorators**. This means:

- **No `reflect-metadata` dependency** — saves ~16KB in your bundle
- **No `experimentalDecorators` tsconfig flag** — works with Bun's defaults
- **Field injection** instead of constructor injection — `@Inject(Token) declare field: Type`
- **`ctx.req.*` methods** instead of `@Param`/`@Body`/`@Query` parameter decorators
- **Backward compatible** — legacy decorator mode (`@Body()`, constructor `@Inject`) continues to work

### Before (legacy decorators)

```ts
@Controller('/users')
export class UserController {
  constructor(@Inject(UserService) private users: UserService) {}

  @Get('/:id')
  show(@Param('id') id: string) {
    return this.users.findById(Number(id));
  }

  @Post('/')
  create(@Body() body: CreateUserDto) {
    return this.users.create(body);
  }
}
```

### After (standard decorators)

```ts
@Controller('/users')
export class UserController {
  @Inject(UserService) declare users: UserService;

  @Get('/:id')
  show(ctx: Context) {
    const id = ctx.req.param('id');
    return this.users.findById(Number(id));
  }

  @Post('/')
  async create(ctx: Context) {
    const body = await ctx.req.json() as CreateUserDto;
    return this.users.create(body);
  }
}
```

See the [migration guide](./docs/design/standard-decorators-migration.md) for details.

---

## Install

```bash
# Scaffold a new project
bunx create-nexusts my-app
cd my-app
bun install
bun run dev
```

Or use bun:

```bash
bun create nexusts my-app
```

### Manual setup in an existing project

```bash
bun add @nexusts/core zod hono
bunx @nexusts/core init
```

Add the modules you need:

```bash
# Core stack — pick one or more
bun add @nexusts/drizzle            # the default ORM
bun add @nexusts/kysely            # typed SQL query builder (alternative)
bun add @nexusts/auth               # authentication (better-auth)
bun add @nexusts/queue              # background jobs
bun add @nexusts/session            # cookie/memory/drizzle sessions
bun add @nexusts/grpc               # gRPC server + typed client (v0.5+)
bun add @nexusts/graphql            # GraphQL endpoint (SDL + code-first)
bun add @nexusts/resilience         # retry/circuit/bulkhead + HTTP admin

# DX + observability
bun add @nexusts/openapi            # OpenAPI docs
bun add @nexusts/tracing            # OpenTelemetry
bun add @nexusts/metrics            # Prometheus
```

Every module is its own bundle entry point — install only what you
use. The CLI (`nx`) is included with `@nexusts/core`.

For GraphQL, the `graphql` package is an optional peer-dep that
you install once with `bun add graphql`. The first attempt to use
the service without it throws a clear error.

---

## Quick start

A minimal app with the **default ORM (Drizzle)** and the most
common modules:

```ts
// app/app.module.ts
import { Module } from '@nexusts/core';
import { DrizzleModule } from '@nexusts/drizzle';
import { ConfigModule } from '@nexusts/config';
import { LoggerModule } from '@nexusts/logger';
import { HealthModule } from '@nexusts/health';
import { LimiterModule } from '@nexusts/limiter';
import { SessionModule } from '@nexusts/session';
import { CacheModule } from '@nexusts/cache';
import { DriveModule } from '@nexusts/drive';
import { MailModule } from '@nexusts/mail';
import { ShieldModule } from '@nexusts/shield';
import { AuthModule } from '@nexusts/auth';
import { OpenAPIModule } from '@nexusts/openapi';
import { UploadModule } from '@nexusts/upload';
import { TracingModule } from '@nexusts/tracing';
import { MetricsModule } from '@nexusts/metrics';
import { ResilienceModule } from '@nexusts/resilience';
import { GraphQLModule } from '@nexusts/graphql';
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
    ResilienceModule.forRoot(),
    GraphQLModule.forRoot({
      typeDefs: 'type Query { hello: String! }',
      resolvers: { Query: { hello: () => "world" } },
    }),
    UserModule,
  ],
})
export class AppModule {}
```

```ts
// app/main.ts
import { Application } from '@nexusts/core';
import { AppModule } from './app.module.js';

const app = new Application(AppModule);
await app.listen(3000);
```

```ts
// app/modules/user/user.module.ts
import { Module } from '@nexusts/core';
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
// app/modules/user/user.service.ts
import { Inject, Injectable } from '@nexusts/core';
import { DrizzleService } from '@nexusts/drizzle';
import { eq } from 'drizzle-orm';
import { users } from '../../db/schema.js';

@Injectable()
export class UserService {
  @Inject(DrizzleService.TOKEN) declare db: DrizzleService;

  findAll() { return this.db.select().from(users).all(); }
  findById(id: number) { return this.db.select().from(users).where(eq(users.id, id)).get(); }
  async create(email: string) {
    return (await this.db.insert(users).values({ email }).returning())[0];
  }
}
```

```ts
// app/modules/user/user.controller.ts
import { z } from 'zod';
import { Controller, Delete, Get, Inject, Post } from '@nexusts/core';
import { UserService } from './user.service.js';
import type { Context } from 'hono';

const CreateUserSchema = z.object({
  email: z.string().email(),
});

@Controller('/users')
export class UserController {
  @Inject(UserService) declare users: UserService;

  @Get('/')        async index() { return this.users.findAll(); }
  @Get('/:id')     async show(ctx: Context) {
    const id = Number(ctx.req.param('id'));
    return this.users.findById(id);
  }
  @Post('/')       async create(ctx: Context) {
    const body = CreateUserSchema.parse(await ctx.req.json());
    return this.users.create(body.email);
  }
  @Delete('/:id')  async destroy(ctx: Context) {
    const id = Number(ctx.req.param('id'));
    // ...
  }
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

$ curl -X POST http://localhost:3000/graphql \
       -H "Content-Type: application/json" \
       -d '{"query":"{ hello }"}'
{"data":{"hello":"world"}}
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

# Create a new app from the CLI scaffolder
bunx create-nexusts my-app
```

See [docs/user-guide/drizzle.md](./docs/user-guide/drizzle.md) for the
full Drizzle integration guide.

---

## Three routing styles

### 1. Nest style (class decorators)

```ts
@Controller('/users')
class UserController {
  @Inject(UserService) declare users: UserService;

  @Get('/')        async list(ctx: Context) { return this.users.findAll(); }
  @Get('/:id')     async show(ctx: Context) {
    const id = Number(ctx.req.param('id'));
    return this.users.findById(id);
  }
  @Post('/')       async create(ctx: Context) {
    const body = await ctx.req.json();
    return this.users.create(body);
  }
  @Put('/:id')     async update(ctx: Context) {
    const id = Number(ctx.req.param('id'));
    const body = await ctx.req.json();
    return this.users.update(id, body);
  }
  @Delete('/:id')  async destroy(ctx: Context) {
    const id = Number(ctx.req.param('id'));
    return this.users.delete(id);
  }
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

## Parameter decorators *(Legacy — v0.8 and earlier)*

These classic NestJS-style parameter decorators continue to work in legacy mode (`experimentalDecorators: true`).

| Decorator    | Reads                                         | Standard replacement |
| ------------ | --------------------------------------------- | --------------------- |
| `@Body(key?)`| Parsed request body (JSON / form / multipart) | `await ctx.req.json()` |
| `@Query(k?)` | URL query string                              | `ctx.req.query(k)` |
| `@Param(k?)` | Path parameters                               | `ctx.req.param(k)` |
| `@Headers(k?)`| Request headers                              | `ctx.req.header(k)` |
| `@Req()` / `@Ctx()` | Hono context                        | `ctx` parameter directly |
| `@Res()`     | Hono response                                 | `ctx.res` |
| `@Next()`    | next() callback (for middleware-style)       | N/A |
| `@User()`    | Authenticated user (set by auth middleware)   | `ctx.var.user` |
| `@Session()`  | Cookie session (legacy, `experimentalDecorators`) | `ctx.session` (standard mode) |

With standard decorators, the controller method receives `ctx: Context` (Hono context) directly and accesses request data through it:

```ts
// Standard decorator mode (v0.9+)
@Get('/:id')
show(ctx: Context) {
  const id   = ctx.req.param('id');       // was @Param('id')
  const name = ctx.req.query('name');     // was @Query('name')
  const body = await ctx.req.json();      // was @Body()
}
```

For input sanitization, wrap the value with `inputValue()`:

```ts
import { inputValue } from '@nexusts/core';

const id = inputValue(ctx.req.param('id')).number().required().value();
```

---

## Validation with Zod

In standard decorator mode, validate directly with `schema.parse()`:

```ts
const CreateUserSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
});

@Post('/')
async create(ctx: Context) {
  const body = CreateUserSchema.parse(await ctx.req.json());
  return this.users.create(body);
}
```

For legacy mode (`experimentalDecorators: true`), use `@Validate`:

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

NexusTS supports two DI patterns:

### 1. Field injection *(standard decorators, v0.9+)*

```ts
@Injectable()
class UserService {
  @Inject('DB') declare db: DrizzleLike;
}

@Injectable()
class UserRepository {
  @Inject('DB') declare db: DrizzleLike;
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

The `@Inject(Token) declare field: Type` pattern works with TC39 standard decorators — no `experimentalDecorators` or `reflect-metadata` required.

### 2. Constructor injection *(legacy, v0.8 and earlier)*

```ts
@Injectable()
class UserService {
  constructor(@Inject('DB') private db: DrizzleLike) {}
}
```

Constructor injection requires `experimentalDecorators: true` and an explicit `@Inject()` token for each parameter (Bun's native TS transformer doesn't emit `design:paramtypes`).

> **Note:** If you build with `tsc` first and run with `node`, you can omit `@Inject()` when the type is a class — `design:paramtypes` is emitted by `tsc`. With Bun's native transformer, always use explicit `@Inject(Token)` or field injection.

---

## Resilience: retry, circuit breaker, bulkhead

`@nexusts/resilience` ships the three classic
distributed-systems primitives in a single DI singleton with
**zero new dependencies**.

```ts
import {
  ResilienceModule, ResilienceService,
  retry, CircuitBreaker, Bulkhead,
  CircuitOpenError, BulkheadFullError,
} from '@nexusts/resilience';

@Module({ imports: [ResilienceModule.forRoot()], /* ... */ })
class AppModule {}

class OrderService {
  @Inject(ResilienceService.TOKEN) declare r: ResilienceService;

  // Plain-function retry. 3 attempts, exponential-jitter backoff.
  charge(order: Order) {
    return this.r.retry(() => stripe.charge(order), {
      attempts: 3, backoff: 'exponential-jitter',
    });
  }

  // Shared named circuit. Every code path that calls Stripe uses the
  // same instance — one outage opens it for all callers.
  refund(order: Order) {
    const cb = this.r.getOrCreateCircuit('stripe', {
      threshold: 0.5, timeout: 30_000,
    });
    return cb.execute(() => stripe.refund(order));
  }

  // Limit concurrency for the slow dependency.
  heavyReport() {
    const bh = this.r.getOrCreateBulkhead('analytics', { maxConcurrent: 5 });
    return bh.execute(() => analytics.run(...));
  }
}
```

The framework also exports `@Retry` / `@CircuitBreaker` /
`@Bulkhead` / `@Resilient` method decorators (metadata-only;
eager wrapping is reserved for v0.8). See
[`docs/user-guide/resilience.md`](./docs/user-guide/resilience.md) for
the full reference.

---

## GraphQL

`@nexusts/graphql` adds a `POST/GET /graphql` endpoint with
an in-bundle GraphiQL playground. SDL-first, optional
peer-dep `graphql`.

```bash
bun add graphql        # the only peer-dep
```

```ts
import { GraphQLModule, GraphQLService } from '@nexusts/graphql';

@Module({
  imports: [
    GraphQLModule.forRoot({
      typeDefs: `
        type Query {
          hello(name: String!): String!
          whoami: String!
        }
      `,
      resolvers: {
        Query: {
          hello: (_p, args) => `Hello, ${args.name}!`,
          whoami: (_p, _a, ctx) => ctx.state.user,
        },
      },
      context: () => ({ user: 'alice' }),
    }),
  ],
})
class AppModule {}

const app = new Application(AppModule);
const g = app.container.resolve(GraphQLService) as GraphQLService;
await GraphQLModule.mount(app.server.app, g);
await app.listen(3000);
```

```bash
$ curl -X POST http://localhost:3000/graphql \
       -H "Content-Type: application/json" \
       -d '{"query":"{ hello(name: \"world\") }"}'
{"data":{"hello":"Hello, world!"}}
```

Code-first via `@Resolver` / `@Query` / `@Mutation` decorators is
exported but the SDL synthesis is alpha — the recommendation today
is to write SDL. See
[`docs/user-guide/graphql.md`](./docs/user-guide/graphql.md) for the
full reference.

---

## gRPC *(v0.5)*

`@nexusts/grpc` ships a reflection-based gRPC server + typed
client. No codegen — `.proto` files are loaded at runtime via
`@grpc/proto-loader`. Unary methods only in v1; streaming
(server / client / bidi) is on the v2 roadmap.

```ts
import { GrpcModule, GrpcService, GrpcMethod } from '@nexusts/grpc';

@Injectable()
@GrpcService('GreeterService', { protoFile: './proto/greeter.proto' })
class GreeterService {
  @GrpcMethod('SayHello')
  sayHello(request: { name: string }) {
    return { message: `Hello, ${request.name}!` };
  }
}

@Module({
  imports: [GrpcModule.forRoot({
    host: '0.0.0.0', port: 50051,
    services: [GreeterService],
  })],
})
class AppModule {}
```

See [`docs/user-guide/grpc.md`](./docs/user-guide/grpc.md) for the full
reference.

---

## WebSockets *(v0.5)*

`@nexusts/ws` ships WebSockets on Bun (primary) and Node (via
`ws`). Runtime auto-detected.

```ts
import { WebSocketService, WebSocketGateway, OnWebSocketMessage, OnWebSocketOpen, OnWebSocketClose } from '@nexusts/ws';

@Injectable()
@WebSocketGateway('/chat')
class ChatGateway {
  @Inject(WebSocketService) declare ws: WebSocketService;

  @OnWebSocketOpen() onOpen(socket: any) { /* ... */ }

  @OnWebSocketMessage('message')
  onMessage(socket: any, payload: { user: string; text: string }) {
    this.ws.broadcast('/chat', 'message', { ...payload, ts: Date.now() });
  }

  @OnWebSocketClose() onClose(socket: any) { /* ... */ }
}
```

See [`docs/user-guide/ws.md`](./docs/user-guide/ws.md) for rooms, broadcast,
and broadcast-to-room.

---

## Server-Sent Events *(v0.4)*

`@nexusts/sse` wraps Hono's `streamSSE` behind a type-safe
`SseStream` with auto-serialization, idempotent `close()`, and
`Last-Event-ID` reconnection support.

```ts
import { sse } from '@nexusts/sse';

@Controller('/events')
class EventController {
  @Get('/timeseries')
  timeseries(c: any) {
    return sse(c, async (stream) => {
      let n = 0;
      const id = setInterval(() => {
        n += 1;
        stream.send({ event: 'tick', data: { n, ts: Date.now() } });
      }, 1000);
      stream.onAbort(() => clearInterval(id));
    });
  }
}
```

---

## Inertia.js adapter

Single-page-app UX without writing an API. The framework ships a
server-side [Inertia.js v3/v3 protocol](https://inertiajs.com/the-protocol)
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
  @Inject(Inertia.TOKEN) declare inertia: Inertia;

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

### SSR (React / Vue / Svelte / Solid)

```ts
import { createReactAdapter, ComponentRegistry } from '@nexusts/view/inertia/ssr';

const components = new ComponentRegistry()
  .register('Home', HomePage)
  .register('Users/Index', UsersIndexPage);

app.inertia.setSsrAdapter(createReactAdapter({ components }));
```

Without an adapter the framework falls back to a minimal HTML shell —
the client hydrates from `data-page` after JS loads. (This is the
recommended starting point.)

Working examples under `examples/28-31` show React + Vue, SPA + SSR.
`bun add @inertiajs/react` and `bun build` once, then run.

### Forms (`<Form>` server-side helper)

Inertia v3's `<Form>` component pairs with this server-side helper to
keep form submissions out of the controller's hot path. The pattern
is the classic **Post/Redirect/Get**:

```ts
import { z } from 'zod';
import { Controller, Post } from '@nexusts/core';
import { Inertia } from '@nexusts/view/inertia';

const UserSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
});

@Controller('/users')
class UserController {
  @Inject(Inertia.TOKEN) declare inertia: Inertia;

  @Post('/')
  async store(ctx: Context) {
    const input = await ctx.req.json() as Record<string, any>;
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

---

## View engine — `@nexusts/view`

The view engine is available as `@nexusts/view` — its own bundle
entry point. It ships three adapters:

| Adapter | Extension | Style | Runtime support |
|---------|-----------|-------|----------------|
| **Rendu** (default) | `.html`, `.rendu` | PHP-style `<?= expr ?>` | Bun / Node / Cloudflare Workers |
| **Edge** | `.edge` | Mustache-style `{{ expr }}` | Bun / Node |
| **Eta** | `.eta` | EJS-style `<%= expr %>` | Bun / Node /  Workers |

### Auto-detection by file extension

When you return `{ view: 'about.html', data }` from a controller, the
framework picks the right adapter based on the file extension:

- `.html` / `.rendu` → RenduAdapter
- `.edge` → EdgeAdapter
- `.eta` → EtaAdapter

### File-based views

The Application auto-loads `viewPaths` from `nx.config.ts` at boot
via `Application.tryLoadNxConfig()`, so no explicit call is needed:

```ts
// nx.config.ts — all you need
export default {
  view: 'rendu',
  viewPaths: 'resources/views',
};
```

Then controllers reference view files directly:

```ts
@Get('/')
index() {
  return {
    view: 'welcome.html',
    data: { year: new Date().getFullYear() },
  };
}
```

### Override the adapter at runtime

```ts
app.setViewAdapter(new EdgeAdapter());
```

Or implement the `ViewAdapter` interface for a custom engine.

### Inline templates (no file system)

When `viewPaths` is empty (the default), the `view` value is treated
as an inline Rendu template:

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

The `PORT` env var is read by default — use `process.env.PORT ?? 3000`
in your `main.ts` for portability.

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
│   ├── view/               # Rendu / Edge / Inertia adapters (v0.6+)
│   │   └── inertia/         # Inertia v3 protocol + SSR adapters
│   └── runtime/            # Bun / Node / Cloudflare Workers adapters
├── cli/                    # `nx` command runner (optional bundle)
│   ├── commands/           # new, init, make:*, migrate, info, db:*
│   ├── templates/          # mustache-lite scaffolds
│   └── core/               # arg parser, prompts, fs helpers
├── auth/                   # better-auth wrapper
├── queue/                  # BullMQ / Cloudflare / memory
├── schedule/               # custom cron parser
├── events/                 # typed emitter
├── session/                # cookie / memory / drizzle backends
├── health/                 # live/ready/startup + indicators
├── config/                 # Zod-validated env config
├── logger/                 # Pino transports
├── static/                 # file serving
├── limiter/                # rate limiting
├── shield/                 # CSRF + security headers
├── cache/                  # LRU + drizzle
├── drive/                  # storage abstraction (Local / S3 / R2 / memory)
├── mail/                   # SMTP / File / Null
├── drizzle/                # default ORM
├── openapi/                # OpenAPI 3.1 + Scalar UI
├── upload/                 # multipart file upload
├── sse/                    # Server-Sent Events
├── tracing/                # OpenTelemetry
├── metrics/                # Prometheus / OpenMetrics
├── ws/                     # WebSockets
├── crypto/                 # AES-256-GCM + HMAC + scrypt/argon2
├── i18n/                   # locale-aware translations
├── redis/                  # runtime-aware Redis client
├── grpc/                   # reflection-based gRPC server + client
├── graphql/                # SDL + code-first GraphQL
└── resilience/             # retry / circuit / bulkhead + HTTP admin
```

### Examples

```
examples/                                  # 36 working examples
├── 01-basic-mvc/                          # one per module
├── 02-routing-styles/
├── 03-drizzle-crud/
├── 04-session-auth/
├── 05-openapi/
├── 06-rendu-views/
├── ...
├── 28-inertia-react-spa/                  # Inertia v3 — React, client-side
├── 29-inertia-react-ssr/                  # Inertia v3 — React, server-side
├── 30-inertia-vue-spa/                    # Inertia v3 — Vue 3, client-side
├── 31-inertia-vue-ssr/                    # Inertia v3 — Vue 3, server-side
├── 32-graphql-hello/                      # GraphQL endpoint
├── 33-resilience-calls/                  # retry / circuit / bulkhead
├── 34-grpc-streaming/                    # gRPC streaming
├── 35-standard-decorators/               # Standard decorator mode
└── 36-kysely-crud/                      # Kysely typed SQL query builder
```

Every example is runnable as `cd examples/NN-name && bun main.ts`.
The smoke test suite (`bun x vitest run tests/examples/`) boots
each one in a subprocess, watches for a "listening" log line, and
verifies a clean exit. 70 tests in ~2 seconds.

---

## Roadmap

The framework follows [Semantic Versioning](https://semver.org/).
Until v1.0, minor version bumps may include breaking changes. After
v1.0, only major bumps will.

### Shipped

- **v0.1** (2026-04-30) — MVC core, DI, validation, Rendu / Edge / Inertia adapters, CLI bootstrap.
- **v0.2** (2026-05-15) — `@nexusts/auth`, `@nexusts/queue`, `@nexusts/schedule`, `@nexusts/events`, `@nexusts/session`, full `nx` CLI.
- **v0.3** (2026-06-21) — production basics, cross-cutting features, `@nexusts/drizzle` as the default ORM.
- **v0.4** (2026-06-22) — observability + DX: `@nexusts/openapi`, `@nexusts/upload`, `@nexusts/sse`, `@nexusts/tracing`, `@nexusts/metrics`, request-scoped DI in core.
- **v0.5** (2026-06-22) — realtime + crypto + i18n + redis: `@nexusts/ws`, `@nexusts/crypto`, `@nexusts/i18n`, `@nexusts/redis`.
- **v0.6** (2026-06-22) — gRPC + tooling: `@nexusts/grpc` (reflection-based server + typed client) and a publishable `dist/` pipeline (`bin` field, `dist/src/*` flatten).
- **v0.6.1** (2026-06-22) — patch: `nexus` → `@nexusts/core` rename across all sources (191 files), `bin` field fix, `dist/src/*` flatten, docs in sync with the published name. No new features.
- **v0.6.3** (2026-06-22) — view engine extracted to `@nexusts/view`, Eta adapter, file-based view paths, auto-detection by extension.
- **v0.6.4** (2026-06-22) — default view engine to Rendu, CLI view options include eta, Application auto-loads viewPaths from `nx.config.ts`, static file path fix, scaffold deduplication.
- **v0.6.5** (2026-06-22) — env-aware config (`.env.{NODE_ENV}`), `nx db:generate`, built-in `sessionMiddleware()`, scaffold generates `.env`/`.env.local`/`.gitignore`, drizzle model import fix, `make:crud` repository fix.
- **v0.6.6** (2026-06-22) — package renamed to `@nexusts/core`, `router.getRoutes()` for OpenAPI spec generation.
- **v0.6.7** (2026-06-22) — `create-nexusts` scaffolder published as a separate npm package; 27 working examples under `examples/`.
- **v0.6.8** (2026-06-22) — smoke test suite (`tests/examples/smoke.test.ts`) with 55 vitest tests, 67 examples by v0.6.8.
- **v0.7.0** (2026-06-22) — **GraphQL** (`@nexusts/graphql`) and **Resilience** (`@nexusts/resilience`, retry + circuit + bulkhead).
- **v0.7.3** (2026-06-23) — Exception Filters, Interceptors, Guards, Lifecycle Hooks, `@Global()` decorator.
- **v0.7.4** (2026-06-24) — REPL improvements (`.services`/`.modules`/`.routes`), Logger pino direct dep, Schedule hot-reload.
- **v0.7.5** (2026-06-24) — Circuit breaker admin API (`metrics`, `forceOpen`/`forceClose`), `make:repository` CLI command.
- **v0.7.6** (2026-06-24) — Global `@Resolver` registry, code-first GraphQL SDL synthesis (`autoSchema: true`).
- **v0.7.7** (2026-06-24) — GraphQL code-first SDL synthesis enhancements.
- **v0.7.8** (2026-06-24) — Repository migration to `nexus-ts/nexusts`.
- **v0.7.9** (2026-06-24) — Bun decorator diagnostics, GitHub repo metadata.
- **v0.8.0** (2026-06-24) — `ResilienceAdminModule` (HTTP admin endpoints), eager `applyResilience()` auto-wrap, CORS in ShieldModule. **31 modules.**
- **v0.8.1** (2026-06-24) — Cross-pod circuit breaker store: `RedisResilienceStore`, `DrizzleResilienceStore`, `MemoryResilienceStore`. Configurable `syncIntervalMs`, last-writer-wins conflict resolution.
- **v0.8.2** (2026-06-24) — gRPC streaming v2: `@GrpcServerStream`, `@GrpcClientStream`, `@GrpcBidiStream`. Multi-runtime CI (Bun 22 + Cloudflare Workers + Drizzle dialects). HTTP benchmark suite with auto-regression check.
- **v0.8.3** (2026-06-25) — Static analysis CI (Biome lint + tsc typecheck). **32 modules**: `@nexusts/feature-flag` (canary / A–B testing, rollout %, allowlist/denylist), `@nexusts/cache` Redis backend, `@nexusts/drizzle` seeding `Factory<T>`.
- **v0.8.4** (2026-06-25) — Inertia v3 scaffold (React/Vue SSR with `nx init`/`nx new`), CLI input validation & `--no-interaction` fix, `InertiaConfig.scripts` for client script injection, scaffold deduplication to `scaffold.ts`. `@inertiajs/react`/`@inertiajs/vue3` `^3.0.0`.
- **v0.9.0** (2026-06-25) — **Standard decorator migration.** Migrate from legacy `experimentalDecorators` to TC39 standard ES decorators. Remove `reflect-metadata` dependency (~16KB savings). Field injection (`@Inject(Token) declare field: Type`) instead of constructor injection. `ctx.req.*` methods instead of `@Param`/`@Body`/`@Query` parameter decorators. Dual-mode backward compatibility with legacy decorator code. See [migration guide](./docs/design/standard-decorators-migration.md).
- **v0.9.5** (2026-06-25) — **Kysely first-party module.** `@nexusts/kysely`
- **v0.9.6** (2026-06-26) — **Reflect polyfill + SSE/WS fixes.** Inline
  Reflect Metadata polyfill (no npm package needed). WebSocket decorators
  dual-mode (`@WebSocketGateway`, `@OnWebSocket*`). SSE `onAbort()` alias.
  WS client ID persistence fix. `bunAdapter` WebSocket env fix. with `KyselyService`, `KyselyRepository` (Lucid-style), `KyselyModule.forRoot()`, built-in Migrator. CLI integration: `nx db:generate`/`db:migrate --orm kysely`, `make:crud`/`make:model`/`make:migration` Kysely templates. `BunSqliteDialect` for bun:sqlite. **33 modules.** Prisma removed from CLI options.
- **v0.9.14** (2026-06-29) — **Experimental notice + analysis docs + lint cleanup.**
  Experimental banner on all 34 package READMEs. Comprehensive
  NestJS/AdonisJS analysis reports. Biome lint cleanup. Drizzle
  `@ts-ignore` compatibility fix.
- **v0.9.13** (2026-06-27) — **CLI prompt refinement + `nx init` runtime flag.**
  "Database driver" → "Database" across all CLI commands. `nx init` now
  accepts `--runtime bun|cloudflare` to specify the target runtime when
  scaffolding a new project.

### Planned

- **v1.0** — stable public API surface with semver guarantees, long-term LTS support plan.

Detailed release notes for every version live in
[`CHANGELOG.md`](./CHANGELOG.md).

## License

[MIT](./LICENSE) — Copyright © 2026 NexusTS Contributors.

The framework is released under the permissive MIT License. You can
use it in commercial and non-commercial projects, modify the source,
and distribute derivative works — as long as you preserve the
copyright notice and the license text. See the [LICENSE](./LICENSE)
file for the full text.

### Third-party notices

NexusTS depends on several open-source projects. Their licenses are
reproduced at install time via `bun install` (and `bun add`).
Notable runtime dependencies:

- **Hono** — MIT (web framework)
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
- **graphql** — MIT (peer-dep for `@nexusts/graphql`)
