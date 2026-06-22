# NexusJS Examples

Working examples for every module in the [NexusJS](https://github.com/kabyeon/nexusjs) framework.

Each subfolder is a self-contained runnable example showing how to
use one specific module or pattern. Examples assume you've already
installed the framework:

```bash
bun add @kabyeon/nexusjs reflect-metadata zod hono
```

---

## Layout

| # | Example | Module | Difficulty |
|---|---------|--------|------------|
| 01 | [`basic-mvc`](./01-basic-mvc) | Core | Beginner |
| 02 | [`routing-styles`](./02-routing-styles) | Core | Beginner |
| 03 | [`drizzle-crud`](./03-drizzle-crud) | `@kabyeon/nexusjs/drizzle` | Beginner |
| 04 | [`session-auth`](./04-session-auth) | `@kabyeon/nexusjs/session` | Intermediate |
| 05 | [`openapi`](./05-openapi) | `@kabyeon/nexusjs/openapi` | Intermediate |
| 06 | [`rendu-views`](./06-rendu-views) | `@kabyeon/nexusjs/view` | Beginner |
| 07 | [`events`](./07-events) | `@kabyeon/nexusjs/events` | Intermediate |
| 08 | [`scheduler`](./08-scheduler) | `@kabyeon/nexusjs/schedule` | Intermediate |
| 09 | [`queue`](./09-queue) | `@kabyeon/nexusjs/queue` | Intermediate |
| 10 | [`websocket`](./10-websocket) | `@kabyeon/nexusjs/ws` | Intermediate |
| 11 | [`sse`](./11-sse) | `@kabyeon/nexusjs/sse` | Beginner |
| 12 | [`rate-limit`](./12-rate-limit) | `@kabyeon/nexusjs/limiter` | Intermediate |
| 13 | [`shield`](./13-shield) | `@kabyeon/nexusjs/shield` | Intermediate |
| 14 | [`cache`](./14-cache) | `@kabyeon/nexusjs/cache` | Intermediate |
| 15 | [`drive`](./15-drive) | `@kabyeon/nexusjs/drive` | Intermediate |
| 16 | [`mail`](./16-mail) | `@kabyeon/nexusjs/mail` | Intermediate |
| 17 | [`config`](./17-config) | `@kabyeon/nexusjs/config` | Intermediate |
| 18 | [`logger`](./18-logger) | `@kabyeon/nexusjs/logger` | Beginner |
| 19 | [`metrics`](./19-metrics) | `@kabyeon/nexusjs/metrics` | Intermediate |
| 20 | [`tracing`](./20-tracing) | `@kabyeon/nexusjs/tracing` | Advanced |
| 21 | [`i18n`](./21-i18n) | `@kabyeon/nexusjs/i18n` | Intermediate |
| 22 | [`crypto`](./22-crypto) | `@kabyeon/nexusjs/crypto` | Intermediate |
| 23 | [`grpc`](./23-grpc) | `@kabyeon/nexusjs/grpc` | Advanced |
| 24 | [`upload`](./24-upload) | `@kabyeon/nexusjs/upload` | Intermediate |
| 25 | [`static-files`](./25-static-files) | `@kabyeon/nexusjs/static` | Beginner |
| 26 | [`health`](./26-health) | `@kabyeon/nexusjs/health` | Beginner |
| 27 | [`request-scope`](./27-request-scope) | Core | Intermediate |
| 28 | [`inertia-react-spa`](./28-inertia-react-spa) | `@kabyeon/nexusjs/view` + Inertia + React | Intermediate |
| 29 | [`inertia-react-ssr`](./29-inertia-react-ssr) | `@kabyeon/nexusjs/view` + Inertia + React (SSR) | Advanced |
| 30 | [`inertia-vue-spa`](./30-inertia-vue-spa) | `@kabyeon/nexusjs/view` + Inertia + Vue | Intermediate |
| 31 | [`inertia-vue-ssr`](./31-inertia-vue-ssr) | `@kabyeon/nexusjs/view` + Inertia + Vue (SSR) | Advanced |
| 32 | [`graphql-hello`](./32-graphql-hello) | `@kabyeon/nexusjs/graphql` | Intermediate |
| 33 | [`resilience-calls`](./33-resilience-calls) | `@kabyeon/nexusjs/resilience` | Intermediate |

---

## Running an example

Each example has its own README. In general:

```bash
cd examples/01-basic-mvc
cat README.md                # what this example does
cp ../../package.json .      # or install deps manually
bun run dev
```

Most examples use **Bun + SQLite** so they run without external
infrastructure.

---

## Real app vs example

These are **minimal** examples that isolate one feature. For a real
app:

```bash
bunx create-nexusjs my-app   # full scaffold via the CLI
```

`create-nexusjs` is a separate package that calls
`npx @kabyeon/nexusjs init` under the hood — see
[github.com/kabyeon/nexusjs](https://github.com/kabyeon/nexusjs/tree/main/create-nexusjs).

---

## Contributing a new example

When adding a new example:

1. Number it sequentially (`28-foo/`)
2. Include a `README.md` with: what it does, how to run, expected output
3. Keep it under 200 lines total
4. Use `app.db` as the SQLite path so no setup is needed
