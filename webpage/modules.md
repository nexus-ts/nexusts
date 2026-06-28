---
title: Module Overview
description: All 33 @nexusts/* modules
---

# Module Overview

NexusTS ships **33 independent packages** under the `@nexusts/*` namespace. Each is a separate entry point — you only install what you import.

## Core

| Package | Description |
|---------|-------------|
| `@nexusts/core` | MVC + DI + routing + validation + view. The framework core. |
| `@nexusts/cli` | `nx` command runner. Scaffolding, generators, REPL, route inspector. |

## Database

| Package | Description |
|---------|-------------|
| `@nexusts/drizzle` | Default ORM. 5 dialects (postgres, mysql, sqlite, bun-sqlite, d1). Migrations, seeding `Factory<T>`, `DrizzleModel`, `DrizzleRepository`. |
| `@nexusts/kysely` | Typed SQL query builder. `KyselyService`, `KyselyRepository` (Lucid-style), `KyselyModule.forRoot()`. Built-in `Migrator`. All Kysely dialects. |

## API & Communication

| Package | Description |
|---------|-------------|
| `@nexusts/graphql` | SDL-first + code-first GraphQL endpoint. `@Resolver`/`@Query`/`@Mutation`/`@Arg` decorators. `autoSchema: true` for SDL synthesis. |
| `@nexusts/grpc` | Reflection-based gRPC server + typed client. All 4 call types: unary, server-stream, client-stream, bidi. |
| `@nexusts/ws` | WebSocket gateway with room management and broadcasting. |
| `@nexusts/sse` | Server-Sent Events support. |
| `@nexusts/openapi` | OpenAPI 3.1 spec generation + Scalar UI. |

## Resilience

| Package | Description |
|---------|-------------|
| `@nexusts/resilience` | Retry (4 backoff strategies) + Circuit Breaker + Bulkhead. Cross-pod stores (Redis/Drizzle/Memory). HTTP admin API. **Zero new dependencies.** |
| `@nexusts/feature-flag` | Canary / A/B testing. `isEnabled(flag, ctx)`, rollout %, allowlist/denylist. `@FeatureFlag()` guard decorator. |

## Frontend

| Package | Description |
|---------|-------------|
| `@nexusts/view` | View engines: Inertia.js v3 (React/Vue SPA + SSR), Rendu, Edge (Adonis-style), Eta (EJS-style). |

## Auth & Security

| Package | Description |
|---------|-------------|
| `@nexusts/auth` | better-auth integration. |
| `@nexusts/shield` | CSRF + HSTS + CSP + X-Frame-Options + Referrer-Policy + CORS guard. |
| `@nexusts/limiter` | Rate limiting. 3 strategies × memory / Drizzle storage. |
| `@nexusts/session` | Session management. Memory / Drizzle / Redis backends. |

## Observability

| Package | Description |
|---------|-------------|
| `@nexusts/logger` | Structured logging (Pino). |
| `@nexusts/metrics` | Prometheus metrics. |
| `@nexusts/tracing` | OpenTelemetry tracing. |

## Infrastructure

| Package | Description |
|---------|-------------|
| `@nexusts/cache` | Application cache. Memory (LRU) / Drizzle / Redis backends. Tag invalidation. |
| `@nexusts/config` | Environment-aware configuration with Zod schemas. |
| `@nexusts/crypto` | AES-256-GCM encryption + HMAC + scrypt/argon2 hashing. Single APP_KEY for all operations. |
| `@nexusts/drive` | File storage abstraction. Memory / Local / S3 / R2 drivers. |
| `@nexusts/events` | Event emitter + listener decorators (`@OnEvent`). |
| `@nexusts/health` | Health check endpoints. |
| `@nexusts/i18n` | Internationalization. Intl-based date/number/currency formatting. JSON message catalogs. |
| `@nexusts/mail` | Outbound email. Null / File / SMTP transports. MJML rendering. |
| `@nexusts/queue` | Job queue. BullMQ / Redis backends. |
| `@nexusts/redis` | Runtime-aware Redis client (Bun / Workers KV). |
| `@nexusts/schedule` | Cron / Interval / Timeout scheduler. In-tree cron parser, zero deps. |
| `@nexusts/static` | Static file serving with ETag, Range, path-traversal protection. |
| `@nexusts/upload` | File upload helper. |

## Details

| Package | Description |
|---------|-------------|
| `@nexusts/drizzle` | Drizzle ORM wrapper. 5 dialects, migrations, seeding, `DrizzleModel`, `DrizzleRepository`. |
| `@nexusts/grpc` | gRPC server + typed client. Reflection-based, loads `.proto` at runtime. |
| `@nexusts/graphql` | GraphQL endpoint. SDL-first + code-first (`autoSchema: true`). In-bundle GraphiQL. |
