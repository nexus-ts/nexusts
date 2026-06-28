# Runtime & Deployment

> 한국어 버전: [`runtime-deployment.ko.md`](./runtime-deployment.ko.md)

NexusTS targets **Bun and Cloudflare Workers** through a
single `Application` API. The framework auto-detects the runtime and
loads the appropriate adapter.

---

## 1. Bun (default)

```ts
// main.ts
import { Application } from '@nexusts/core';
import { AppModule } from './app.module.js';

const app = new Application(AppModule);
await app.listen(3000);
```

Run:

```bash
bun app/main.ts
```

Hot reload:

```bash
bun --hot app/main.ts
```

Bun is the **fastest** path — no build step, no transpilation step.
The `bun:sqlite` module is also available for native SQLite.

---

## 2. Cloudflare Workers

```ts
// app/worker.ts
import { Application } from '@nexusts/core';
import { AppModule } from './app.module.js';

const app = new Application(AppModule);

export default {
  fetch: app.fetch,
};
```

`wrangler.toml`:

```toml
name = "nexus-app"
main = "app/worker.ts"
compatibility_date = "2024-12-01"

[vars]
NEXUS_DEBUG = "0"
```

Deploy:

```bash
bunx wrangler deploy
```

> The runtime adapter normalizes the `ExecutionContext` for things like
> scheduled handlers (v0.2) and Durable Objects (v0.3). For v0.1, only
> the `fetch` handler is wired up.

### Caveats

- **No filesystem access at request time** — pre-bundle any templates
  or assets.
- **`emitDecoratorMetadata` is ignored** by Cloudflare's esbuild — always
  use explicit `@Inject(Token)` or field injection (`@Inject(Token) declare field`).
- **Inertia SSR is edge-friendly** because the framework ships a
  pluggable adapter; pick a runtime-compatible renderer (React works
  fine; Svelte 4 with the standalone `svelte/server` is fine too).

---

## 4. Environment variables

The framework reads three env vars:

| Var | Effect |
| --- | ------ |
| `NODE_ENV` | Default `'development'` if unset |
| `PORT` | Default port for `app.listen()` |
| `NEXUS_DEBUG` | Set to `1` to print the dependency graph at boot |

Other env vars (DB URLs, API keys, etc.) are read by **your** config
provider, not the framework. Recommended:

```ts
@Module({
  providers: [
    {
      provide: 'CONFIG',
      useFactory: () => loadConfig(),   // throws on invalid env
    },
  ],
  exports: ['CONFIG'],
})
class ConfigModule {}
```

---

## 5. Build configuration

`build.ts` (the project ships one) uses Bun's bundler:

```ts
// build.ts
import { build } from 'bun';

const result = await build({
  entrypoints: ['app/index.ts'],
  outdir: 'dist',
  target: 'bun',
  format: 'esm',
  splitting: true,
  sourcemap: 'external',
  minify: process.env['NODE_ENV'] === 'production',
});

if (!result.success) {
  for (const message of result.logs) console.error(message);
  process.exit(1);
}
```

For multi-target builds (Bun + Workers), add entries to
`entrypoints`:

```ts
entrypoints: [
  'app/main.ts',         // Bun entry
  'app/worker.ts',           // Cloudflare entry
],
```

For Workers specifically, configure `wrangler.toml` to point at the
worker entry after build.

---

## 6. Production checklist

- [ ] `NODE_ENV=production`
- [ ] `version` set to a build ID or git SHA (Inertia)
- [ ] `app.setViewAdapter(...)` to your chosen engine
- [ ] `app.inertia.setSsrAdapter(...)` if using SSR
- [ ] CSRF middleware enabled (default)
- [ ] Rate limiting (planned for v0.2 — use Hono's middleware for now)
- [ ] CORS configured (Hono `cors()` middleware)
- [ ] Helmet-like security headers (Hono `secureHeaders()`)
- [ ] Logging wired up (replace the default console logger)
- [ ] Error tracking (Sentry, etc.)
- [ ] Process supervision (systemd, PM2, Docker restart policy)

---

## 7. Container deployment (Docker)

```dockerfile
FROM oven/bun:1.3 AS build
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile
COPY . .
RUN bun run build

FROM oven/bun:1.3 AS runtime
WORKDIR /app
COPY --from=build /app/dist ./dist
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./
EXPOSE 3000
CMD ["bun", "dist/main.js"]
```

For Workers, use `wrangler deploy` directly — no Docker needed.

---

## 8. Process model

| Runtime | Process model | Notes |
| ------- | ------------- | ----- |
| **Bun** | Single event loop | All `await`s are non-blocking; use async I/O |
| **Workers** | Per-request isolate | Cold start cost; keep imports lean |

For long-running tasks (queue jobs, scheduled work), use:

- **Bun** — BullMQ, sidekiq-like workers
- **Workers** — Cloudflare Queues, Durable Objects, Cron Triggers

These will be first-class in v0.2.

---

## 9. Logs

The framework logs to `console` by default. To replace:

```ts
import { logger } from '@nexusts/core';  // if exposed
// or via a custom middleware:
app.server.app.use('*', async (c, next) => {
  const start = Date.now();
  await next();
  console.log(`[${c.req.method}] ${c.req.path} ${c.res.status} ${Date.now() - start}ms`);
});
```

A first-class logger abstraction is planned for v0.2 (NestJS-style
`@Injectable() class Logger` with `useExisting` to swap impls).

---

## 10. Graceful shutdown

```ts
// Bun
const server = app.listen(3000);
process.on('SIGINT', () => {
  server.stop();
  process.exit(0);
});

```

Workers don't need explicit shutdown — Cloudflare tears down the
isolate after the request.

---

## 11. Choosing a target

| Need | Best target |
| ---- | ----------- |
| Local development, fastest iteration | **Bun** |
| Global edge, low latency, no ops | **Cloudflare Workers** |
| Native SQLite | **Bun** (`bun:sqlite`) |
| Streaming SSR | **Bun** (Workers has size limits) |
