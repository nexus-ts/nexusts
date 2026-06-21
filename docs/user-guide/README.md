# User Guide · 사용자 메뉴얼

Step-by-step guides for building applications with NexusJS.
NexusJS로 애플리케이션을 개발하기 위한 단계별 가이드.

| Guide | English | 한국어 |
| ----- | ------- | ------ |
| Getting started | [`getting-started.md`](./getting-started.md) | [`getting-started.ko.md`](./getting-started.ko.md) |
| Controllers & decorators | [`controllers.md`](./controllers.md) | [`controllers.ko.md`](./controllers.ko.md) |
| Dependency injection | [`dependency-injection.md`](./dependency-injection.md) | [`dependency-injection.ko.md`](./dependency-injection.ko.md) |
| Validation | [`validation.md`](./validation.md) | [`validation.ko.md`](./validation.ko.md) |
| View engines | [`view-engines.md`](./view-engines.md) | [`view-engines.ko.md`](./view-engines.ko.md) |
| Inertia.js adapter | [`inertia.md`](./inertia.md) | [`inertia.ko.md`](./inertia.ko.md) |
| **Authentication (better-auth)** | [`auth.md`](./auth.md) | [`auth.ko.md`](./auth.ko.md) |
| **Queue (BullMQ / Cloudflare Queues)** | [`queue.md`](./queue.md) | [`queue.ko.md`](./queue.ko.md) |
| **Schedule · `@Cron` decorator** | [`schedule.md`](./schedule.md) | [`schedule.ko.md`](./schedule.ko.md) |
| **Event System** | [`events.md`](./events.md) | [`events.ko.md`](./events.ko.md) |
| **Session (cookie / memory / Redis)** | [`session.md`](./session.md) | [`session.ko.md`](./session.ko.md) |
| **Production basics (health / config / logger / static)** | [`production-basics.md`](./production-basics.md) | [`production-basics.ko.md`](./production-basics.ko.md) |
| **Cross-cutting (limiter / shield / cache / drive / mail)** | [`cross-cutting-features.md`](./cross-cutting-features.md) | [`cross-cutting-features.ko.md`](./cross-cutting-features.ko.md) |
| **Drizzle ORM (default ORM)** | [`drizzle.md`](./drizzle.md) | [`drizzle.ko.md`](./drizzle.ko.md) |
| **OpenAPI 3.1 + Scalar UI (v0.4)** | [`openapi.md`](./openapi.md) | [`openapi.ko.md`](./openapi.ko.md) |
| Runtime & deployment | [`runtime-deployment.md`](./runtime-deployment.md) | [`runtime-deployment.ko.md`](./runtime-deployment.ko.md) |
| **CLI · `nx` command runner** | [`cli.md`](./cli.md) | [`cli.ko.md`](./cli.ko.md) |

---

## Reading order · 읽는 순서

If you're new to NexusJS, read in this order:
처음이시면 다음 순서로 읽으세요.

1. **Getting started** — install, scaffold, run.
2. **Controllers & decorators** — the basic building blocks.
3. **Dependency injection** — how services wire together.
4. **Validation** — Zod integration via `@Validate`.
5. **View engines** — Rendu, Edge, or Inertia?
6. **Inertia.js adapter** — full SPA UX without an API.
7. **Runtime & deployment** — Bun / Node / Cloudflare Workers.

---

## Conventions · 작성 규칙

- All examples use **Bun** as the default runtime. Node and Cloudflare
  notes are called out explicitly when relevant.
- Code samples assume `import 'reflect-metadata'` is included once at the
  application entry point.
- TypeScript decorators require `experimentalDecorators: true` in
  `tsconfig.json` (and `emitDecoratorMetadata: true` if you want bare-type
  constructor injection).
- Imports use the public entry point `nexus` unless the example
  intentionally demonstrates a deep import.
