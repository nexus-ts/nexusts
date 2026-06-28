# NexusTS vs AdonisJS — Comprehensive Analysis Report

> **Date**: 2026-06-27 | **Project Version**: v0.9.13 | **Analysis Target**: `nexus-ts/nexusts` (github.com)
> Korean version: [`nexusts-vs-adonisjs-analysis.ko.md`](./nexusts-vs-adonisjs-analysis.ko.md)

---

## 1. Executive Summary

NexusTS positions itself as **"NestJS structure × Adonis productivity × Hono edge performance."** Compared to AdonisJS, the picture is more nuanced than the NestJS comparison.

**AdonisJS** (v7.3.4, June 2026) is a mature, production-proven framework — **11+ years old**, 23K GitHub stars, 363 contributors, 78K+ weekly npm downloads, 7.7K Discord community. It runs on Node.js 24+, has 45+ official packages, and its v7 release added end-to-end type safety and zero-config OpenTelemetry.

**NexusTS** (v0.9.13, June 2026) is a **3-month-old** framework by a single maintainer. It matches AdonisJS on most "batteries included" features, **exceeds it in several areas** (GraphQL, gRPC, resilience, standard decorators, Bun/Workers runtime), but **lacks the production maturity, community, ecosystem depth, and battle-testing** that AdonisJS has earned over a decade.

---

## 2. Project Maturity Comparison

| Metric | AdonisJS | NexusTS | Advantage |
|--------|----------|---------|-----------|
| **First release** | ~2015 (11+ years) | 2026-04-30 (3 months) | **AdonisJS** |
| **Latest stable** | v7.3.4 (June 2026) | v0.9.13 (June 2026) | — (both active) |
| **Runtime** | Node.js 24+ | Bun ≥1.3.10 + Cloudflare Workers | **NexusTS** (multi-runtime) |
| **GitHub stars** | ~23,000 | Unknown (new) | **AdonisJS** |
| **Contributors** | 363 | 4 (1 human, 2 bots, 1 AI) | **AdonisJS** |
| **npm downloads/week** | ~78,000 (`@adonisjs/core`) | Unknown | **AdonisJS** |
| **Official packages** | 45+ | 33 | **AdonisJS** (more depth) |
| **Community** | 7.7K Discord, 11K X, 45 sponsors | None | **AdonisJS** |
| **Production users** | Extensive (SaaS, APIs, internal tools) | None known | **AdonisJS** |
| **SemVer policy** | Strict (major = breaking) | Pre-v1.0 (minor may break) | **AdonisJS** |
| **Documentation** | 11+ years of docs | 138 files, 3 months | **AdonisJS** |
| **Bilingual docs** | English only | English + Korean | **NexusTS** |

---

## 3. Feature Parity Matrix

### 3.1 "Batteries Included" — Both Frameworks Ship

