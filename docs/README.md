# NexusTS Documentation

Welcome to the NexusTS documentation. NexusTS is a **Bun-native fullstack
framework** that combines the structure of NestJS, the productivity of
AdonisJS, and the edge performance of Hono.

이 문서는 영어가 기본(original)이며, 한국어 버전은 `*.ko.md` 파일로 제공됩니다.
This documentation is primarily in English; Korean translations are
provided in `*.ko.md` files.

> **Current version: v0.6.2** — `nx init` + `nx config` CLI. Two
> companion commands to `nx new`: `init` scaffolds into an existing
> directory (e.g. after `bun init`) without overwriting user files,
> and `config` updates `nx.config.ts` (+ `drizzle.config.ts` when
> Drizzle is selected) idempotently. No runtime API changes; 26
> modules unchanged. See [`../CHANGELOG.md`](../CHANGELOG.md) for
> the release notes.

---

## Index / 목차

| Section | English | 한국어 |
| ------- | ------- | ------ |
| **Changelog** (변경 로그) | [`../CHANGELOG.md`](../CHANGELOG.md) | [`../CHANGELOG.ko.md`](../CHANGELOG.ko.md) |
| **Design documents** (아키텍처 · 설계) | [`docs/design/`](./design/) | [`docs/design/`](./design/) (`*.ko.md`) |
| **User guide** (사용자 메뉴얼) | [`docs/user-guide/`](./user-guide/) | [`docs/user-guide/`](./user-guide/) (`*.ko.md`) |
| **Analysis** (분석 · 비교) | [`docs/analysis/`](./analysis/) | [`docs/analysis/`](./analysis/) (`*.ko.md`) |
| **API reference** (API 레퍼런스) | [`api-reference.md`](./api-reference.md) | [`api-reference.ko.md`](./api-reference.ko.md) |
| **Publishing & deployment** (npm 배포 가이드) | [`publishing/`](./publishing/) | [`publishing/README.ko.md`](./publishing/README.ko.md) |

---

## Modules shipped in v0.6.1 (26 total)

Every module is its own bundle entry point. Install only what you use.

| Module | Import path | Bundle subpath | Doc |
| ------ | ----------- | --------------- | --- |
| Core | `@nexusts/core` | `@nexusts/core` | (this folder) |
| CLI | `@nexusts/cli` | `nx` | [`user-guide/cli.md`](./user-guide/cli.md) |
| Auth | `@nexusts/auth` | `@nexusts/auth` | [`user-guide/auth.md`](./user-guide/auth.md) |
| Queue | `@nexusts/queue` | `@nexusts/queue` | [`user-guide/queue.md`](./user-guide/queue.md) |
| Schedule | `@nexusts/schedule` | `@nexusts/schedule` | [`user-guide/schedule.md`](./user-guide/schedule.md) |
| Events | `@nexusts/events` | `@nexusts/events` | [`user-guide/events.md`](./user-guide/events.md) |
| Session | `@nexusts/session` | `@nexusts/session` | [`user-guide/session.md`](./user-guide/session.md) |
| **Health** | `@nexusts/health` | `@nexusts/health` | [`user-guide/production-basics.md`](./user-guide/production-basics.md) |
| **Config** | `@nexusts/config` | `@nexusts/config` | [`user-guide/production-basics.md`](./user-guide/production-basics.md) |
| **Logger** | `@nexusts/logger` | `@nexusts/logger` | [`user-guide/production-basics.md`](./user-guide/production-basics.md) |
| **Static** | `@nexusts/static` | `@nexusts/static` | [`user-guide/production-basics.md`](./user-guide/production-basics.md) |
| **Limiter** | `@nexusts/limiter` | `@nexusts/limiter` | [`user-guide/cross-cutting-features.md`](./user-guide/cross-cutting-features.md) |
| **Shield** | `@nexusts/shield` | `@nexusts/shield` | [`user-guide/cross-cutting-features.md`](./user-guide/cross-cutting-features.md) |
| **Cache** | `@nexusts/cache` | `@nexusts/cache` | [`user-guide/cross-cutting-features.md`](./user-guide/cross-cutting-features.md) |
| **Drive** | `@nexusts/drive` | `@nexusts/drive` | [`user-guide/cross-cutting-features.md`](./user-guide/cross-cutting-features.md) |
| **Mail** | `@nexusts/mail` | `@nexusts/mail` | [`user-guide/cross-cutting-features.md`](./user-guide/cross-cutting-features.md) |
| **Drizzle** | `@nexusts/drizzle` | `@nexusts/drizzle` | [`user-guide/drizzle.md`](./user-guide/drizzle.md) |
| **OpenAPI** _(v0.4)_ | `@nexusts/openapi` | `@nexusts/openapi` | [`user-guide/openapi.md`](./user-guide/openapi.md) |
| **Upload** _(v0.4)_ | `@nexusts/upload` | `@nexusts/upload` | [`user-guide/upload.md`](./user-guide/upload.md) |
| **SSE** _(v0.4)_ | `@nexusts/sse` | `@nexusts/sse` | [`user-guide/sse.md`](./user-guide/sse.md) |
| **Tracing** _(v0.4)_ | `@nexusts/tracing` | `@nexusts/tracing` | [`user-guide/tracing.md`](./user-guide/tracing.md) |
| **Metrics** _(v0.4)_ | `@nexusts/metrics` | `@nexusts/metrics` | [`user-guide/metrics.md`](./user-guide/metrics.md) |
| **Request-scoped DI** _(v0.4)_ | `@nexusts/core` (core) | `@nexusts/core` | [`user-guide/request-scope.md`](./user-guide/request-scope.md) |
| **WebSockets** _(v0.5)_ | `@nexusts/ws` | `@nexusts/ws` | [`user-guide/ws.md`](./user-guide/ws.md) |
| **Crypto** _(v0.5)_ | `@nexusts/crypto` | `@nexusts/crypto` | [`user-guide/crypto.md`](./user-guide/crypto.md) |
| **i18n** _(v0.5)_ | `@nexusts/i18n` | `@nexusts/i18n` | [`user-guide/i18n.md`](./user-guide/i18n.md) |
| **Redis client** _(v0.5)_ | `@nexusts/redis` | `@nexusts/redis` | [`user-guide/redis.md`](./user-guide/redis.md) |
| **gRPC** _(v0.6)_ | `@nexusts/grpc` | `@nexusts/grpc` | [`user-guide/grpc.md`](./user-guide/grpc.md) |

