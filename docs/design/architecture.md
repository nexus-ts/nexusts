# Architecture Overview

> Last updated: v0.6.1 (gRPC + build pipeline)
> 한국어 버전: [`architecture.ko.md`](./architecture.ko.md)

## 1. Goals

NexusTS is a **Bun-native fullstack framework** designed around four
guiding principles:

1. **Multi-runtime** — the same code runs on Bun, Cloudflare Workers, and
   Cloudflare Workers.
2. **Multi-paradigm** — the same app can mix Nest-style class decorators,
   Adonis-style route tables, and Hono-style functional handlers.
3. **Multi-renderer** — Rendu, Edge, and Inertia adapters are
   first-class citizens; SSR adapters for React, Vue, Svelte, and Solid
   plug in without forking the request pipeline.
4. **Edge-first** — every adapter is designed to fit inside a Workers
   request budget. No blocking I/O on the hot path.

In v0.6.1 the framework has grown to **26 independent modules** —
each a separate bundle entry point. The user picks only what they
need; the core stays small.

---

## 2. Layer diagram (v0.7)

```
┌──────────────────────────────────────────────────────────────┐
│                       Application                            │
│   (root module, container, server, inertia, view adapter)    │
├──────────────────────────────────────────────────────────────┤
│                       User code                              │
│   Modules · Controllers · Services · Repositories · DTOs     │
├──────────────────────────────────────────────────────────────┤
│                  Optional Modules (v0.7)                    │
│  ┌────────────┐ ┌────────────┐ ┌────────────┐ ┌────────────┐  │
│  │ auth      │ │ queue      │ │ schedule   │ │ events     │  │
│  │ session   │ │ health     │ │ config     │ │ logger     │  │
│  │ static    │ │ limiter    │ │ shield     │ │ cache      │  │
│  │ drive     │ │ mail       │ │            │ │            │  │
│  └────────────┘ └────────────┘ └────────────┘ └────────────┘  │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │ drizzle (default ORM — postgres/mysql/sqlite/d1)         │ │
│  └─────────────────────────────────────────────────────────┘ │
├──────────────────────────────────────────────────────────────┤
│                      Core (framework)                        │
│  ┌────────┐ ┌────────┐ ┌────────────┐ ┌─────────────────────────┐  │
│  │  DI    │ │  HTTP  │ │ Validation │ │  Guards / Filters /     │  │
│  │container│ │server │ │ (Zod)      │ │  Interceptors / Lifecycle│  │
│  │scanner │ │router │ │            │ │  Hooks                  │  │
│  └────────┘ └────────┘ └────────────┘ └─────────────────────────┘  │
│  ┌────────┐ ┌────────┐ ┌──────────────────────────────────────┐ │
│  │Runtime │ │  CLI   │ │           Decorators                 │ │
│  │Bun/Node│ │ nx ... │ │ @Controller @Injectable @Module      │ │
│  │Cloudfl.│ │        │ │ @Get/Post @Validate                │ │
│  │        │ │        │ │ @UseGuards @UseInterceptors          │ │
│  │        │ │        │ │ @UseFilters @Global()                │ │
│  └────────┘ └────────┘ └──────────────────────────────────────┘ │
├──────────────────────────────────────────────────────────────┤
│                   Platform adapters                          │
│            Hono · Drizzle · Zod · Pino · BullMQ             │
└──────────────────────────────────────────────────────────────┘
```

Every user-facing surface is implemented **above** the platform adapters
so the framework can swap them out (e.g., between Drizzle and Kysely)
without changing application code.

---

## 3. Module tree

A NexusTS app is a tree of `@Module` nodes. The root module is passed
to `new Application(...)`; the scanner walks the imports graph and
builds one `ApplicationContainer` per module:

```
RootModule
 ├── UserModule
 │    ├── UserController
 │    ├── UserService       (provider)
 │    ├── UserRepository    (provider)
 │    └── { provide: 'DB', useValue: drizzleInstance }
 ├── OrderModule
 │    ├── OrderController
 │    ├── OrderService
 │    └── StripeService     (provider)
 └── { provide: Inertia.TOKEN, useValue: appInertia }   ← registered by Application
```