| Feature | AdonisJS | NexusTS | Parity |
|---------|----------|---------|--------|
| **HTTP server + routing** | `@adonisjs/core` (Edge router) | **Hono** (built-in) | ✅ Equal |
| **DI Container** | `@adonisjs/core` (IoC container) | `@nexusts/core` (DIContainer) | ✅ Equal |
| **ORM** | **Lucid** (`@adonisjs/lucid`) | `@nexusts/drizzle` (5 dialects) + `@nexusts/kysely` | ✅ Equal (different paradigms) |
| **Validation** | VineJS | **Zod** (direct, no wrapper) | ✅ Equal |
| **Auth** | `@adonisjs/auth` | `@nexusts/auth` (better-auth) | ✅ Equal |
| **Session** | `@adonisjs/session` | `@nexusts/session` (cookie/memory/Drizzle/Redis/KV) | ⚡ NexusTS (more backends) |
| **Cache** | `@adonisjs/cache` | `@nexusts/cache` (memory/Drizzle/Redis + tag invalidation) | ✅ Equal |
| **Logger** | `@adonisjs/logger` | `@nexusts/logger` (Pino, request-scoped) | ✅ Equal |
| **Config/Env** | `@adonisjs/config` | `@nexusts/config` (Zod-validated) | ✅ Equal |
| **Shield (Security)** | `@adonisjs/shield` (CSRF + CSP + HSTS) | `@nexusts/shield` (CSRF + HSTS + CSP + XFO + Referrer) | ⚡ NexusTS (more headers) |
| **Rate Limiting** | `@adonisjs/throttler` | `@nexusts/limiter` (3 strategies × 2 backends) | ✅ Equal |
| **Mail** | `@adonisjs/mail` | `@nexusts/mail` (SMTP/File/Null + MJML) | ✅ Equal |
| **Drive (File Storage)** | `@adonisjs/drive` (Local/S3/R2) | `@nexusts/drive` (Local/S3/R2/memory) | ✅ Equal |
| **Queue** | `@adonisjs/queue` | `@nexusts/queue` (BullMQ + Cloudflare + memory) | ✅ Equal |
| **Scheduler** | `@adonisjs/scheduler` | `@nexusts/schedule` (in-tree cron parser) | ✅ Equal |
| **Events** | `@adonisjs/events` | `@nexusts/events` (wildcards, priorities, guards) | ⚡ NexusTS (richer features) |
| **Static Files** | `@adonisjs/static` | `@nexusts/static` (ETag, Range, SPA fallback) | ✅ Equal |
| **Health Checks** | `@adonisjs/health` | `@nexusts/health` (live/ready/startup, multi-indicator) | ✅ Equal |
| **i18n** | `@adonisjs/i18n` | `@nexusts/i18n` (`Intl`-based, pluralization) | ✅ Equal |
| **Encryption** | `@adonisjs/encryption` | `@nexusts/crypto` (AES-256-GCM + HMAC) | ✅ Equal |
| **Password Hashing** | `@adonisjs/hash` | `@nexusts/crypto` (scrypt + argon2) | ✅ Equal |
| **CLI** | Ace (`node ace ...`) | `nx` CLI (12 commands, ACE-style) | ✅ Equal |
| **REPL** | `node ace repl` | `nx repl` (with DI introspection) | ✅ Equal |
| **View Engine** | Edge templates | **3 engines** (Rendu/Edge/Eta, auto-detected) | ⚡ NexusTS (more choices) |
| **Inertia.js** | `@adonisjs/inertia` | `@nexusts/view` (Inertia v3, React/Vue SSR) | ✅ Equal |
| **Testing** | `@adonisjs/testing` | Vitest + `new Application()` | ⚡ AdonisJS (dedicated module) |

### 3.2 What NexusTS Has That AdonisJS Does NOT