---

## User guide · 사용자 메뉴얼

Step-by-step guides for building applications.
애플리케이션 개발을 위한 단계별 가이드.

| Guide | English | 한국어 |
| ----- | ------- | ------ |
| Getting started | [`user-guide/getting-started.md`](./user-guide/getting-started.md) | [`user-guide/getting-started.ko.md`](./user-guide/getting-started.ko.md) |
| Controllers & decorators | [`user-guide/controllers.md`](./user-guide/controllers.md) | [`user-guide/controllers.ko.md`](./user-guide/controllers.ko.md) |
| Dependency injection | [`user-guide/dependency-injection.md`](./user-guide/dependency-injection.md) | [`user-guide/dependency-injection.ko.md`](./user-guide/dependency-injection.ko.md) |
| Validation | [`user-guide/validation.md`](./user-guide/validation.md) | [`user-guide/validation.ko.md`](./user-guide/validation.ko.md) |
| View engines | [`user-guide/view-engines.md`](./user-guide/view-engines.md) | [`user-guide/view-engines.ko.md`](./user-guide/view-engines.ko.md) |
| Inertia.js adapter | [`user-guide/inertia.md`](./user-guide/inertia.md) | [`user-guide/inertia.ko.md`](./user-guide/inertia.ko.md) |
| **Authentication (better-auth)** | [`user-guide/auth.md`](./user-guide/auth.md) | [`user-guide/auth.ko.md`](./user-guide/auth.ko.md) |
| **Queue (BullMQ / Cloudflare Queues)** | [`user-guide/queue.md`](./user-guide/queue.md) | [`user-guide/queue.ko.md`](./user-guide/queue.ko.md) |
| **Schedule · `@Cron` decorator** | [`user-guide/schedule.md`](./user-guide/schedule.md) | [`user-guide/schedule.ko.md`](./user-guide/schedule.ko.md) |
| **Event System** | [`user-guide/events.md`](./user-guide/events.md) | [`user-guide/events.ko.md`](./user-guide/events.ko.md) |
| **Session (cookie / memory / Drizzle)** | [`user-guide/session.md`](./user-guide/session.md) | [`user-guide/session.ko.md`](./user-guide/session.ko.md) |
| **Production basics (health / config / logger / static)** | [`user-guide/production-basics.md`](./user-guide/production-basics.md) | [`user-guide/production-basics.ko.md`](./user-guide/production-basics.ko.md) |
| **Cross-cutting (limiter / shield / cache / drive / mail)** | [`user-guide/cross-cutting-features.md`](./user-guide/cross-cutting-features.md) | [`user-guide/cross-cutting-features.ko.md`](./user-guide/cross-cutting-features.ko.md) |
| **Drizzle ORM (default ORM)** | [`user-guide/drizzle.md`](./user-guide/drizzle.md) | [`user-guide/drizzle.ko.md`](./user-guide/drizzle.ko.md) |
| Runtime & deployment | [`user-guide/runtime-deployment.md`](./user-guide/runtime-deployment.md) | [`user-guide/runtime-deployment.ko.md`](./user-guide/runtime-deployment.ko.md) |
| **CLI · `nx` command runner** | [`user-guide/cli.md`](./user-guide/cli.md) | [`user-guide/cli.ko.md`](./user-guide/cli.ko.md) |
| **OpenAPI** _(v0.4)_ | [`user-guide/openapi.md`](./user-guide/openapi.md) | [`user-guide/openapi.ko.md`](./user-guide/openapi.ko.md) |
| **Upload** _(v0.4)_ | [`user-guide/upload.md`](./user-guide/upload.md) | [`user-guide/upload.ko.md`](./user-guide/upload.ko.md) |
| **SSE** _(v0.4)_ | [`user-guide/sse.md`](./user-guide/sse.md) | [`user-guide/sse.ko.md`](./user-guide/sse.ko.md) |
| **Tracing** _(v0.4)_ | [`user-guide/tracing.md`](./user-guide/tracing.md) | [`user-guide/tracing.ko.md`](./user-guide/tracing.ko.md) |
| **Metrics** _(v0.4)_ | [`user-guide/metrics.md`](./user-guide/metrics.md) | [`user-guide/metrics.ko.md`](./user-guide/metrics.ko.md) |
| **Request-scoped DI** _(v0.4)_ | [`user-guide/request-scope.md`](./user-guide/request-scope.md) | [`user-guide/request-scope.ko.md`](./user-guide/request-scope.ko.md) |
| **WebSockets** _(v0.5)_ | [`user-guide/ws.md`](./user-guide/ws.md) | [`user-guide/ws.ko.md`](./user-guide/ws.ko.md) |
| **Crypto** _(v0.5)_ | [`user-guide/crypto.md`](./user-guide/crypto.md) | [`user-guide/crypto.ko.md`](./user-guide/crypto.ko.md) |
| **i18n** _(v0.5)_ | [`user-guide/i18n.md`](./user-guide/i18n.md) | [`user-guide/i18n.ko.md`](./user-guide/i18n.ko.md) |
| **Redis client** _(v0.5)_ | [`user-guide/redis.md`](./user-guide/redis.md) | [`user-guide/redis.ko.md`](./user-guide/redis.ko.md) |
| **gRPC** _(v0.6)_ | [`user-guide/grpc.md`](./user-guide/grpc.md) | [`user-guide/grpc.ko.md`](./user-guide/grpc.ko.md) |
| **Testing the published package** _(dist/ 검증)_ | [`user-guide/testing-published-package.md`](./user-guide/testing-published-package.md) | [`user-guide/testing-published-package.ko.md`](./user-guide/testing-published-package.ko.md) |