Each module's container is **isolated** — providers are resolved within
their declaring module unless they are re-exported via `exports: [...]`.

> **Why per-module containers?** Modules are the unit of encapsulation
> in Nest/Adonis. Treating them as separate sub-containers lets the
> framework refuse to inject private providers and keeps the dependency
> graph auditable.

See [`di-container.md`](./di-container.md) for the full design.

---

## 4. Request lifecycle

A single HTTP request flows through the framework as follows:

```
Hono fetch event
      │
      ▼
┌────────────────────────────────────────────────────────────┐
│ 1. Runtime adapter (Bun / Node / Cloudflare)               │
│    Normalizes the request into a Hono Context.             │
└────────────────────────────────────────────────────────────┘
      │
      ▼
┌────────────────────────────────────────────────────────────┐
│ 2. Global middleware                                       │
│    requestScope → logger → errorHandler → cors → ...       │
└────────────────────────────────────────────────────────────┘
      │
      ▼
┌────────────────────────────────────────────────────────────┐
│ 3. Router + Guards                                         │
│    - Route matching (Nest / Adonis / Functional styles)     │
│    - Guard execution (@UseGuards)                          │
│    - Returns 403 Forbidden if any guard denies             │
└────────────────────────────────────────────────────────────┘
      │
      ▼
┌────────────────────────────────────────────────────────────┐
│ 4. Interceptors (onion chain)                              │
│    - LoggingInterceptor, TimeoutInterceptor, custom        │
│    - Controller-level wraps outermost, route-level inside   │
└────────────────────────────────────────────────────────────┘
      │
      ▼
┌────────────────────────────────────────────────────────────┐
│ 5. Parameter extraction (legacy) / ctx injection (standard) │
│    Legacy: @Body / @Query / @Param / @Headers / @Req / ... │
│    Standard: controller receives ctx: Context directly      │
└────────────────────────────────────────────────────────────┘
      │
      ▼
┌────────────────────────────────────────────────────────────┐
│ 6. Validation                                              │
│    @Validate({ body, query, params })  ← Zod schemas       │
└────────────────────────────────────────────────────────────┘
      │
      ▼
┌────────────────────────────────────────────────────────────┐
│ 7. Controller method invocation                            │
│    Dependencies injected from the owning module's          │
│    container.                                              │
└────────────────────────────────────────────────────────────┘
      │
      ▼
┌────────────────────────────────────────────────────────────┐
│ 8. Exception Filters (catch errors from handler)           │
│    Route-level → Controller-level → Default filter         │
│    Serializes HttpException or wraps as 500                │
└────────────────────────────────────────────────────────────┘
      │
      ▼
┌────────────────────────────────────────────────────────────┐
│ 9. Response serialization                                  │
│    - Plain JSON                                            │
│    - View (Rendu / Edge)                                   │
│    - InertiaResponse → HTML shell (first load) or JSON     │
│      (XHR)                                                 │
└────────────────────────────────────────────────────────────┘
      │
      ▼
   Hono Response
```

Each step is implemented as a separate module so a user can replace
any of them (e.g., swap the logger for pino, swap the validator for
class-validator) without forking the rest.

---

## 5. Routing: three styles, one router

The router in `src/core/http/router.ts` exposes three registration APIs
backed by a single internal route table:

| Style | API | Use case |
| ----- | --- | -------- |
| **Nest** | `@Controller('/users')` + `@Get('/')` | Class-based services, large teams |
| **Adonis** | `router.add('GET', '/users', Ctrl, 'list')` | Quick CRUD, route table legibility |
| **Functional** | `router.raw('GET', '/health', handler)` | Edge handlers, webhooks, escape hatch |

The router stores routes as `{ method, path, handlers, kind, meta }`
records and compiles them into a Hono app on `start()`. The first match
wins; ties are resolved by specificity (literal segments before
parameters before wildcards).

---

## 6. The Inertia adapter

The Inertia adapter is **a special response type**, not a separate
framework. A controller returns `inertia.render('Users/Index', { users })`
which produces an `InertiaResponse` object carrying a discriminator
tag. The router inspects the tag and:

- On first-page loads (no `X-Inertia` header) → emits an HTML shell
  with `data-page` JSON embedded; the client hydrates from there.
- On XHR visits (`X-Inertia: true`) → emits a JSON page object.
- On asset version mismatch → 409 with `X-Inertia-Location`.

The adapter also implements Inertia v3's lazy-resolution protocol
(`defer`, `always`, `optional`, `merge`, `deepMerge`, `once`, `lazy`),
asset versioning, shared props, server-side rendering, and a
`<Form>` server-side helper that owns the
Post/Redirect/Get flow.

See [`inertia-adapter.md`](./inertia-adapter.md) for the full design.

---

## 7. Runtime adapters

The runtime adapter layer normalizes three very different execution
models behind a single `NexusServer.start()` API:

| Runtime | Adapter file | What it owns |
| ------- | ------------ | ------------ |
| **Bun** | `src/core/runtime/bun.ts` | `Bun.serve` lifecycle, port binding |
| **Node** | `src/core/runtime/node.ts` | `node:http` server, `process` signals |
| **Cloudflare Workers** | `src/core/runtime/cloudflare.ts` | `fetch` handler export |

The application auto-detects the runtime via `globalThis` symbols and
picks the right adapter at `start()`. For Workers, `app.fetch` is the
export; for Bun/Node, `app.listen(port)` is.

---

## 8. Extensibility surface

The framework deliberately exposes **sub-path imports** so advanced
users can swap internals without forking:

| Sub-path | Purpose |
| -------- | ------- |
| `@nexusts/view` | View engines (default `RenduAdapter`) |
| `@nexusts/view/inertia` | Inertia adapter + helpers |
| `@nexusts/view/inertia/ssr` | React/Vue/Svelte/Solid SSR adapters |
| `@nexusts/orm` | ORM adapters (Drizzle today) |
| `@nexusts/runtime` | Runtime adapters |

The public entry point (`@nexusts/core`) only re-exports the stable, agreed-on
surface. Anything else is **advanced** and may change without a major
version bump.

---

## 9. Modules shipped in v0.7

The framework ships **30 independent modules**. Each is its own bundle
entry point — install only what you need.

`@nexusts/core` now includes built-in **HTTP Guards**, **Interceptors**,
**Exception Filters**, **Lifecycle Hooks**, and **@Global()** decorator —
so you get NestJS-style AOP without installing extra packages.

| Module | Bundle subpath | Replaces / supersedes |
| ------ | -------------- | --------------------- |
| `@nexusts/core` | `@nexusts/core` | core MVC + DI + validation + views + guards + interceptors + filters + lifecycle hooks |
| `@nexusts/cli` | `nx` | Adonis ACE-style command runner |
| `@nexusts/auth` | `@nexusts/auth` | session, JWT, OAuth, passkey (better-auth) |
| `@nexusts/queue` | `@nexusts/queue` | BullMQ, Cloudflare Queues, memory |
| `@nexusts/schedule` | `@nexusts/schedule` | `@Cron` / `@Interval` / `@Timeout` |
| `@nexusts/events` | `@nexusts/events` | `@OnEvent` with wildcards, priorities, guards |
| `@nexusts/session` | `@nexusts/session` | cookie (HMAC), memory, Drizzle |
| `@nexusts/health` | `@nexusts/health` | liveness/readiness/startup, indicators |
| `@nexusts/config` | `@nexusts/config` | Zod-validated env config |
| `@nexusts/logger` | `@nexusts/logger` | Pino-backed structured logging |
| `@nexusts/static` | `@nexusts/static` | static file serving with ETag, Range |
| `@nexusts/limiter` | `@nexusts/limiter` | 3 strategies × memory/Drizzle storage |
| `@nexusts/shield` | `@nexusts/shield` | CSRF, HSTS, CSP, security headers |
| `@nexusts/cache` | `@nexusts/cache` | memory (LRU) / Drizzle, tag invalidation |
| `@nexusts/drive` | `@nexusts/drive` | memory/Local/S3/R2 storage abstraction |
| `@nexusts/mail` | `@nexusts/mail` | SMTP / File / Null, MJML |
| `@nexusts/drizzle` | `@nexusts/drizzle` | **default ORM** (5 dialects) |

