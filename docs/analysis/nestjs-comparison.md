# NexusJS vs NestJS — Feature Gap Analysis

> 한국어 버전: [`nestjs-comparison.ko.md`](./nestjs-comparison.ko.md)
> 분석 일자: 2026-06-25 · 기준: NexusJS **v0.6.8**

This document compares NexusJS v0.6.8 against [NestJS](https://nestjs.com)
to identify which production-grade backend features are **present**,
**partially present**, or **missing**. Every Tier 1 *and* Tier 2 gap
has been closed; this analysis now focuses on the remaining Tier 3+
gaps that block complete feature parity.

> **Important**: NestJS is a 7-year-old framework with ~10M weekly
> downloads and dozens of first-party packages. NexusJS is young
> (v0.6.x, ~4 months of development). The framework deliberately ships
> only what production backends need today; the remaining gaps are
> documented here so they can be prioritized.

---

## 1. Summary table (v0.6.8)

Legend: ✅ ship · ⚠️ partial · ❌ missing · 🔵 third-party required

| Category | NestJS | NexusJS v0.6.8 | Notes |
|----------|--------|--------------|-------|
| HTTP / routing | ✅ GraphQL, WebSockets, gRPC, SSE, Fastify | ✅ Hono + SSE + WS + gRPC + GraphQL | REST + functional + Nest/Adonis styles |
| DI | ✅ Request-scoped, circular auto-resolve | ✅ Singleton + transient + request | Request scope via `AsyncLocalStorage`; `@Injectable({ scope: 'request' })` |
| Config | ✅ @nestjs/config, .env validation | ✅ `@kabyeon/nexusjs/config` | Zod-validated, layered loading |
| Security | ✅ helmet, throttler, CSRF, CORS | ✅ `@kabyeon/nexusjs/shield` + `@kabyeon/nexusjs/limiter` | CSRF / HSTS / CSP / rate limit. CORS via Hono middleware |
| Database | ✅ TypeORM, Prisma, Mongoose, Sequelize | ✅ `@kabyeon/nexusjs/drizzle` (5 dialects) | Drizzle is the default ORM |
| Cache | ✅ cache-manager (in-memory / Redis) | ✅ `@kabyeon/nexusjs/cache` (memory / Drizzle) | Tag-based invalidation; Redis via custom store |
| Logging | ✅ Built-in Logger (Winston / Pino adapters) | ✅ `@kabyeon/nexusjs/logger` (Pino) | Pretty in dev, JSON in prod, request-scoped via ALS |
| Realtime | ✅ WebSocket, SSE, gRPC streaming | ✅ WebSocket + SSE + gRPC | `@kabyeon/nexusjs/ws` (Bun + Node) + `@kabyeon/nexusjs/sse` + `@kabyeon/nexusjs/grpc` |
| Microservices | ✅ TCP, Redis, NATS, Kafka, MQTT | ⚠️ `@kabyeon/nexusjs/queue` (BullMQ / Cloudflare) + gRPC | gRPC shipped; no service-mesh transports |
| API docs | ✅ @nestjs/swagger | ✅ `@kabyeon/nexusjs/openapi` | OpenAPI 3.1 from Zod + Scalar UI |
| Health checks | ✅ @nestjs/terminus | ✅ `@kabyeon/nexusjs/health` | Built-in indicators (memory/disk/http/db) |
| Email | ✅ @nestjs/mailer | ✅ `@kabyeon/nexusjs/mail` (SMTP / File / Null) | MJML via optional peer |
| File upload | ✅ multer integration | ✅ `@kabyeon/nexusjs/upload` | `@Upload` / `@UploadedFile` decorators, size + MIME validation |
| File storage | ❌ DIY | ✅ `@kabyeon/nexusjs/drive` (memory / Local / S3 / R2) | Nexus has a first-party `@kabyeon/nexusjs/drive`; Nest doesn't |
| i18n | ✅ nestjs-i18n | ✅ `@kabyeon/nexusjs/i18n` | `Intl`-based, pluralization, JSON catalogs |
| Tracing | ✅ OpenTelemetry integration | ✅ `@kabyeon/nexusjs/tracing` | Lazy OTel SDK, W3C + B3 propagation |
| Metrics | ✅ Prometheus integration | ✅ `@kabyeon/nexusjs/metrics` | Counter / Gauge / Histogram / Summary |
| Auth | ✅ @nestjs/passport + many strategies | ✅ `@kabyeon/nexusjs/auth` (better-auth) | better-auth supports many strategies |
| Encryption | ⚠️ DIY (or `nestjs-crypto`) | ✅ `@kabyeon/nexusjs/crypto` | AES-256-GCM + HMAC + scrypt/argon2 |
| Feature flags | ⚠️ DIY (no first-party) | ⚠️ DIY | Both lack first-party |
| Resilience (circuit breaker, retry) | ⚠️ nestjs-recq | ✅ `@kabyeon/nexusjs/resilience` | Retry + Circuit Breaker + Bulkhead, shared named registry, exponential-jitter backoff |
| GraphQL | ✅ @nestjs/graphql | ✅ `@kabyeon/nexusjs/graphql` | SDL-first; code-first via `@Resolver` (alpha) in v0.6.9 |
| gRPC | ✅ @nestjs/microservices | ✅ `@kabyeon/nexusjs/grpc` | Reflection-based, unary methods (streaming planned v2) |

**Headline**: NexusJS v0.6.8 closes **every Tier 1 and Tier 2 gap** from
the v0.2 analysis. All **28** shipped modules are first-party.

---

## 2. Closed in v0.3 → v0.6 (recent wins)

| Was missing in v0.2 | Shipped | Module |
| ------------------- | ------- | ------ |
| Health checks (`@nestjs/terminus` equivalent) | v0.3 | `@kabyeon/nexusjs/health` |
| Rate limiting / throttling | v0.3 | `@kabyeon/nexusjs/limiter` |
| Security headers (helmet equivalent) | v0.3 | `@kabyeon/nexusjs/shield` (CSRF + HSTS + CSP) |
| Configuration management (`@nestjs/config` equivalent) | v0.3 | `@kabyeon/nexusjs/config` |
| Logging (Pino / Winston integration) | v0.3 | `@kabyeon/nexusjs/logger` |
| Cache (`cache-manager` equivalent) | v0.3 | `@kabyeon/nexusjs/cache` |
| Email integration (`@nestjs/mailer` equivalent) | v0.3 | `@kabyeon/nexusjs/mail` |
| File storage abstraction | v0.3 | `@kabyeon/nexusjs/drive` (memory / Local / S3 / R2) |
| Database integration | v0.3 | `@kabyeon/nexusjs/drizzle` (default ORM) |
| Database migrations | v0.3 | `nx db:migrate` + `nx db:migrate --generate` |
| Static file serving | v0.3 | `@kabyeon/nexusjs/static` |
| Default ORM (Drizzle-style) | v0.3 | `@kabyeon/nexusjs/drizzle` |
| **OpenAPI / Swagger** | v0.4 | `@kabyeon/nexusjs/openapi` |
| **File upload helper** | v0.4 | `@kabyeon/nexusjs/upload` |
| **Request-scoped DI** | v0.4 | core DI + ALS + Hono middleware |
| **Server-Sent Events** | v0.4 | `@kabyeon/nexusjs/sse` |
| **Distributed tracing** | v0.4 | `@kabyeon/nexusjs/tracing` |
| **Prometheus metrics** | v0.4 | `@kabyeon/nexusjs/metrics` |
| **WebSockets** | v0.5 | `@kabyeon/nexusjs/ws` (Bun primary, Node via `ws`) |
| **Encryption + password hashing** | v0.5 | `@kabyeon/nexusjs/crypto` (AES-256-GCM + HMAC + scrypt) |
| **i18n** | v0.5 | `@kabyeon/nexusjs/i18n` (Intl-based, pluralization) |
| **gRPC** | v0.5 | `@kabyeon/nexusjs/grpc` (reflection-based, unary) |
| **nx repl** | v0.5 | Interactive REPL |
| **View engine extracted** | v0.6 | `@kabyeon/nexusjs/view` (separate bundle) |
| **Auto-load viewPaths from nx.config.ts** | v0.6.4 | `Application.tryLoadNxConfig()` |
| **Default view = Rendu, Eta option** | v0.6.4 | `view` defaults to Rendu, `.eta` opt-in |
| **Env-aware config (`.env.{NODE_ENV}`)** | v0.6.5 | `ConfigModule.forRoot({ schema })` |
| **`nx db:generate` command** | v0.6.5 | drizzle-kit wrapper |
| **Built-in `sessionMiddleware()`** | v0.6.5 | `@Inject(SessionService.TOKEN)` no longer needs custom middleware |
| **Package rename `@kabyeon/nexusjs`** | v0.6.6 | npm name conflict with another project |
| **`router.getRoutes()` for OpenAPI** | v0.6.6 | feeds spec generation from declared routes |
| **`create-nexusjs` scaffolder** | v0.6.7 | separate npm package |
| **`examples/` + smoke test suite** | v0.6.8 | 27 working examples, 55 vitest tests in ~2s |

Total: **34 Tier 1+2+3 gaps closed** since v0.2.

---

## 3. Tier 1 — Remaining critical gaps

None. v0.3 closed every original Tier 1 gap.

---

## 4. Tier 2 — Important (most production apps)

### 4.1 WebSockets (`@nestjs/websockets` equivalent)

- **Status**: ✅ closed in v0.5 by `@kabyeon/nexusjs/ws`.
- **What ships**: `@WebSocketGateway(path)` + `@OnWebSocketMessage()`
  decorators. `WebSocketService` for connection tracking, rooms,
  broadcast. `BunWsAdapter` (uses `hono/bun`) and `NodeWsAdapter`
  (uses `ws` package as optional peer) — runtime auto-detected.
- See [`../../user-guide/ws.md`](../../user-guide/ws.md).

### 4.2 Server-Sent Events (SSE)

- **Status**: ✅ closed in v0.4 by `@kabyeon/nexusjs/sse` (Hono's
  `streamSSE` wrapped behind a type-safe `SseStream` with
  auto-serialization, idempotent `close()`, and `Last-Event-ID`
  reconnection support). See
  [`../../user-guide/sse.md`](../../user-guide/sse.md).

### 4.3 Request-scoped DI as a core feature

- **Status**: ✅ closed in v0.4. The `DIContainer` now supports
  `scope: 'request'` providers (via `@Injectable({ scope: 'request' })`)
  and a Hono middleware that activates a per-request scope via
  `AsyncLocalStorage`. Service code can read the active request
  via `getRequest()` / `getRequestScope()`. The `REQUEST` token
  injects the live Hono context. See
  [`../../user-guide/request-scope.md`](../../user-guide/request-scope.md).

### 4.4 gRPC (`@nestjs/microservices` partial)

- **Use cases**: service-to-service high-perf RPC.
- **Status**: ✅ shipped in v0.5 as `@kabyeon/nexusjs/grpc`.
- **What ships**:
  - `GrpcModule.forRoot()` — loads `.proto` files at runtime via
    `@grpc/proto-loader` (reflection-based, no codegen).
  - `@GrpcService()` decorator — registers unary service methods
    from a controller class.
  - Typed client — `grpcClient()` returns a promises-based proxy.
  - Runtime-backend auto-detection (Bun / Node).
- **Note**: Unary methods only for v1; streaming (server,
  client, bidi) planned for v2.
- See [`../../user-guide/grpc.md`](../../user-guide/grpc.md).

### 4.5 GraphQL (`@nestjs/graphql` equivalent)

- **Use cases**: BFF patterns, mobile clients, schema-first dev.
- **Status**: ✅ shipped in v0.6.9 as `@kabyeon/nexusjs/graphql`.
- **What ships**:
  - SDL-first schema via `GraphQLModule.forRoot({ typeDefs, resolvers })`.
  - `POST /graphql`, `GET /graphql?query=...`, `GET /graphql/schema`,
    plus an in-bundle GraphiQL playground at `GET /graphql`.
  - `context(c)` factory — per-request state flows into every
    resolver as `ctx.state`.
  - `@Resolver` / `@Query` / `@Mutation` / `@Subscription` /
    `@Arg` decorators exported (code-first SDL synthesis reserved
    for v0.8).
  - `graphql` is an optional peer-dep — install with `bun add graphql`.
- See [`../../user-guide/graphql.md`](../../user-guide/graphql.md) and
  [`../../design/graphql.md`](../../design/graphql.md).

---

## 5. Tier 3 — Nice-to-have

### 5.1 i18n (`nestjs-i18n` equivalent)

- **Status**: ✅ closed in v0.5 by `@kabyeon/nexusjs/i18n`. `Intl`-based
  pluralization with `|` separator, locale detection middleware
  (query → cookie → Accept-Language → default), JSON catalogs,
  `formatDate` / `formatNumber` / `formatCurrency` /
  `compare`. See [`../../user-guide/i18n.md`](../../user-guide/i18n.md).

### 5.2 Feature flags

- **Use cases**: canary deploys, A/B tests, gradual rollouts.
- **Status**: ❌ not yet shipped.
- **Proposed module**: `@kabyeon/nexusjs/feature-flag`
- **Features**:
  - `@FeatureFlag('new-dashboard')` decorator
  - Backends: in-memory / LaunchDarkly / Unleash
  - Per-tenant / per-user targeting

### 5.3 Tracing (OpenTelemetry)

- **Status**: ✅ closed in v0.4 by `@kabyeon/nexusjs/tracing`. Lazy
  `@opentelemetry/sdk-node` load, W3C + B3 propagation, Hono
  auto-instrumentation middleware, `@Trace()` decorator.
  See [`../../user-guide/tracing.md`](../../user-guide/tracing.md).

### 5.4 Metrics (Prometheus)

- **Status**: ✅ closed in v0.4 by `@kabyeon/nexusjs/metrics`.
  Counter / Gauge / Histogram / Summary, `@Counted` / `@Timed`
  decorators, `/metrics` endpoint with content negotiation
  (Prometheus 0.0.4 / OpenMetrics 1.0.0). Default Node.js process
  metrics. See [`../../user-guide/metrics.md`](../../user-guide/metrics.md).

### 5.5 Encryption + password hashing

- **Status**: ✅ closed in v0.5 by `@kabyeon/nexusjs/crypto`. AES-256-GCM
  authenticated encryption, HMAC-SHA256 sign/unsign, scrypt
  password hashing (default, built-in to Node), optional
  `@node-rs/argon2` peer. `EncryptionService` is also used
  internally by `@kabyeon/nexusjs/session` and `@kabyeon/nexusjs/shield` for HMAC.
  See [`../../user-guide/crypto.md`](../../user-guide/crypto.md).

### 5.6 Resilience: circuit breakers + retry

- **Use cases**: external API resilience.
- **Status**: ✅ shipped in v0.7.0 as `@kabyeon/nexusjs/resilience`.
- **What ships**:
  - `retry()` — function with `exponential-jitter` backoff,
    `retryOn` filter, `onRetry` hook, overall `timeout`.
  - `CircuitBreaker` class — `closed` / `open` / `half-open` state
    machine with rolling window, threshold, configurable
    `isFailure` predicate, `onStateChange` hook.
  - `Bulkhead` class — FIFO concurrency limiter with optional
    queue, `rejectOnFull` for fail-fast.
  - `ResilienceService` — DI singleton registry. Methods like
    `getOrCreateCircuit("stripe")` share state across the entire
    app.
  - `@Retry` / `@CircuitBreaker` / `@Bulkhead` / `@Resilient`
    method decorators (metadata-only; users on legacy decorator
    tsconfig can use `applyResilience()` to wrap manually).
- **No external deps.** Pure TypeScript.
- See [`../../user-guide/resilience.md`](../../user-guide/resilience.md) and
  [`../../design/resilience.md`](../../design/resilience.md).

### 5.7 Multi-database per project

- **Use cases**: PostgreSQL + Elasticsearch in one project.
- **Status**: ⚠️ already supported via `DrizzleModule.forRoot({...})`
  being called multiple times with different tokens. No new
  module needed.

### 5.8 Feature flags (advanced)

- **Status**: ❌ not yet shipped.
- **Proposed module**: `@kabyeon/nexusjs/feature-flag`
- **Features**:
  - `@FeatureFlag('new-dashboard')` decorator
  - Backends: in-memory / LaunchDarkly / Unleash
  - Per-tenant / per-user targeting

---

## 6. Quick wins (small effort, big impact)

| Task | Effort | Impact | Status |
|------|--------|--------|--------|
| CORS abstraction | Low | Medium | Open (Hono's `cors()` works; a thin wrapper would give consistent config) |
| Multi-runtime parity tests | Low | High | Open (Bun / Node / Workers) |
| `@kabyeon/nexusjs/cache` Redis store | Low | High | Open (one more backend implementing the `CacheStore` interface) |
| Multipart body parser wrapper | Low | Medium | ✅ shipped as `@kabyeon/nexusjs/upload` (v0.4) |
| `helmet()` middleware | Very low | High | Open (some pieces ship in `@kabyeon/nexusjs/shield`) |

The biggest **single** leverage remaining is **GraphQL** — it
unlocks BFF / mobile-first patterns that are now table-stakes for
consumer apps.

---

## 7. Recommended v0.6+ roadmap

### v0.6 — Async RPC & DX (the "polyglot" milestone)

Shipped in v0.5–v0.6.8:

1. **`@kabyeon/nexusjs/grpc`** — server + typed client (unary, reflection-based)
2. **`nx repl`** — interactive REPL
3. **`@kabyeon/nexusjs/view`** — view engine extracted to separate bundle
4. **Auto-load viewPaths from `nx.config.ts`** (v0.6.4) — no explicit call needed
5. **Default view = Rendu, Eta option** (v0.6.4)
6. **Env-aware config (`.env.{NODE_ENV}`)** (v0.6.5) — priority: process.env > `.env.NODE` > `.env.local` > `.env`
7. **`nx db:generate`** (v0.6.5) — drizzle-kit wrapper
8. **Built-in `sessionMiddleware()`** (v0.6.5) — `@Inject(SessionService.TOKEN)` no longer needs custom middleware
9. **`@kabyeon/nexusjs` package rename** (v0.6.6) — npm name conflict
10. **`router.getRoutes()` for OpenAPI** (v0.6.6)
11. **`create-nexusjs` scaffolder** (v0.6.7) — `bunx create-nexusjs my-app`
12. **`examples/` + smoke test suite** (v0.6.8) — 27 working examples, 55 vitest tests in ~2s
13. **Inertia v2 examples** (v0.6.8) — React + Vue, SPA + SSR

After v0.6, NexusJS will have feature parity with NestJS for ~95% of backend
use-cases.

### v0.7 — Hardening

- Stable public API surface (semver guarantees)
- Multi-runtime CI (Bun + Node + Cloudflare Workers)
- Performance benchmarks + cross-runtime parity tests
- Long-term LTS support plan
- **Resilience** (`@kabyeon/nexusjs/resilience`) — ✅ shipped in v0.7.0
- **Feature flags** (`@kabyeon/nexusjs/feature-flag`)

### v1.0 — Production-ready LTS

- Frozen API surface
- Migration guides from NestJS / AdonisJS
- LTS branch (security backports for 12 months)

---

## 8. Honest assessment (v0.6.8)

NexusJS v0.6.8 is **production-ready for the vast majority of backend
services**:

- The MVC + DI + validation core is solid and battle-tested.
- All **28** optional modules (auth, queue, schedule, events, session,
  health, config, logger, static, limiter, shield, cache, drive,
  mail, drizzle, cli, openapi, upload, sse, tracing, metrics, ws,
  crypto, i18n, grpc, redis, examples, testing) are independently
  usable and well-scoped.
- **Tier 1 and Tier 2 gaps are fully closed** as of v0.5.
  Every production-need infrastructure piece from the v0.2 analysis
  has shipped.
- gRPC shipped in v0.5 closes the remaining NestJS-microservices gap.
- Drizzle as the default ORM closes the AdonisJS-Lucid gap and
  is arguably the **strongest** ORM choice for Bun-native apps.
- The CLI is genuinely better than NestJS's `nest g` for new
  projects.
- The SQL-injection-safe raw-query primitive is best-in-class.
- The `EncryptionService` is now shared between the framework
  (session cookies, CSRF) and user code, with a single APP_KEY.
- **27 working examples** under `examples/` cover every major module
  and act as living docs; the smoke test suite (55 vitest tests in
  ~2s) catches import / DI / wiring regressions on every commit.

What's still missing for full "NestJS feature parity":

- **Feature flags** — useful for canary deploys.
- **Cross-pod circuit breakers** (in-resilience roadmap).

The path from v0.6.8 to v1.0 is roughly:

- **v0.6.x** (shipped): gRPC, REPL, view engine extraction, env-aware
  config, built-in sessionMiddleware, `nx db:generate`,
  `@kabyeon/nexusjs` package rename, `create-nexusjs` scaffolder,
  `examples/` + smoke test suite, Inertia v2 examples (React + Vue,
  SPA + SSR), `GraphQL` module (v0.6.9), `Resilience` module (v0.7.0).
- **v0.7** (Q3 2026): Async RPC & DX — GraphQL, resilience, feature flags
- **v0.8** (Q4 2026): Production hardening — stable public API,
  multi-runtime CI, performance benchmarks, LTS plan.
- **v1.0** (Q1 2027): Production-ready LTS — frozen API surface,
  migration guides, long-term support branch.

After v0.7, NexusJS is a viable alternative for **any** backend
that NestJS supports today, with the runtime + ORM advantages of Bun.

---

## 9. See also

- [`../../CHANGELOG.md`](../../CHANGELOG.md) — v0.6.x release notes
- [`../../user-guide/`](../../user-guide/) — guides for the 28 modules
- [`../../user-guide/testing-examples.md`](../../user-guide/testing-examples.md) — smoke test runner guide
- [`../../../examples/`](../../../examples/) — 27 working example apps
- [NestJS documentation](https://docs.nestjs.com) — the comparison baseline
- [Bulletproof Node.js architecture](https://github.com/santiq/bulletproof-nodejs) —
  the production checklist this analysis derives from