---

## Design documents · 설계 문서

Architectural deep-dives for contributors and advanced users.
기여자 및 고급 사용자를 위한 아키텍처 심층 문서.

| Document | English | 한국어 |
| -------- | ------- | ------ |
| Architecture overview | [`design/architecture.md`](./design/architecture.md) | [`design/architecture.ko.md`](./design/architecture.ko.md) |
| DI container design | [`design/di-container.md`](./design/di-container.md) | [`design/di-container.ko.md`](./design/di-container.ko.md) |
| Inertia adapter design | [`design/inertia-adapter.md`](./design/inertia-adapter.md) | [`design/inertia-adapter.ko.md`](./design/inertia-adapter.ko.md) |
| Auth module design | [`design/auth.md`](./design/auth.md) | [`design/auth.ko.md`](./design/auth.ko.md) |
| Queue module design | [`design/queue.md`](./design/queue.md) | [`design/queue.ko.md`](./design/queue.ko.md) |
| Schedule module design | [`design/schedule.md`](./design/schedule.md) | [`design/schedule.ko.md`](./design/schedule.ko.md) |
| Session module design | [`design/session.md`](./design/session.md) | [`design/session.ko.md`](./design/session.ko.md) |

---

## Analysis · 비교 분석

| Comparison | English | 한국어 |
| ---------- | ------- | ------ |
| NestJS feature gap | [`analysis/nestjs-comparison.md`](./analysis/nestjs-comparison.md) | [`analysis/nestjs-comparison.ko.md`](./analysis/nestjs-comparison.ko.md) |
| AdonisJS feature gap | [`analysis/adonisjs-comparison.md`](./analysis/adonisjs-comparison.md) | [`analysis/adonisjs-comparison.ko.md`](./analysis/adonisjs-comparison.ko.md) |

