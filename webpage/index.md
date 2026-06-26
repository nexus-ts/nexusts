---
layout: home

title: NexusTS
titleTemplate: Bun-native Fullstack Framework

hero:
  name: NexusTS
  text: Bun-native fullstack framework
  tagline: TC39 standard decorators · 33 modular packages · Install only what you import · Zero overhead for what you don't
  image:
    src: /logo.svg
    alt: NexusTS
  actions:
    - theme: brand
      text: Get Started
      link: /getting-started
    - theme: alt
      text: View on GitHub
      link: https://github.com/nexus-ts/nexusts

features:
  - icon: 🚀
    title: Bun-native
    details: Built specifically for Bun.js runtime. Native TypeScript, fast startup, and hot reload. No waiting for compilers.
  - icon: 📦
    title: 33 Modular Packages
    details: Each feature is its own `@nexusts/*` package. Install only what you use. No bloat, no dead code.
  - icon: 🎯
    title: Standard Decorators (TC39)
    details: TC39 standard ES decorators — no `experimentalDecorators`, no `reflect-metadata`. Field injection, `ctx.req.*` methods. Dual-mode backward compatibility with legacy decorators.
  - icon: 🔌
    title: Full Ecosystem
    details: GraphQL, gRPC (incl. streaming), WebSocket, SSE, Queue, Scheduler, Cache, Logger, Metrics, Tracing — all first-party.
  - icon: 🛡️
    title: Resilience Built-in
    details: Retry, Circuit Breaker, Bulkhead. Cross-pod stores (Redis/Drizzle). HTTP admin API. Feature flags for canary deployments.
  - icon: ⚡
    title: Battle-tested CI
    details: 348+ tests across Bun, Node.js 22, Cloudflare Workers, and 3 Drizzle dialects. Smoke-tested on every commit.
---

## What is NexusTS?

**NexusTS** is a Bun-native fullstack TypeScript framework with a modular architecture. It ships **33 independent packages** under the `@nexusts/*` namespace — you only install what you import.

The framework provides a complete set of tools for building production backend services:

- **Standard decorators (TC39)** — No `experimentalDecorators`, no `reflect-metadata`. NestJS-style `@Module`, `@Controller`, `@Injectable` with field injection and `ctx.req.*` methods
- **Database** — Drizzle ORM with 5 dialects (PostgreSQL, MySQL, SQLite, bun-sqlite, Cloudflare D1)
- **GraphQL** — SDL-first + code-first with `autoSchema: true`
- **gRPC** — All 4 call types: unary, server-stream, client-stream, bidi
- **Resilience** — Retry, Circuit Breaker, Bulkhead with cross-pod stores
- **Auth** — better-auth integration
- **Realtime** — WebSocket, SSE, Queue, Scheduler
- **Observability** — Logger (Pino), Metrics (Prometheus), Tracing (OpenTelemetry)
- **Frontend** — Inertia.js v3 adapter (React/Vue SPA + SSR)
- **CLI** — `nx` command runner with scaffolding, generators, REPL

## Quick Start

```bash
npm create nexusts@latest my-app
cd my-app
bun install
bun run dev
```

```bash
# Or use the CLI directly:
bunx nx new my-app --view inertia --orm drizzle --db bun-sqlite --frontend react
```

## Architecture

```
@nexusts/core       → MVC + DI + routing + validation + view
@nexusts/cli        → nx CLI (scaffold, generate, seed, repl)
@nexusts/drizzle    → Default ORM (5 dialects)
@nexusts/graphql    → SDL-first + code-first GraphQL
@nexusts/grpc       → gRPC server + typed client (all streaming)
@nexusts/resilience → Retry + Circuit Breaker + Bulkhead
@nexusts/auth       → better-auth integration
@nexusts/view       → Inertia.js v3 + Rendu + Edge + Eta
@nexusts/ws         → WebSocket
@nexusts/sse        → Server-Sent Events
@nexusts/cache      → Memory / Drizzle / Redis backends
@nexusts/queue      → Job queue (BullMQ / Redis)
@nexusts/schedule   → Cron / Interval / Timeout
@nexusts/feature-flag → Canary / A/B testing
... and 19 more →
```

## Why NexusTS?

| Feature | NexusTS | NestJS | AdonisJS |
|---------|---------|--------|----------|
| **Decorators** | ✅ **TC39 standard ES** | ⚠️ experimentalDecorators | ⚠️ experimentalDecorators |
| **Runtime** | Bun (native) | Node.js | Node.js |
| **Packages** | 32 (opt-in) | Monolithic | Monolithic |
| **GraphQL** | ✅ Built-in | ✅ @nestjs/graphql | ✅ @adonisjs/graphql |
| **gRPC streaming** | ✅ Built-in | ✅ @nestjs/microservices | ❌ DIY |
| **Resilience** | ✅ Built-in | ⚠️ third-party | ❌ DIY |
| **Feature flags** | ✅ Built-in | ❌ | ❌ |
| **Inertia SSR** | ✅ Built-in | ❌ | ✅ Built-in |
| **CLI** | ✅ `nx` (ACE-style) | ✅ NestJS CLI | ✅ Ace |
| **License** | MIT | MIT | MIT |

## v0.9.7 — Latest Release

**Standard Decorator Migration Complete.** Every decorator in the framework now supports dual-mode (TC39 standard + legacy). Core `@Inject`/`@Injectable` export fixed for standard-mode field injection. 18 modules converted to dual-mode decorators. 15 modules migrated to standard DI patterns. gRPC tests re-enabled. 348 tests. 33 packages.

See the [Changelog](https://github.com/nexus-ts/nexusts/blob/main/CHANGELOG.md) for details.
