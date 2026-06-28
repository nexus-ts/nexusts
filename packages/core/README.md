# @nexusts/core

> **NexusTS Core** — Bun-native fullstack framework. Install this and you have a working MVC + DI + routing + validation stack.

## What's included

| Capability | Description |
| ---------- | ----------- |
| **MVC** | `@Controller`, `@Module`, `@Injectable`, `@Inject` |
| **DI** | Field injection with singleton / transient / request scopes. No `experimentalDecorators` or `reflect-metadata` required. |
| **Routing** | Three styles: Nest decorators, Adonis-style router, Hono functional |
| **Validation** | `@Validate()` with Zod schemas, automatic 422 responses |
| **View engines** | Rendu (default), Edge, Eta, Inertia.js v3 (React + Vue) |
| **CLI** | `nx` command runner: `new`, `init`, `make:*`, `db:*`, `repl` |
| **Hono server** | Underlying HTTP server (Bun / Cloudflare Workers) |

## Install

```bash
bun add @nexusts/core
bunx @nexusts/core init
```

That's it. No additional dependencies required to get a working app.

## Optional modules

`@nexusts/core` is enough for most apps. Add individual `@nexusts/*` packages
as you need them — each is a separately-installed npm package with its own
peer dependencies. The peer deps below are **optional** — the module
loads without them, but its public methods throw a clear error pointing
to the install command on first call.

| Module | What it adds | Extra install |
| ------ | ------------ | ------------- |
| `@nexusts/auth` | better-auth integration | `bun add better-auth` |
| `@nexusts/cache` | Application cache (memory / Drizzle) | _(none)_ |
| `@nexusts/cli` | CLI command runner (`nx`) | _(bundled with core)_ |
| `@nexusts/config` | Zod-validated configuration | _(none)_ |
| `@nexusts/crypto` | AES-256-GCM + HMAC + scrypt/argon2 | _(none)_ |
| `@nexusts/drive` | File storage (Local / S3 / R2 / memory) | _(none)_ |
| `@nexusts/drizzle` | Drizzle ORM (default, 5 dialects) | `bun add drizzle-orm` |
| `@nexusts/events` | Event emitter with wildcards / priorities | _(none)_ |
| `@nexusts/graphql` | SDL-first GraphQL endpoint | `bun add graphql` |
| `@nexusts/grpc` | gRPC server + client (reflection-based) | _(none)_ |
| `@nexusts/health` | Health check endpoints | _(none)_ |
| `@nexusts/i18n` | Internationalization (Intl-based) | _(none)_ |
| `@nexusts/limiter` | Rate limiting (3 strategies) | _(none)_ |
| `@nexusts/logger` | Pino-backed structured logging | _(none)_ |
| `@nexusts/mail` | Outbound email (SMTP / File / Null) | _(none)_ |
| `@nexusts/metrics` | Prometheus / OpenMetrics | _(none)_ |
| `@nexusts/openapi` | OpenAPI 3.1 spec generation | _(none)_ |
| `@nexusts/queue` | Background jobs (BullMQ / Cloudflare / memory) | `bun add bullmq` + `bun add ioredis` |
| `@nexusts/redis` | Runtime-aware Redis client | `bun add ioredis` |
| `@nexusts/resilience` | Retry + Circuit Breaker + Bulkhead | _(none)_ |
| `@nexusts/schedule` | Cron scheduling (`@Cron` decorator) | _(none)_ |
| `@nexusts/session` | Cookie / Memory / Drizzle sessions | _(none)_ |
| `@nexusts/shield` | CSRF / HSTS / CSP security | _(none)_ |
| `@nexusts/sse` | Server-Sent Events streaming | _(none)_ |
| `@nexusts/static` | Static file serving (ETag / Range) | _(none)_ |
| `@nexusts/tracing` | OpenTelemetry distributed tracing | `bun add @opentelemetry/api` |
| `@nexusts/upload` | Multipart file upload | _(none)_ |
| `@nexusts/view` | View engines + Inertia.js v3 | _(none)_ |
| `@nexusts/ws` | WebSockets (Bun native) | _(Bun has WS built-in)_ |

See [`docs/user-guide/`](../../docs/user-guide/) for the full module list.

## Usage

```typescript
import { Application, Controller, Get, Module } from "@nexusts/core";

@Controller("/")
class HelloController {
  @Get("/")
  index(ctx: any) {
    return { message: "Hello from NexusTS!" };
  }
}

@Module({
  controllers: [HelloController],
})
class AppModule {}

const app = new Application(AppModule);
await app.listen(3000);
```

## License

MIT — see the root [LICENSE](../../LICENSE).