---

## Publishing & deployment · npm 배포

How the 31 NexusTS packages plus the `create-nexusts` scaffolder
get published to the npm registry.

| 문서 | 내용 | 한국어 |
| ---- | ---- | ------ |
| [Publishing overview](./publishing/README.md) | Index of the publishing docs, plus a TL;DR for maintainers | [README.ko.md](./publishing/README.ko.md) |
| [Local publish](./publishing/local-publish.md) | How to run `bun run publish:all` from your machine, including the npm 11 device flow | [local-publish.ko.md](./publishing/local-publish.ko.md) |
| [npm rate limit](./publishing/npm-rate-limit.ko.md) | The 25/24h per-user publish limit — now resolved; all 31 packages are on the registry | — |

---

## Quick links · 바로가기

- **Repository layout** — see [`../README.md`](../README.md)
- **Source structure** — [`src/core/`](../src/core/) and the 17 module folders
- **Tests** — [`../tests/`](../tests/)
- **Changelog** — [`../CHANGELOG.md`](../CHANGELOG.md)

---

## Conventions · 작성 규칙

- Code samples target **Bun ≥ 1.1** by default. Cloudflare notes are
  called out explicitly when relevant.
- TypeScript is the only supported language. Decorators require
  `experimentalDecorators: true` in `tsconfig.json`.
- All examples import from the public entry point (`@nexusts/core`,
  `@nexusts/drizzle`, `@nexusts/cache`, etc.) unless they intentionally
  demonstrate a deep-import.

---

## Versioning · 버전 정책

| Version | Status | Notes |
| ------- | ------ | ----- |
| **v0.1** | ✅ Shipped 2026-04-30 | MVC core, DI, validation, Rendu/Edge/Inertia adapters |
| **v0.2** | ✅ Shipped 2026-05-15 | Session auth, BullMQ queue, event system, scheduler, CLI |
| **v0.3** | ✅ Shipped 2026-06-21 | Production basics, cross-cutting, Drizzle ORM (default) |
| **v0.4** | ✅ Shipped 2026-06-22 | Observability (openapi, upload, sse, tracing, metrics) + request-scoped DI |
| **v0.5** | ✅ Shipped 2026-06-23 | `@nexusts/ws` (Hono WebSocket integration, Bun + Node) + `@nexusts/crypto` (encryption + hashing) |
| **v0.6** | ✅ Shipped 2026-06-24 | `@nexusts/grpc` (reflection-based gRPC server + typed client) + publishable `dist/` pipeline (`bin` field, `dist/src/*` flatten) |
| **v0.6.1** | ✅ Shipped 2026-06-25 | Patch: `nexus` → `@nexusts/core` rename (191 files), `bin` field fix, `dist/src/*` flatten; no new features |
| **v0.6.2** | ✅ **Current** 2026-06-26 | Patch: `nx init` (non-destructive scaffold) + `nx config` (idempotent nx.config.ts / drizzle.config.ts updater) + `LICENSE` and publish metadata. No API changes. |
| v1.0 | Planned | Stable public API surface (semver guarantees), multi-runtime CI, performance benchmarks, long-term LTS |

The framework follows [Semantic Versioning](https://semver.org/). Until
v1.0, minor version bumps may include breaking changes. See
[`../CHANGELOG.md`](../CHANGELOG.md) for the full release history.
