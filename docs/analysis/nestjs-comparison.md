# NexusTS vs NestJS — Feature Gap Analysis

> 한국어 버전: [`nestjs-comparison.ko.md`](./nestjs-comparison.ko.md)
> 분석 일자: 2026-06-24 · 기준: NexusTS **v0.8.3**

This document compares NexusTS v0.8.3 against [NestJS](https://nestjs.com)
to identify which production-grade backend features are **present**,
**partially present**, or **missing**. Every Tier 1 *and* Tier 2 gap
has been closed; this analysis now focuses on the remaining Tier 3+
gaps that block complete feature parity.

> **Important**: NestJS is a 7-year-old framework with ~10M weekly
> downloads and dozens of first-party packages. NexusTS is young
> (v0.6.x, ~4 months of development). The framework deliberately ships
> only what production backends need today; the remaining gaps are
> documented here so they can be prioritized.

---

## 1. Summary table (v0.8.3)

Legend: ✅ ship · ⚠️ partial · ❌ missing · 🔵 third-party required

| Category | NestJS | NexusTS v0.8.3 | Notes |
|----------|--------|--------------|-------|
| HTTP / routing | ✅ GraphQL, WebSockets, gRPC, SSE, Fastify | ✅ Hono + SSE + WS + gRPC + GraphQL | REST + functional + Nest/Adonis styles |
| DI | ✅ Request-scoped, circular auto-resolve | ✅ Singleton + transient + request | Request scope via `AsyncLocalStorage`; `@Injectable({ scope: 'request' })` |
| Config | ✅ @nestjs/config, .env validation | ✅ `@nexusts/config` | Zod-validated, layered loading |
| Security | ✅ helmet, throttler, CSRF, CORS | ✅ `@nexusts/shield` + `@nexusts/limiter` | CSRF / HSTS / CSP / rate limit. CORS via Hono middleware |
| Database | ✅ TypeORM, Prisma, Mongoose, Sequelize | ✅ `@nexusts/drizzle` (5 dialects) | Drizzle is the default ORM |
| Cache | ✅ cache-manager (in-memory / Redis) | ✅ `@nexusts/cache` (memory / Drizzle) | Tag-based invalidation; Redis via custom store |
| Logging | ✅ Built-in Logger (Winston / Pino adapters) | ✅ `@nexusts/logger` (Pino) | Pretty in dev, JSON in prod, request-scoped via ALS |
| Realtime | ✅ WebSocket, SSE, gRPC streaming | ✅ WebSocket + SSE + gRPC | `@nexusts/ws` (Bun + Node) + `@nexusts/sse` + `@nexusts/grpc` |
| Microservices | ✅ TCP, Redis, NATS, Kafka, MQTT | ⚠️ `@nexusts/queue` (BullMQ / Cloudflare) + gRPC | gRPC shipped; no service-mesh transports |
| API docs | ✅ @nestjs/swagger | ✅ `@nexusts/openapi` | OpenAPI 3.1 from Zod + Scalar UI |
| Health checks | ✅ @nestjs/terminus | ✅ `@nexusts/health` | Built-in indicators (memory/disk/http/db) |
| Email | ✅ @nestjs/mailer | ✅ `@nexusts/mail` (SMTP / File / Null) | MJML via optional peer |
| File upload | ✅ multer integration | ✅ `@nexusts/upload` | `@Upload` / `@UploadedFile` decorators, size + MIME validation |
| File storage | ❌ DIY | ✅ `@nexusts/drive` (memory / Local / S3 / R2) | NexusTS has a first-party `@nexusts/drive`; Nest doesn't |
| i18n | ✅ nestjs-i18n | ✅ `@nexusts/i18n` | `Intl`-based, pluralization, JSON catalogs |
| Tracing | ✅ OpenTelemetry integration | ✅ `@nexusts/tracing` | Lazy OTel SDK, W3C + B3 propagation |
| Metrics | ✅ Prometheus integration | ✅ `@nexusts/metrics` | Counter / Gauge / Histogram / Summary |
| Auth | ✅ @nestjs/passport + many strategies | ✅ `@nexusts/auth` (better-auth) | better-auth supports many strategies |
| Encryption | ⚠️ DIY (or `nestjs-crypto`) | ✅ `@nexusts/crypto` | AES-256-GCM + HMAC + scrypt/argon2 |
| Feature flags | ⚠️ DIY (no first-party) | ✅ `@nexusts/feature-flag` | Rollout, allowlist, denylist, `@FeatureFlag` decorator, memory backend. Shipped v0.8.3. |
| Resilience (circuit breaker, retry) | ⚠️ nestjs-recq | ✅ `@nexusts/resilience` | Retry + Circuit Breaker + Bulkhead, shared named registry, exponential-jitter backoff |
| GraphQL | ✅ @nestjs/graphql | ✅ `@nexusts/graphql` | SDL-first + code-first (`autoSchema: true`). `@Resolver`/`@Query`/`@Mutation` decorators with full SDL synthesis. Shipped v0.7.6. |
| gRPC | ✅ @nestjs/microservices | ✅ `@nexusts/grpc` | Reflection-based, unary methods (streaming planned v2). Shipped v0.5. |
| Resilience | ⚠️ nestjs-recq | ✅ `@nexusts/resilience` | Retry + Circuit Breaker + Bulkhead, shared named registry, HTTP admin API (`ResilienceAdminModule`), eager `applyResilience()` auto-wrap. **Zero new dependencies.** |

**Headline**: NexusTS v0.8.3 closes **every Tier 1 and Tier 2 gap** from
the v0.2 analysis. All **32** shipped modules are first-party.

---

## 2. Closed in v0.3 → v0.7.0 (recent wins)

| Was missing in v0.2 | Shipped | Module |
| ------------------- | ------- | ------ |
| Health checks (`@nestjs/terminus` equivalent) | v0.3 | `@nexusts/health` |
| Rate limiting / throttling | v0.3 | `@nexusts/limiter` |
| Security headers (helmet equivalent) | v0.3 | `@nexusts/shield` (CSRF + HSTS + CSP) |
| Configuration management (`@nestjs/config` equivalent) | v0.3 | `@nexusts/config` |
| Logging (Pino / Winston integration) | v0.3 | `@nexusts/logger` |
| Cache (`cache-manager` equivalent) | v0.3 | `@nexusts/cache` |
| Email integration (`@nestjs/mailer` equivalent) | v0.3 | `@nexusts/mail` |
| File storage abstraction | v0.3 | `@nexusts/drive` (memory / Local / S3 / R2) |
| Database integration | v0.3 | `@nexusts/drizzle` (default ORM) |
| Database migrations | v0.3 | `nx db:migrate` + `nx db:migrate --generate` |
| Static file serving | v0.3 | `@nexusts/static` |
| Default ORM (Drizzle-style) | v0.3 | `@nexusts/drizzle` |
| **OpenAPI / Swagger** | v0.4 | `@nexusts/openapi` |
| **File upload helper** | v0.4 | `@nexusts/upload` |
| **Request-scoped DI** | v0.4 | core DI + ALS + Hono middleware |
| **Server-Sent Events** | v0.4 | `@nexusts/sse` |
| **Distributed tracing** | v0.4 | `@nexusts/tracing` |
| **Prometheus metrics** | v0.4 | `@nexusts/metrics` |
| **WebSockets** | v0.5 | `@nexusts/ws` (Bun primary, Node via `ws`) |
| **Encryption + password hashing** | v0.5 | `@nexusts/crypto` (AES-256-GCM + HMAC + scrypt) |
| **i18n** | v0.5 | `@nexusts/i18n` (Intl-based, pluralization) |
| **gRPC** | v0.5 | `@nexusts/grpc` (reflection-based, unary) |
| **nx repl** | v0.5 | Interactive REPL |
| **View engine extracted** | v0.6 | `@nexusts/view` (separate bundle) |
| **Auto-load viewPaths from nx.config.ts** | v0.6.4 | `Application.tryLoadNxConfig()` |
| **Default view = Rendu, Eta option** | v0.6.4 | `view` defaults to Rendu, `.eta` opt-in |
| **Env-aware config (`.env.{NODE_ENV}`)** | v0.6.5 | `ConfigModule.forRoot({ schema })` |
| **`nx db:generate` command** | v0.6.5 | drizzle-kit wrapper |
| **Built-in `sessionMiddleware()`** | v0.6.5 | `@Inject(SessionService.TOKEN)` no longer needs custom middleware |
| **Package rename `@nexusts/core`** | v0.6.6 | npm name conflict with another project |
| **`router.getRoutes()` for OpenAPI** | v0.6.6 | feeds spec generation from declared routes |
| **`create-nexusts` scaffolder** | v0.6.7 | separate npm package |
| **`examples/` + smoke test suite** | v0.6.8 | 27 working examples, 55 vitest tests in ~2s |
| **`@nexusts/graphql`** | v0.6.9 | SDL-first GraphQL endpoint + `GraphQLService`/`GraphQLModule`. `@Resolver`/`@Query`/`@Mutation` decorators (code-first SDL synthesis alpha). Optional peer-dep `graphql` |
| **Inertia v3 examples (React + Vue, SPA + SSR)** | v0.6.9 | 4 new examples under `examples/28-31` |
| **`@nexusts/resilience`** | v0.7.0 | Retry + Circuit Breaker + Bulkhead in a single DI singleton. `retry()` with 4 backoff strategies, named-circuit registry. **Zero new dependencies.** |
| **Circuit breaker admin API** | v0.7.5 | `metrics()`, `forceOpen()`, `forceClose()`, `reset()`, `listCircuits()`, `listBulkheads()`. |
| **Global `@Resolver` registry** | v0.7.6 | `@Resolver`-decorated classes auto-registered via global Set. |
| **CLI improvements** | v0.7.5-6 | `make:repository` command, `drizzle.config.ts` auto-generation, `route:list` prefix fix, `make:service` import fix, `db:seed` path fix. |
| **Logger pino dep** | v0.7.4 | pino is now a direct dependency — no manual `bun add pino`. |
| **REPL improvements** | v0.7.4 | `.services`, `.modules`, `.routes` commands working; handler class.method display. |
| **Eager `applyResilience()`** | v0.8.0 | `@Retry`/`@CircuitBreaker`/`@Bulkhead` auto-wrapped at controller mount. |
| **ResilienceAdminModule** | v0.8.0 | HTTP admin endpoints for circuit breaker runtime control. |
| **Cross-pod circuit breaker store** | v0.8.1 | `RedisResilienceStore`, `DrizzleResilienceStore`. |
| **gRPC streaming** | v0.8.3 | Server/client/bidi streaming via decorators. |
| **Repository migration** | v0.8.0 | Moved to `nexus-ts/nexusts` GitHub org. |
| **Examples + smoke test expansion** | v0.7.0 | 33 examples total (added `32-graphql-hello`, `33-resilience-calls`). 67 smoke tests. |

Total: **42+ Tier 1+2+3 gaps closed** since v0.2.

---

## 3. Tier 1 — Remaining critical gaps

None. v0.3 closed every original Tier 1 gap.

---

## 4. Tier 2 — Important (most production apps)

### 4.1 WebSockets (`@nestjs/websockets` equivalent)

- **Status**: ✅ closed in v0.5 by `@nexusts/ws`.
- **What ships**: `@WebSocketGateway(path)` + `@OnWebSocketMessage()`
  decorators. `WebSocketService` for connection tracking, rooms,
  broadcast. `BunWsAdapter` (uses `hono/bun`) and `NodeWsAdapter`
  (uses `ws` package as optional peer) — runtime auto-detected.
- See [`../../user-guide/ws.md`](../../user-guide/ws.md).

### 4.2 Server-Sent Events (SSE)

- **Status**: ✅ closed in v0.4 by `@nexusts/sse` (Hono's
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
- **Status**: ✅ shipped in v0.5 as `@nexusts/grpc`.
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
- **Status**: ✅ shipped in v0.6.9 as `@nexusts/graphql`.
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

- **Status**: ✅ closed in v0.5 by `@nexusts/i18n`. `Intl`-based
  pluralization with `|` separator, locale detection middleware
  (query → cookie → Accept-Language → default), JSON catalogs,
  `formatDate` / `formatNumber` / `formatCurrency` /
  `compare`. See [`../../user-guide/i18n.md`](../../user-guide/i18n.md).

### 5.2 Feature flags

- **Use cases**: canary deploys, A/B tests, gradual rollouts.
- **Status**: ❌ not yet shipped.
- **Proposed module**: `@nexusts/feature-flag`
- **Features**:
  - `@FeatureFlag('new-dashboard')` decorator
  - Backends: in-memory / LaunchDarkly / Unleash
  - Per-tenant / per-user targeting

### 5.3 Tracing (OpenTelemetry)

- **Status**: ✅ closed in v0.4 by `@nexusts/tracing`. Lazy
  `@opentelemetry/sdk-node` load, W3C + B3 propagation, Hono
  auto-instrumentation middleware, `@Trace()` decorator.
  See [`../../user-guide/tracing.md`](../../user-guide/tracing.md).

### 5.4 Metrics (Prometheus)

- **Status**: ✅ closed in v0.4 by `@nexusts/metrics`.
  Counter / Gauge / Histogram / Summary, `@Counted` / `@Timed`
  decorators, `/metrics` endpoint with content negotiation
  (Prometheus 0.0.4 / OpenMetrics 1.0.0). Default Node.js process
  metrics. See [`../../user-guide/metrics.md`](../../user-guide/metrics.md).

### 5.5 Encryption + password hashing

- **Status**: ✅ closed in v0.5 by `@nexusts/crypto`. AES-256-GCM
  authenticated encryption, HMAC-SHA256 sign/unsign, scrypt
  password hashing (default, built-in to Node), optional
  `@node-rs/argon2` peer. `EncryptionService` is also used
  internally by `@nexusts/session` and `@nexusts/shield` for HMAC.
  See [`../../user-guide/crypto.md`](../../user-guide/crypto.md).

### 5.6 Resilience: circuit breakers + retry

- **Use cases**: external API resilience.
- **Status**: ✅ shipped in v0.7.0 as `@nexusts/resilience`.
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
- **Proposed module**: `@nexusts/feature-flag`
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
| `@nexusts/cache` Redis store | Low | High | Open (one more backend implementing the `CacheStore` interface) |
| Multipart body parser wrapper | Low | Medium | ✅ shipped as `@nexusts/upload` (v0.4) |
| `helmet()` middleware | Very low | High | Open (some pieces ship in `@nexusts/shield`) |

The biggest **single** leverage remaining is **GraphQL** — it
unlocks BFF / mobile-first patterns that are now table-stakes for
consumer apps.

---

## 7. Recommended v0.6+ roadmap

### v0.6.x — Async RPC & DX (the "polyglot" milestone) — shipped

Shipped in v0.5–v0.6.8:

1. **`@nexusts/grpc`** — server + typed client (unary, reflection-based)
2. **`nx repl`** — interactive REPL
3. **`@nexusts/view`** — view engine extracted to separate bundle
4. **Auto-load viewPaths from `nx.config.ts`** (v0.6.4) — no explicit call needed
5. **Default view = Rendu, Eta option** (v0.6.4)
6. **Env-aware config (`.env.{NODE_ENV}`)** (v0.6.5) — priority: process.env > `.env.NODE` > `.env.local` > `.env`
7. **`nx db:generate`** (v0.6.5) — drizzle-kit wrapper
8. **Built-in `sessionMiddleware()`** (v0.6.5) — `@Inject(SessionService.TOKEN)` no longer needs custom middleware
9. **`@nexusts/core` package rename** (v0.6.6) — npm name conflict
10. **`router.getRoutes()` for OpenAPI** (v0.6.6)
11. **`create-nexusts` scaffolder** (v0.6.7) — `bunx create-nexusts my-app`
12. **`examples/` + smoke test suite** (v0.6.8) — 27 working examples, 55 vitest tests in ~2s
13. **Inertia v3 examples** (v0.6.9) — React + Vue, SPA + SSR

### v0.6.9 — GraphQL — shipped

- **`@nexusts/graphql`** — SDL-first GraphQL endpoint
  (`POST/GET /graphql`, `/graphql/schema`, in-bundle GraphiQL
  playground, `context()` factory). `@Resolver`/`@Query`/
  `@Mutation`/`@Subscription`/`@Arg` decorators (code-first
  SDL synthesis reserved for v0.8). Optional peer-dep `graphql`.
- **4 Inertia v3 examples** (examples 28–31).
- **example 32** (`graphql-hello`).

### v0.7.0 — Resilience — shipped

- **`@nexusts/resilience`** — Retry + Circuit Breaker +
  Bulkhead in a single DI singleton.
  - `retry()` function with 4 backoff strategies (constant,
    linear, exponential, exponential-jitter).
  - `CircuitBreaker` class — closed / open / half-open state
    machine with rolling window.
  - `Bulkhead` class — FIFO concurrency limiter with `rejectOnFull`.
  - `@Retry` / `@CircuitBreaker` / `@Bulkhead` / `@Resilient`
    method decorators (metadata-only).
  - `getOrCreateCircuit(name)` / `getOrCreateBulkhead(name)` —
    shared named registry across the app.
  - **Zero new dependencies.**
- **example 33** (`resilience-calls`).
- **Documentation**: `docs/user-guide/resilience.md` + `.ko.md`,
  `docs/design/resilience.md` + `.ko.md`.
- **Tests**: 20 vitest unit tests for retry / circuit / bulkhead.

### v0.7.3 — Exception Filters, Interceptors, Guards (shipped)

- `@UseFilters()`, `@UseInterceptors()`, `@UseGuards()` decorators
  with onion composition, plus lifecycle hooks (`OnModuleInit`, etc.).

### v0.7.4 — REPL & DX improvements (shipped)

- REPL `.services`, `.modules`, `.routes` fixed; handler class.method display.
- Logger pino made a direct dependency.
- Schedule hot-reload support for Bun `--hot`.

### v0.7.5 — Circuit breaker admin API (shipped)

- `metrics()`, `forceOpen()`, `forceClose()`, `reset()`, `listCircuits()`.
- `make:repository` CLI command.
- `route:list` prefix fix, `make:service` import fix, `db:seed` path fix.

### v0.7.6 — Global @Resolver registry + code-first SDL (shipped)

### v0.7.7 — GraphQL code-first SDL synthesis (shipped)

### v0.7.8 — Repository migration (shipped)

### v0.7.9 — Bun decorator diagnostics (shipped)

### v0.8.3 — ResilienceAdminModule + FeatureFlagModule (shipped)

- **`ResilienceAdminModule`** — HTTP admin endpoints for circuit
  breaker and bulkhead inspection/control.
- **Eager `applyResilience()`** — decorators auto-wrap at mount time.
- **`@nexusts/feature-flag`** — canary / A/B testing with rollout,
  allowlist/denylist, `@FeatureFlag` decorator.
- **Repository migration** to `nexus-ts/nexusts`.

### v0.8.x — Hardening

- **Cross-pod circuit breakers** (resilience backed by Redis / Drizzle).
- Stable public API surface (semver guarantees).
- Multi-runtime CI (Bun + Node + Cloudflare Workers).

### v1.0 — Production-ready LTS

- Frozen API surface.
- Migration guides from NestJS / AdonisJS.
- LTS branch (security backports for 12 months).

---

## 8. Honest assessment (v0.8.3)

NexusTS v0.8.3 is **production-ready for the vast majority of backend
services**:

- The MVC + DI + validation core is solid and battle-tested.
- All **30** optional modules are independently usable and well-scoped.
- **Tier 1 and Tier 2 gaps are fully closed**. Every production-need
  infrastructure piece from the v0.2 analysis has shipped.
- gRPC (v0.5) closes the remaining NestJS-microservices gap.
- GraphQL (v0.6.9) closes the BFF / mobile-first gap with an
  SDL-first endpoint and the standard `@Resolver` / `@Query` decorator
  shape.
- Resilience (v0.7.0) closes the external-API reliability gap with
  retry + circuit breaker + bulkhead in a single DI singleton.
- Drizzle as the default ORM closes the AdonisJS-Lucid gap and
  is arguably the **strongest** ORM choice for Bun-native apps.
- The CLI is genuinely better than NestJS's `nest g` for new
  projects.
- The SQL-injection-safe raw-query primitive is best-in-class.
- The `EncryptionService` is shared between the framework
  (session cookies, CSRF) and user code, with a single APP_KEY.
- **33 working examples** under `examples/` cover every major module
  and act as living docs; the smoke test suite (67 vitest tests in
  ~2s) catches import / DI / wiring regressions on every commit.
- **102 vitest tests** in total (15 GraphQL + 20 Resilience + 67 smoke),
  all passing.

What's still missing for full "NestJS feature parity":

- **Code-first GraphQL SDL synthesis** (alpha today; full release in
  v0.8). For now, use SDL for non-trivial schemas.
- **Feature flags** (`@nexusts/feature-flag`) — planned v0.8.
- **Cross-pod circuit breakers** (in-resilience roadmap; planned v0.8).
- **Federation** (Apollo Federation v2 subgraph support) — planned v0.8+.

The path from v0.7.0 to v1.0 is roughly:

- **v0.7.1** (immediate): Inertia `<Form>` SDK stabilization, code-first
  GraphQL SDL synthesis, eager resilience wrapping, circuit-breaker
  admin API.
- **v0.8** (Q3 2026): Production hardening + feature flags +
  cross-pod circuit breakers + federation.
- **v1.0** (Q1 2027): Production-ready LTS — frozen API surface,
  migration guides, long-term support branch.

After v0.8, NexusTS is a viable alternative for **any** backend
that NestJS supports today, with the runtime + ORM advantages of Bun.

---

## 9. See also

- [`../../CHANGELOG.md`](../../CHANGELOG.md) — v0.7.0 release notes
- [`../../user-guide/`](../../user-guide/) — guides for the 30 modules
- [`../../user-guide/testing-examples.md`](../../user-guide/testing-examples.md) — smoke test runner guide
- [`../../../examples/`](../../../examples/) — 33 working example apps
- [`../../../AGENTS.md`](../../../AGENTS.md) — contributor + module-author guide
- [NestJS documentation](https://docs.nestjs.com) — the comparison baseline
- [Bulletproof Node.js architecture](https://github.com/santiq/bulletproof-nodejs) —
  the production checklist this analysis derives from