| Feature | @nexusts/* Module | AdonisJS Status |
|---------|-------------------|-----------------|
| **GraphQL** (SDL + code-first) | `@nexusts/graphql` | ❌ No first-party (community packages only) |
| **gRPC** (4 call types) | `@nexusts/grpc` | ❌ No first-party |
| **WebSocket** (Bun-native) | `@nexusts/ws` | ❌ No first-party |
| **SSE** (Server-Sent Events) | `@nexusts/sse` | ❌ No first-party |
| **Metrics/Prometheus** | `@nexusts/metrics` | ❌ No first-party |
| **Tracing/OpenTelemetry** | `@nexusts/tracing` | ✅ **NEW** in v7 (`@adonisjs/otel`) |
| **Resilience** (retry + circuit + bulkhead) | `@nexusts/resilience` | ❌ No first-party |
| **Feature Flags** (canary/A–B) | `@nexusts/feature-flag` | ❌ No first-party |
| **OpenAPI/Swagger** (Zod → OpenAPI 3.1) | `@nexusts/openapi` | ❌ No first-party |
| **File Upload** (`@Upload`/`@UploadedFile`) | `@nexusts/upload` | ✅ via bodyparser (less ergonomic) |
| **Kysely typed SQL builder** | `@nexusts/kysely` | ❌ No first-party |
| **Redis multi-runtime client** | `@nexusts/redis` | ✅ `@adonisjs/redis` (Node only) |
| **TC39 Standard ES Decorators** | `@nexusts/core` (v0.9+) | ❌ Legacy decorators only |
| **No reflect-metadata** | `@nexusts/core/di/safe-reflect` | ❌ Requires `reflect-metadata` |
| **Field injection** | `@Inject(Token) declare field: Type` | ❌ Constructor injection only |
| **Bun-native runtime** | Built-in | ❌ Node.js only |
| **Cloudflare Workers / Edge** | Built-in runtime adapter | ❌ Not supported |

### 3.3 What AdonisJS Has That NexusTS Does NOT

| Feature | AdonisJS | NexusTS Status | Severity |
|---------|----------|---------------|----------|
| **Production maturity** | 11+ years, thousands of apps | 3 months, zero known users | 🔴 **Critical** |
| **Lucid ORM** (Active Record) | Mature, rich query builder, migrations, factories, seeders | Drizzle (Data Mapper) — different paradigm, less OO | 🟡 Medium |
| **VineJS** (Adonis-native validation) | Dedicated validation framework, reuse across DTOs/schema | Zod (general-purpose) — more widely known | 🟢 Low |
| **Edge templates** (`.edge` files) | Mature, partials, layouts, components, markdown | 3 engines available (Edge supported as adapter) | 🟢 Low |
| **Ally (Social Auth)** | GitHub, Google, Twitter OAuth built-in | `@nexusts/auth` (better-auth — broader, but no dedicated Ally) | 🟡 Medium |
| **Bouncer (Authorization)** | `@adonisjs/bouncer` — abilities, policies, gates | ❌ No first-party authorization module | 🟡 **Important** |
| **CORS configuration** | Built-in via Shield | Via Hono's `cors()` middleware | 🟢 Low |
| **Bodyparser** | `@adonisjs/bodyparser` — configurable multipart, JSON, URL-encoded | Built into Hono + `@nexusts/upload` | 🟢 Low |
| **Serializer** | `@adonisjs/lucid` serializer — `$.snakeCase()`, `$.json()` | ❌ No equivalent | 🟢 Low |
| **Swagger/OpenAPI** | No first-party, but ecosystem has `adonis-swagger` | ✅ `@nexusts/openapi` (first-party) | 🟢 Low (NexusTS wins) |
| **Inspector / Debug toolbar** | First-party | ❌ Not available | 🟡 Medium |
| **Content collections** | `@adonisjs/content` (v7) — Markdown CMS | ❌ Not available | 🟢 Low |
| **Edge Markdown** | `edge-markdown` (v7) — Markdown rendering in Edge | ❌ Not available | 🟢 Low |
| **Vite integration** | First-party (`@adonisjs/vite`) | ❌ Not available | 🟡 Medium |
| **Validator (request-based)** | VineJS with `request.validateUsing()` | Manual `schema.parse()` or `@Validate` | 🟢 Low |
| **Test helpers** | `@adonisjs/testing` — `httpClient()`, `loginAs()`, etc. | Vitest only — no framework-level test helpers | 🟡 Medium |
| **Prettier / linter config** | First-party | Biome CLI (manual) | 🟢 Low |
| **Compiler / Build** | `@adonisjs/assembler` — bundling, HMR, TypeScript compilation | Bun built-in (no separate compiler needed) | 🟢 Low |
| **Ecosystem depth** | 45+ official packages, community plugins | 33 modules, no community plugins | 🟡 **Important** |

---

## 4. Architectural Philosophy Differences

| Dimension | AdonisJS | NexusTS |
|-----------|----------|---------|
| **Runtime** | Node.js 24+ only | Bun (primary) + Cloudflare Workers |
| **Decorators** | Legacy (`experimentalDecorators: true`) | **TC39 Standard ES Decorators** (v0.9+) |
| **DI Pattern** | Constructor injection + `@inject()` | Field injection `@Inject(Token) declare field: Type` |
| **Controller pattern** | Plain class with methods, route bindings in `start/routes.ts` | `@Controller('/path')` class with `@Get`/`@Post` method decorators |
| **Routing** | Route files (`start/routes.ts`), `Route.group()`, `Route.resource()` | 3 styles: Nest (decorators) / Adonis (route table) / Functional (Hono raw) |
| **ORM Paradigm** | **Active Record** (Lucid — `User.find()`, `user.save()`) | **Data Mapper** (Drizzle — `db.select().from(users)`) |
| **Validation** | VineJS (dedicated, DSL-style) | Zod (standard library, schema composition) |
| **Module system** | Service providers + config files + route files | `@Module({ controllers, providers, imports, exports })` (NestJS-style) |
| **CLI** | Ace (`node ace make:controller`) | `nx` (`nx make:controller`) |
| **Template engine** | Edge (primary, `.edge` files) | Rendu (default) + Edge + Eta (3 engines) |
| **Modularity** | Monolithic `@adonisjs/core` + service providers | **33 independent npm packages** — install only what you use |
| **Reflect-metadata** | Required (`reflect-metadata` polyfill) | ❌ Not needed (inline polyfill in safe-reflect.ts) |
| **Type safety** | End-to-end (v7, partial compile-time) | Compile-time via TypeScript + strict mode |

---

## 5. Stability Assessment

### 5.1 NexusTS Strengths vs AdonisJS

| Area | Assessment | Detail |
|------|-----------|--------|
| **Runtime modernity** | ⚡ **NexusTS** | Bun + CF Workers vs Node.js-only. Faster startup, hot reload, edge-native |
| **Decorator standard** | ⚡ **NexusTS** | TC39 standard (future-proof) vs legacy `experimentalDecorators` |
| **Bundle tree-shaking** | ⚡ **NexusTS** | 33 independent entry points vs monolithic `@adonisjs/core` |
| **Additional modules** | ⚡ **NexusTS** | GraphQL, gRPC, Resilience, Feature Flags — all first-party (AdonisJS lacks these) |
| **Performance** | ⚡ **NexusTS** | Hono-based (edge-optimized) vs AdonisJS on Node.js/Express-like router |
| **Bilingual docs** | ⚡ **NexusTS** | English + Korean vs English only |
| **reflect-metadata independence** | ⚡ **NexusTS** | No external polyfill needed vs AdonisJS requires `reflect-metadata` |

### 5.2 AdonisJS Strengths vs NexusTS

| Area | Assessment | Detail |
|------|-----------|--------|
| **Production track record** | 🏆 **AdonisJS** | 11+ years, thousands of production apps. NexusTS: 0 known production users |
| **Community ecosystem** | 🏆 **AdonisJS** | 23K stars, 363 contributors, 7.7K Discord, 45 sponsors, 45+ packages |
| **Maturity & stability** | 🏆 **AdonisJS** | Strict SemVer, v7.x, proven upgrade paths. NexusTS: pre-v1.0, breaking changes in minor |
| **Maintainer diversity** | 🏆 **AdonisJS** | Core team + 363 contributors. NexusTS: single maintainer (bus factor = 1) |
| **Authorization** | 🏆 **AdonisJS** | `@adonisjs/bouncer` — policies, gates, abilities. NexusTS: none |
| **Vite integration** | 🏆 **AdonisJS** | First-party `@adonisjs/vite`. NexusTS: none |
| **Testing toolkit** | 🏆 **AdonisJS** | `@adonisjs/testing` with `httpClient()`, `loginAs()`. NexusTS: Vitest only |
| **Ally (Social Auth)** | 🏆 **AdonisJS** | GitHub, Google, Twitter OAuth built-in. NexusTS: no equivalent |
| **Inspector/debug toolbar** | 🏆 **AdonisJS** | First-party. NexusTS: none |
| **Documentation depth** | 🏆 **AdonisJS** | 11 years of guides, recipes, tutorials. NexusTS: solid but 3 months old |

### 5.3 Risk Comparison

| Risk Factor | AdonisJS | NexusTS |
|-------------|----------|---------|
| **Framework abandonment** | 🟢 Low — large community, 45 sponsors | 🔴 **High** — single maintainer |
| **Runtime lock-in** | 🟢 Low — Node.js is universal | 🟡 Medium — Bun + Workers only (Node.js, Deno unsupported) |
| **Breaking changes** | 🟢 Low — strict SemVer (v7 → v8 with codemods) | 🔴 **High** — pre-v1.0, minor bumps may break |
| **Security vulnerability response** | 🟢 Proven over 11 years | 🟡 Unknown — no track record |
| **Package compatibility** | 🟢 45+ packages, 11 years | 🟡 33 packages, untested interop |
| **Learning curve investment** | 🟢 Transferable Node.js skills | 🟡 Bun-specific patterns (may not transfer) |
| **Hiring pool** | 🟢 78K weekly npm downloaders | 🔴 Virtually zero |

---

## 6. Performance (NexusTS benchmarks)

| Suite | NexusTS (req/s) | Hono raw (req/s) | Ratio |
|-------|:---------------:|:----------------:|:-----:|
| hello (plain text) | 48,200 | 91,500 | **52.7%** |
| json | 46,800 | 88,300 | **53.0%** |
| di | 45,100 | 89,000 | **50.7%** |
| middleware (10x no-op) | 44,500 | 86,200 | **51.6%** |

> **NexusTS is expected to outperform AdonisJS significantly** — Hono is a high-performance edge router (comparable to Fastify), while AdonisJS runs on a traditional Node.js HTTP layer. However, **no direct benchmarks exist** between the two frameworks.
> Source: `docs/benchmarks.ko.md` — Apple M2 / Bun 1.3.

---

## 7. Development Velocity

| Metric | NexusTS | AdonisJS |
|--------|---------|----------|
| **Project age** | 3 months (Apr–Jun 2026) | 11+ years (~2015–2026) |
| **Modules created** | 33 in 3 months | 45+ in 11 years |
| **Commits** | 517+ in 3 months | 10,000+ (estimated) |
| **Releases** | 30+ (0.1.0 → 0.9.13) | Hundreds (v1 → v7) |
| **Contributors** | 4 (1 human) | 363 |
| **TypeScript lines** | ~42,740 | TBD (~500K+ estimated) |

---

## 8. Final Recommendation

### Scenario Evaluation

| Use Case | Recommendation | Rationale |
|----------|---------------|-----------|
| **Production Node.js API** | ✅ **AdonisJS** | Proven, stable, large ecosystem, authorization, testing toolkit |
| **Bun-native project** | ✅ **NexusTS** | Bun-optimized, Cloudflare Workers, no Node.js dependency |
| **Full-stack SPA + SSR** | ✅ **Both viable** | Both have Inertia.js. AdonisJS has Vite integration; NexusTS has React/Vue SSR |
| **GraphQL API server** | ✅ **NexusTS** | First-party GraphQL vs AdonisJS requires community packages |
| **gRPC microservices** | ✅ **NexusTS** | First-party gRPC (4 call types). AdonisJS: none |
| **Edge / Cloudflare Workers** | ✅ **NexusTS** | Native Workers support. AdonisJS: not possible |
| **Large enterprise** | ✅ **AdonisJS** | Proven track record, community, authorization, audit trail |
| **Real-time app (WebSocket/SSE)** | ✅ **NexusTS** | First-party WS + SSE. AdonisJS: no first-party |
| **Prototype / MVP (Bun)** | ✅ **NexusTS** | Fast to scaffold, 36 examples, rich modules |
| **Prototype / MVP (Node)** | ✅ **AdonisJS** | Faster to find help/tutorials |

### AdonisJS Feature Gaps That NexusTS Fills

1. **GraphQL** — AdonisJS has no first-party GraphQL integration
2. **gRPC** — AdonisJS has no gRPC support (requires separate NestJS/microservices setup)
3. **Resilience patterns** — No retry/circuit/bulkhead in AdonisJS
4. **WebSocket** — No first-party WebSocket in AdonisJS (community `@adonisjs/ws` exists but is less mature)
5. **Cloudflare Workers** — AdonisJS is Node.js-only
6. **Standard decorators** — AdonisJS still uses legacy `experimentalDecorators`
7. **Bundle tree-shaking** — AdonisJS packages are more monolithic

### NexusTS Feature Gaps vs AdonisJS

1. **Authorization (Bouncer)** — No equivalent to `@adonisjs/bouncer`
2. **Social Auth (Ally)** — No GitHub/Google/Twitter OAuth module
3. **Vite integration** — No first-party Vite setup
4. **Testing toolkit** — No framework-level test helpers (`httpClient()`, `loginAs()`)
5. **Debug toolbar** — No development inspector/debug toolbar
6. **Production track record** — Zero known production deployments
7. **Authorization policies** — No policy/ability system for fine-grained access control

### Overall Score (1–10)

| Category | Score | Notes |
|----------|:-----:|-------|
| Feature completeness (vs AdonisJS) | **8.5/10** | Matches all batteries + exceeds in GraphQL, gRPC, Resilience, WS |
| Code quality / Architecture | **9/10** | Clean modular architecture, CI/CD, benchmarks |
| Documentation | **7/10** | Solid but 3 months vs 11 years of AdonisJS docs |
| Performance | **9/10** | Hono-based, expected to outperform AdonisJS significantly |
| Stability / Maturity | **4/10** | 3 months, single maintainer, no production cases |
| Community / Ecosystem | **2/10** | None vs 23K stars, 363 contributors, 45 sponsors |
| **Overall** | **6.5/10** | Technically impressive, but AdonisJS remains the production-safe choice |

---

> **Key Takeaway**: NexusTS matches AdonisJS on batteries-included features, **surpasses it in several modern capabilities** (GraphQL, gRPC, resilience, Bun/Workers, standard decorators). But AdonisJS's **11-year head start** in production validation, community, ecosystem depth, and specialized modules (Bouncer, Ally, Vite, debug toolbar) means NexusTS is **not yet a replacement for production AdonisJS workloads** — especially on Node.js.

---

## References

- [Migration from AdonisJS to NexusTS](./adonisjs-comparison.md)
- [NexusTS User Guide](../user-guide/README.md)
- [NexusTS Benchmarks](../benchmarks.ko.md)
- [NexusTS Changelog](../../CHANGELOG.md)
- [AdonisJS Official Site](https://adonisjs.com)
- [AdonisJS GitHub](https://github.com/adonisjs/core)
