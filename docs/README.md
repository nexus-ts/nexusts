# NexusJS Documentation

Welcome to the NexusJS documentation. NexusJS is a **Bun-native fullstack
framework** that combines the structure of NestJS, the productivity of
AdonisJS, and the edge performance of Hono.

이 문서는 영어가 기본(original)이며, 한국어 버전은 `*.ko.md` 파일로 제공됩니다.
This documentation is primarily in English; Korean translations are
provided in `*.ko.md` files.

---

## 目录 / 목차

| Section | English | 한국어 |
| ------- | ------- | ------ |
| **Design documents** (아키텍처 · 설계) | [`docs/design/`](./design/) | [`docs/design/`](./design/) (`*.ko.md`) |
| **User guide** (사용자 메뉴얼) | [`docs/user-guide/`](./user-guide/) | [`docs/user-guide/`](./user-guide/) (`*.ko.md`) |
| **API reference** (API 레퍼런스) | [`docs/api-reference.md`](./api-reference.md) | [`docs/api-reference.ko.md`](./api-reference.ko.md) |

---

## Design documents · 설계 문서

Architectural deep-dives for contributors and advanced users.
기여자 및 고급 사용자를 위한 아키텍처 심층 문서.

| Document | English | 한국어 |
| -------- | ------- | ------ |
| Architecture overview | [`architecture.md`](./design/architecture.md) | [`architecture.ko.md`](./design/architecture.ko.md) |
| DI container design | [`di-container.md`](./design/di-container.md) | [`di-container.ko.md`](./design/di-container.ko.md) |
| Inertia adapter design | [`inertia-adapter.md`](./design/inertia-adapter.md) | [`inertia-adapter.ko.md`](./design/inertia-adapter.ko.md) |
| Auth module design | [`auth.md`](./design/auth.md) | [`auth.ko.md`](./design/auth.ko.md) |
| Queue module design | [`queue.md`](./design/queue.md) | [`queue.ko.md`](./design/queue.ko.md) |
| Schedule module design | [`schedule.md`](./design/schedule.md) | [`schedule.ko.md`](./design/schedule.ko.md) |

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
| Runtime & deployment | [`user-guide/runtime-deployment.md`](./user-guide/runtime-deployment.md) | [`user-guide/runtime-deployment.ko.md`](./user-guide/runtime-deployment.ko.md) |
| **CLI · `nx` command runner** | [`user-guide/cli.md`](./user-guide/cli.md) | [`user-guide/cli.ko.md`](./user-guide/cli.ko.md) |

---

## Quick links · 바로가기

- **Repository layout** — see [`README.md`](../README.md)
- **Source structure** — [`src/core/`](../src/core/)
- **Tests** — [`tests/`](../tests/)

---

## Conventions · 작성 규칙

- Code samples target **Bun ≥ 1.1** by default. Node/Cloudflare notes are
  called out explicitly when relevant.
- TypeScript is the only supported language. Decorators require
  `experimentalDecorators: true` in `tsconfig.json`.
- All examples import from the public entry point (`nexus`,
  `nexus/view/inertia`, etc.) unless they intentionally demonstrate a
  deep-import.

---

## Versioning · 버전 정책

| Version | Status | Notes |
| ------- | ------ | ----- |
| **v0.1** | Current | MVC core, DI, validation, Rendu/Edge/Inertia adapters |
| **v0.2** | Planned | Session auth, JWT, BullMQ queue, event system, scheduler |
| **v0.3** | Planned | Cloudflare D1/KV/R2/Durable Objects adapters, AI agent module, MCP server |
| **v0.4** | Planned | Edge streaming view engine |

The framework follows [Semantic Versioning](https://semver.org/). Until
v1.0, minor version bumps may include breaking changes.
