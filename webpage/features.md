---
title: Features
description: NexusTS feature overview
---

# Features

NexusTS ships **32 independent modules** — each is its own `@nexusts/*` package, so you install only what you use.

## Core Framework

| Feature | Package | Status |
|---------|---------|--------|
| **TC39 standard ES decorators** (no `experimentalDecorators`, no `reflect-metadata`) | `@nexusts/core` | ✅ **v0.9.0** |
| Field injection (`@Inject(Token) declare field: Type`) | `@nexusts/core` | ✅ **v0.9.0** |
| `ctx.req.*` methods (replaces `@Param`/`@Body`/`@Query`) | `@nexusts/core` | ✅ **v0.9.0** |
| MVC + Dependency Injection | `@nexusts/core` | ✅ Core |
| Routing (Nest/Adonis/functional styles) | `@nexusts/core` | ✅ Core |
| Request Validation (Zod) | `@nexusts/core` | ✅ Core |
| Exception Filters / Interceptors / Guards | `@nexusts/core` | ✅ v0.7.3 |
| Lifecycle Hooks (`OnModuleInit`, etc.) | `@nexusts/core` | ✅ v0.7.3 |
| Request-scoped DI | `@nexusts/core` | ✅ v0.4 |

## Database & ORM

| Feature | Package | Status |
|---------|---------|--------|
| Drizzle ORM (PostgreSQL, MySQL, SQLite, bun-sqlite, D1) | `@nexusts/drizzle` | ✅ v0.3 |
| Auto-migrations (`nx db:generate`, `nx db:migrate`) | `@nexusts/drizzle` | ✅ v0.6.5 |
| Seeding (`nx db:seed` + `Factory<T>`) | `@nexusts/drizzle` | ✅ v0.8.3 |

## API & Communication

| Feature | Package | Status |
|---------|---------|--------|
| GraphQL (SDL-first + code-first, `autoSchema: true`) | `@nexusts/graphql` | ✅ v0.7.7 |
| gRPC (unary + server/client/bidi streaming) | `@nexusts/grpc` | ✅ v0.8.2 |
| WebSocket | `@nexusts/ws` | ✅ v0.5 |
| Server-Sent Events | `@nexusts/sse` | ✅ v0.4 |
| OpenAPI 3.1 + Scalar UI | `@nexusts/openapi` | ✅ v0.4 |

## Resilience & Reliability

| Feature | Package | Status |
|---------|---------|--------|
| Retry (4 backoff strategies) | `@nexusts/resilience` | ✅ v0.7.0 |
| Circuit Breaker (with HTTP admin API) | `@nexusts/resilience` | ✅ v0.8.0 |
| Bulkhead | `@nexusts/resilience` | ✅ v0.7.0 |
| Cross-pod stores (Redis / Drizzle / Memory) | `@nexusts/resilience` | ✅ v0.8.1 |
| Eager `applyResilience()` auto-wrap | `@nexusts/resilience` | ✅ v0.8.0 |
| Feature flags (canary / A/B testing) | `@nexusts/feature-flag` | ✅ v0.8.0 |

## Frontend

| Feature | Package | Status |
|---------|---------|--------|
| Inertia.js v3 (React / Vue SPA + SSR) | `@nexusts/view` | ✅ v0.8.4 |
| Rendu template engine | `@nexusts/view` | ✅ v0.2 |
| Edge template engine (Adonis-style) | `@nexusts/view` | ✅ v0.6 |
| Eta template engine (EJS-style) | `@nexusts/view` | ✅ v0.6 |

## Observability

| Feature | Package | Status |
|---------|---------|--------|
| Structured logging (Pino) | `@nexusts/logger` | ✅ v0.3 |
| Prometheus metrics | `@nexusts/metrics` | ✅ v0.4 |
| OpenTelemetry tracing | `@nexusts/tracing` | ✅ v0.4 |

## Security

| Feature | Package | Status |
|---------|---------|--------|
| better-auth integration | `@nexusts/auth` | ✅ v0.2 |
| CSRF / HSTS / CSP / X-Frame-Options | `@nexusts/shield` | ✅ v0.3 |
| CORS guard | `@nexusts/shield` | ✅ v0.8.0 |
| Rate limiting (3 strategies) | `@nexusts/limiter` | ✅ v0.3 |
| Session management | `@nexusts/session` | ✅ v0.2 |
| Encryption (AES-256-GCM + HMAC + scrypt) | `@nexusts/crypto` | ✅ v0.5 |

## Infrastructure

| Feature | Package | Status |
|---------|---------|--------|
| Cache (Memory / Drizzle / Redis) | `@nexusts/cache` | ✅ v0.3 |
| Job queue (BullMQ / Redis) | `@nexusts/queue` | ✅ v0.2 |
| Scheduler (Cron / Interval / Timeout) | `@nexusts/schedule` | ✅ v0.2 |
| Event system | `@nexusts/events` | ✅ v0.2 |
| Static file serving | `@nexusts/static` | ✅ v0.3 |
| File storage (Memory / Local / S3 / R2) | `@nexusts/drive` | ✅ v0.3 |
| Email (Null / File / SMTP / MJML) | `@nexusts/mail` | ✅ v0.3 |
| Configuration management | `@nexusts/config` | ✅ v0.3 |
| i18n (Intl-based, pluralization) | `@nexusts/i18n` | ✅ v0.5 |
| Redis client (Bun / Node / Workers KV) | `@nexusts/redis` | ✅ v0.5 |
| File upload helper | `@nexusts/upload` | ✅ v0.4 |
| Health checks | `@nexusts/health` | ✅ v0.3 |

## CLI

| Feature | Status |
|---------|--------|
| `nx init` / `nx new` — project scaffolding | ✅ |
| `nx make:controller`, `make:service`, `make:crud` — generators | ✅ |
| `nx make:model`, `make:repository`, `make:module` | ✅ |
| `nx make:migration`, `make:auth`, `make:schedule` | ✅ |
| `nx db:generate` / `db:migrate` / `db:seed` | ✅ |
| `nx route:list` — route inspector | ✅ |
| `nx repl` — interactive debug console | ✅ |
| `nx info` — system diagnostics | ✅ |
