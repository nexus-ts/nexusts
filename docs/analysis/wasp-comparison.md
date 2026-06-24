# NexusTS vs Wasp — Comparison

> 한국어 버전: [`wasp-comparison.ko.md`](./wasp-comparison.ko.md)
> 분석 일자: 2026-06-24 · 기준: NexusTS **v0.8.3**, Wasp **Launch Week #12 / TS Spec**

This document compares [NexusTS](https://github.com/nexus-ts/nexusts) v0.8.3
against [Wasp](https://wasp.sh) — both labelled "full-stack TypeScript
frameworks", but with **fundamentally different design philosophies** that
emerged from the same lesson: developers don't want to learn a new language
to ship a web app.

Wasp's June 2026 "Launch Week #12: MeTSamorphosis" announcement moved the
framework from its 5-year-old custom DSL (`.wasp` files) to a
**TypeScript-native spec** (`.wasp.ts`). On the surface, both frameworks
now look similar. Underneath, they answer the question "where does the
framework end and your code begin?" in opposite ways.

---

## 1. Summary table

| Category | Wasp (TS Spec) | NexusTS v0.8.3 |
| --- | --- | --- |
| **Paradigm** | Compiler-based — `main.wasp.ts` is **compiled** into a target app | Library-based — you `import { … } from '@nexusts/*'` |
| **Spec location** | One (or more) root-level `.wasp.ts` files | Anywhere in your project — every file is "user code" |
| **What the framework owns** | App shape: routes, pages, queries, actions, jobs, auth UI | Building blocks: DI, routing, validation, ORM, modules |
| **What you own** | All React/Node code referenced from the spec | Everything — controllers, services, schema, views |
| **Stack coupling** | Locked to React + Express + Prisma + (Vite for client) | Pick your view engine, ORM is optional, transport is Hono |
| **ORM** | Prisma only (schema.prisma) | `@nexusts/drizzle` (default) + any other ORM |
| **Frontend** | React + TanStack Query (built-in) | Any — Inertia.js + React/Vue, plain HTML, REST/SSE/WS, GraphQL |
| **Backend** | Express (one server) | Hono (single server) + SSE + WS + gRPC + GraphQL |
| **Auth** | Built-in full-stack (email, Google, GitHub, etc.) via `auth:` block | `@nexusts/auth` (better-auth) — bring your own UI |
| **Jobs** | Built-in async jobs (PgBoss scheduler) | `@nexusts/queue` (BullMQ / Cloudflare / memory) |
| **Email** | Built-in (`app.emailSender`) | `@nexusts/mail` (SMTP / File / Null) |
| **Deployment** | CLI-driven (`wasp deploy fly`, `wasp deploy aws`) | Bring your own Docker / Node / Bun |
| **TypeScript-first** | ✅ Yes (since June 2026) | ✅ Yes (always was) |
| **Custom language** | ❌ Removed in v0.24 (TS Spec) | ❌ Never had one |
| **Learning curve** | Low for "typical SaaS" / High for anything non-standard | Medium — must understand DI, modules, decorators |
| **Flexibility** | Low — fits the "Rails for JS" shape | High — any HTTP shape, any data model |
| **IDE / tooling** | ✅ Everything just works (TS Spec → standard TS) | ✅ Everything just works (decorator metadata via tsconfig) |

---

## 2. The fundamental design difference

### Wasp's approach: high-level spec, framework compiles your app

Wasp is a **compiler**. You write `main.wasp.ts`:

```ts
// main.wasp.ts (Wasp TS Spec)
import { app, page, query, route } from "@wasp.sh/spec";

import { MainPage } from "./src/MainPage";
import { getTasks } from "./src/queries";

export default app({
  name: "todoApp",
  title: "ToDo App",
  auth: {
    userEntity: "User",
    methods: { email: {}, google: {} },
  },
  spec: [
    route("RootRoute", "/", page(MainPage)),
    query(getTasks, { entities: ["Task"] }),
  ],
});
```

Then you `wasp build` and Wasp **generates a complete React + Express +
Prisma app** in `.wasp/build/`. You can read and modify the generated code
(in fact, you can `cd .wasp/build/...` and run it directly).

The trade-off: **the framework owns the application skeleton**. You
contribute islands of code (pages, queries, jobs) and the framework
stitches them together. It feels like Rails / Laravel for JS.

### NexusTS's approach: building blocks, you compose the app

NexusTS is a **library** (well, 30 libraries). You write every file:

```ts
// app/main.ts
import "reflect-metadata";
import { Application, Module, Controller, Get, Inject } from "@nexusts/core";
import { DrizzleModule } from "@nexusts/drizzle";

@Controller("/")
class HomeController {
  @Get("/")
  index(@Inject("DB") db: any) {
    return db.select().from(tasks).all();
  }
}

@Module({
  imports: [DrizzleModule.forRoot({ dialect: "bun-sqlite", connection: { filename: "app.db" } })],
  controllers: [HomeController],
})
class AppModule {}

const app = new Application(AppModule);
await app.listen(3000);
```

You control **the directory layout, the routing shape, the service layer,
the views, the database schema** — everything. NexusTS gives you DI,
controllers, decorators, and modules. The rest is yours.

The trade-off: more boilerplate, more decisions, more flexibility.

### In one sentence

- **Wasp**: "Tell me what your app is, and I'll generate it."
- **NexusTS**: "Give me types and decorators, and I'll wire your app together."

---

## 3. What Wasp chose differently — and why it matters

### 3.1 Compiler, not runtime

Wasp has a **Haskell compiler** that processes your spec. NexusTS has a
runtime that resolves your module graph at boot.

| Aspect | Wasp | NexusTS |
| --- | --- | --- |
| Build step | `wasp build` (Haskell → generated app) | None — `bun app/main.ts` runs as-is |
| Boot time | Slow (compile + Node boot) | Fast (Bun start) |
| Debugging | You read generated code in `.wasp/build/` | You read your own code |
| Hot reload | Wasp-managed | Bun's `--hot` |
| Output | A standalone web app (Docker image) | Whatever you ship |

**Implication**: Wasp's compile-time view means it can do global
optimizations (e.g., analyze which queries touch which entities for
cache invalidation). NexusTS's runtime view means changes are instant
but it can't reason about the whole app at once.

### 3.2 Stack lock-in vs flexibility

| Choice | Wasp | NexusTS |
| --- | --- | --- |
| Frontend framework | React + TanStack Query (mandatory) | Any — Inertia.js, plain HTML, Vue, custom SPA |
| Server transport | Express (mandatory) | Hono (default), but you can register raw Hono routes |
| ORM | Prisma (mandatory) | Drizzle (default), but any ORM works |
| Build tool | Vite (managed by Wasp) | Any (Vite, esbuild, Bun.build) |
| Schema language | `schema.prisma` | Drizzle's TypeScript tables (or any DSL you want) |

**Implication**: If your stack is "React + Express + Prisma", Wasp is a
strict superset of your workflow. If you want Vue, Svelte, a different
ORM, or a custom frontend bundle, NexusTS is the only path.

### 3.3 Built-in features vs opt-in modules

| Feature | Wasp | NexusTS |
| --- | --- | --- |
| Auth UI | ✅ Sign-up/login pages auto-generated | ❌ You build your own UI |
| Email verification | ✅ Built-in hook | ❌ You implement + `@nexusts/mail` |
| Cache invalidation | ✅ Auto, via `entities: ["Task"]` annotation | ❌ You call `cache.invalidateByTag(...)` |
| Query client | ✅ TanStack Query, wired automatically | ❌ You set up React Query / SWR |
| Routing | ✅ `route("X", "/path", page(Y))` | ❌ `@Controller("/path")` + `@Get("/")` |
| Real-time updates | ⚠️ Via subscriptions, still experimental | ✅ `@nexusts/ws` / `@nexusts/sse` first-class |
| File uploads | ⚠️ Bring your own (FormData) | ✅ `@nexusts/upload` decorators |
| Background jobs | ✅ `app.job(...)` + PgBoss | ✅ `@nexusts/queue` (BullMQ) |

**Implication**: Wasp is faster for "I'm building a SaaS in 2 weeks".
NexusTS is faster for "I'm building a custom web app with unusual
requirements".

### 3.4 The spec file as source of truth

Wasp insists on a single `main.wasp.ts` file that describes **everything**
about your app. This is great for:

- **AI agents** — Wasp explicitly markets itself as "AI-native"; the spec
  gives an LLM a structured map of the app.
- **Onboarding** — a new developer reads one file and sees the whole
  picture.
- **Tooling** — `wasp studio` visualizes the spec.

NexusTS has no such file. Every module, controller, and service is a
normal TypeScript file. Discovery happens through reading the codebase.

---

## 4. Where NexusTS is ahead

### 4.1 Real-time & streaming

- **WebSockets** — `@nexusts/ws` is a first-class module with channel
  subscriptions, middleware, and Bun + Node support.
- **SSE** — `@nexusts/sse` provides stream helpers with backpressure
  control.
- **gRPC** — `@nexusts/grpc` with reflection and unary methods.
- **GraphQL** — `@nexusts/graphql` with SDL-first design.

Wasp has experimental WS / SSE support but it is **not first-class**.
A real-time chat app is easier in NexusTS.

### 4.2 Granular modules

NexusTS ships 30 independent packages. You pay for what you use:

```ts
// Pick modules like Lego bricks
import { DrizzleModule } from "@nexusts/drizzle";
import { AuthModule } from "@nexusts/auth";
import { SessionModule } from "@nexusts/session";
import { GraphQLModule } from "@nexusts/graphql";
import { QueueModule } from "@nexusts/queue";
```

Wasp's features are baked in — you can't use Wasp's auth without using
Wasp's Prisma, Wasp's React client, and Wasp's Express server.

### 4.3 Multi-runtime

NexusTS targets **Bun, Node, and Cloudflare Workers** out of the box.
The Drizzle module has separate drivers for each:

```ts
DrizzleModule.forRoot({
  dialect: "bun-sqlite",            // Bun
  // dialect: "postgres",          // Node
  // dialect: "d1",                // Cloudflare Workers
  connection: { filename: "app.db" },
});
```

Wasp targets Node.js. Cloudflare Workers is experimental (their own
compiler has to emit Workers-compatible output, which is non-trivial
because of the spec → React → Vite chain).

### 4.4 No compile step

NexusTS apps boot in **<100ms** with `bun run app/main.ts`. Wasp apps
need `wasp build` first (seconds to tens of seconds depending on the
project size). For iteration speed, NexusTS wins.

### 4.5 Decorator + DI ecosystem

NexusTS's decorator-first design lets you write **method-level
metadata** that powers retry, circuit breaker, bulkhead, schedule, etc:

```ts
class StripeClient {
  @Retry({ attempts: 3, backoff: "exponential-jitter" })
  @CircuitBreaker({ name: "stripe", threshold: 5 })
  async charge(amount: number) { /* ... */ }
}
```

Wasp has no equivalent — you write try/catch and retry loops yourself.

### 4.6 Production-grade tooling

- **OpenAPI 3.1** auto-generated from Zod schemas
- **Prometheus metrics** out of the box
- **Distributed tracing** via OpenTelemetry
- **Health checks** (memory, disk, http, db indicators)

Wasp has no first-party equivalents for these. You add them yourself
via Express middleware.

---

## 5. Where Wasp is ahead

### 5.1 Time-to-first-deploy

Wasp's `wasp deploy fly` (or `wasp deploy aws`) takes your spec and
produces a **production-ready Docker image** with the right
secrets/DB/cache wiring. The Wasp team maintains the deploy recipes.

NexusTS has no opinionated deploy story. You write a `Dockerfile`, set
up your Postgres, configure Nginx, etc. This is **more work** but
**more flexible** (you can deploy anywhere).

### 5.2 Full-stack auth UI

Wasp generates login / signup / password-reset pages and flows. You
just say `auth: { methods: { email: {}, google: {} } }`.

NexusTS gives you the auth *server* (via better-auth) but you build
the React forms. Trade-off: Wasp wins on speed, NexusTS wins on
customizability.

### 5.3 Open-source SaaS boilerplate

Wasp ships an [OpenSaaS](https://opensaas.sh/) template — a complete
SaaS starter with auth, billing, admin, etc. NexusTS has no equivalent
(though the blog-app in `../blog-app/` is the closest spiritual
successor).

### 5.4 Maturity & ecosystem

- Wasp: 5 years old, $5M+ funding, full-time team, paid support plans.
- NexusTS: 5 months old (v0.7.6), single maintainer, community-driven.

If you're a startup that needs a battle-tested framework with
enterprise support contracts, Wasp is the safer choice today.

### 5.5 Auto cache invalidation

Wasp's `query(getTasks, { entities: ["Task"] })` automatically
invalidates the React Query cache when a `Task` mutation runs. You
get this "for free" via Wasp's compile-time understanding.

NexusTS requires explicit `cache.invalidateByTag(...)` calls. More
control, more code.

---

## 6. When to choose which

### Choose **Wasp** if

- ✅ You're building a "typical" SaaS (CRUD + auth + email + payments).
- ✅ You want React + Express + Prisma and don't need anything else.
- ✅ You want one-command deploys (Fly.io, Railway, AWS).
- ✅ You're a solo founder or small team that wants to ship fast.
- ✅ You want built-in AI agent support out of the box.

### Choose **NexusTS** if

- ✅ You want Bun + Hono + Drizzle (the modern stack).
- ✅ You need WebSockets, SSE, gRPC, or GraphQL.
- ✅ You want to swap pieces (ORM, view engine, transport) without
  fighting the framework.
- ✅ You're building something non-standard (IoT dashboard, real-time
  collaboration, custom protocol).
- ✅ You want module-level composition — pick auth from one place,
  queue from another, GraphQL from a third.
- ✅ You want the framework to *help* you structure the app, not
  *generate* it.

### Choose **both**?

In theory, no — they're mutually exclusive at the runtime level. But
you can use Wasp for the frontend (its auto-generated React client)
and connect to a NexusTS backend over RPC. This is unusual but
possible.

---

## 7. The shared lesson

Both frameworks converged on the same insight:

> **Developers don't want to learn a new language to ship a web app.**

Wasp spent 5 years and $5M learning this the hard way (they removed
their DSL in June 2026). NexusTS started without one (good call from
day one).

The other shared insight:

> **AI agents benefit from structured specs.**

Wasp markets this directly. NexusTS benefits from it implicitly —
decorators + module exports give an LLM a clear map of the app's
dependencies, controllers, and services.

---

## 8. Side-by-side code: "Hello World" with auth + DB

### Wasp (TS Spec)

```ts
// main.wasp.ts
import { app, page, query, route, auth } from "@wasp.sh/spec";

export default app({
  name: "helloApp",
  auth: {
    userEntity: "User",
    methods: { email: {} },
  },
  spec: [
    route("HomeRoute", "/", page("MainPage")),
    query("getMessage", {
      fn: "import { getMessage } from '@src/queries'",
      entities: [],
    }),
  ],
});
```

```prisma
// schema.prisma
model User { id Int @id @default(autoincrement()) email String @unique }
model Message { id Int @id @default(autoincrement()) text String }
```

```tsx
// src/MainPage.tsx
import { useQuery, getMessage } from "@wasp.sh/queries";

export const MainPage = () => {
  const { data: msg } = useQuery(getMessage);
  return <h1>{msg?.text ?? "Loading…"}</h1>;
};
```

```ts
// src/queries.ts
import type { GetMessage } from "@wasp.sh/queries/server";

export const getMessage: GetMessage<void, { text: string }> = async (_args, context) => {
  return { text: "Hello from Wasp!" };
};
```

### NexusTS

```ts
// app/main.ts
import "reflect-metadata";
import {
  Application, Module, Controller, Get, Inject,
} from "@nexusts/core";
import { DrizzleModule, DrizzleService } from "@nexusts/drizzle";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

const messages = sqliteTable("messages", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  text: text("text").notNull(),
});

@Controller("/")
class HomeController {
  @Inject(DrizzleService.TOKEN) db!: DrizzleService;
  @Get("/")
  async index() {
    return this.db.select().from(messages).all();
  }
}

@Module({
  imports: [DrizzleModule.forRoot({ dialect: "bun-sqlite", connection: { filename: "app.db" } })],
  controllers: [HomeController],
})
class AppModule {}

const app = new Application(AppModule);
await app.listen(3000);
```

**Wasp wins on brevity.** **NexusTS wins on transparency** — every
line is yours to change.

---

## 9. Decision framework

```
Are you building a typical CRUD SaaS?
├── YES → Consider Wasp (faster to ship)
│   └── Do you need non-React frontends or WebSockets?
│       └── YES → NexusTS
└── NO  → NexusTS
    └── Are you OK with Bun (not just Node)?
        ├── YES → NexusTS is ideal
        └── NO  → NexusTS works on Node too
```

---

## 10. See also

- [`nestjs-comparison.md`](./nestjs-comparison.md) — vs NestJS (DI-first)
- [`adonisjs-comparison.md`](./adonisjs-comparison.md) — vs AdonisJS (Laravel-style)
- [`wasp-comparison.ko.md`](./wasp-comparison.ko.md) — 이 문서의 한국어 버전
- [Wasp blog: New language for web dev was a mistake](https://wasp.sh/blog/2026/05/13/new-language-for-web-dev-was-a-mistake)
- [Wasp blog: Launch Week #12 — TS Spec](https://wasp.sh/blog/2026/06/05/wasp-launch-week-12-ts-spec)
- [Wasp docs: TS Spec](https://wasp.sh/docs/general/typescript)