### Drizzle as the data backbone

`@nexusts/drizzle` is the default ORM and is wired into every
DB-dependent module:

- `@nexusts/session` → `DrizzleSessionStorage`
- `@nexusts/health`  → `DrizzleHealthIndicator`
- `@nexusts/limiter` → `DrizzleRateLimitStorage`
- `@nexusts/cache`   → `DrizzleCacheStore`

A multi-pod deployment can share session, health, rate-limit, and
cache state through any Drizzle-compatible database.

---

## 10. What's planned for v0.6+

- **Observability**: `@nexusts/tracing` (OpenTelemetry), `@nexusts/metrics`
  (Prometheus).
- **i18n**: `@nexusts/i18n` for multi-locale messages.
- **AI agent module** + MCP server integration.
- **Stable public API** (semver guarantees).
- **Removal of v0.1 deprecated aliases**.

---

## 11. Standard decorator architecture (v0.9+)

NexusTS v0.9 migrated from legacy TypeScript decorators (`experimentalDecorators: true`) to **TC39 standard ES decorators**. This section explains the architecture.

### Dual-mode approach

Every decorator factory in the framework supports TWO calling conventions:

```ts
// Standard mode (TC39): receives (target, context)
@Module({...})  →  Module(options)(target, { kind: "class", metadata })

// Legacy mode: receives (target)
@Module({...})  →  Module(options)(target)
```

The decorator detects which mode it's in by checking `context?.kind`:

```ts
export function Module(options: ModuleOptions = {}): any {
  return function (this: any, target: any, context?: any): void {
    if (context?.kind === "class" && context?.metadata) {
      // Standard mode — store on context.metadata
      context.metadata[METADATA_KEY.MODULE] = options;
      // Copy to Class.__nexus_meta__ (Bun doesn't assign Symbol.metadata)
      initNexusMeta(target, context.metadata);
      return;
    }
    // Legacy mode — use safeDefineMeta (reflect-metadata or Map fallback)
    safeDefineMeta(METADATA_KEY.MODULE, options, target);
  };
}
```

### Metadata storage

| Storage | Used when | Requires |
|---------|-----------|----------|
| `Class.__nexus_meta__` | Standard decorator mode | Nothing extra |
| `Reflect.defineMetadata` | Legacy mode + reflect-metadata loaded | `import "reflect-metadata"` |
| Internal Map (`fallbackStore`) | Legacy mode + reflect-metadata NOT loaded | Nothing (framework built-in) |

### Field injection

The DI container supports TWO injection patterns:

```ts
// Standard mode (v0.9+): field injection
@Injectable()
class UserService {
  @Inject('DB') declare db: DrizzleLike;
}

// Legacy mode: constructor injection
@Injectable()
class UserService {
  constructor(@Inject('DB') private db: DrizzleLike) {}
}
```

When the container detects field injection (`getFieldInjections()` returns
non-empty), it creates the instance with `new Class()` (no args) and then
assigns injected fields. Otherwise it falls back to constructor resolution
via `design:paramtypes` or `@Inject` parameter metadata.

### InputValue chain

The `inputValue()` helper replaces parameter decorators for request data
access:

```ts
import { inputValue } from '@nexusts/core';

const id   = inputValue(ctx.req.param('id')).number().required().value();
const name = inputValue(ctx.req.query('name')).trim().max(100).value();
```

### Router auto-detection

The router detects standard decorator mode at mount time:

```ts
const isStandardMode = paramMeta.length === 0;
if (isStandardMode) {
  attachInputHelper(c);
  result = await finalHandler.call(instance, c);
} else {
  const args = await this.buildArgs(c, paramMeta, validation);
  result = await finalHandler.call(instance, ...args);
}
```

When a controller method has NO `@Param`/`@Body`/etc. parameter decorators,
the router passes the Hono Context directly and attaches the `CtxInput`
helper for convenient access to `ctx.req.*`, `ctx.uploadedFile()`, etc.

### Migration path

See the [migration guide](./standard-decorators-migration.md) for the
complete breakdown of which files changed and how to update existing code.
