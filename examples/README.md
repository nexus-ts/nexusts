# NexusTS Examples

Working examples for every module in the [NexusTS](https://github.com/nexus-ts/nexusts) framework.

Each subfolder is a self-contained runnable example showing how to
use one specific module or pattern. Examples assume you've already
installed the framework:

```bash
bun add @nexusts/core reflect-metadata zod hono
```

---

## Layout

| # | Example | Module | Difficulty |
|---|---------|--------|------------|
| 01 | [`basic-mvc`](./01-basic-mvc) | Core | Beginner |
| 02 | [`routing-styles`](./02-routing-styles) | Core | Beginner |
| 03 | [`drizzle-crud`](./03-drizzle-crud) | `@nexusts/drizzle` | Beginner |
| 04 | [`session-auth`](./04-session-auth) | `@nexusts/session` | Intermediate |
| 05 | [`openapi`](./05-openapi) | `@nexusts/openapi` | Intermediate |
| 06 | [`rendu-views`](./06-rendu-views) | `@nexusts/view` | Beginner |
| 07 | [`events`](./07-events) | `@nexusts/events` | Intermediate |
| 08 | [`scheduler`](./08-scheduler) | `@nexusts/schedule` | Intermediate |
| 09 | [`queue`](./09-queue) | `@nexusts/queue` | Intermediate |
| 10 | [`websocket`](./10-websocket) | `@nexusts/ws` | Intermediate |
| 11 | [`sse`](./11-sse) | `@nexusts/sse` | Beginner |
| 12 | [`rate-limit`](./12-rate-limit) | `@nexusts/limiter` | Intermediate |
| 13 | [`shield`](./13-shield) | `@nexusts/shield` | Intermediate |
| 14 | [`cache`](./14-cache) | `@nexusts/cache` | Intermediate |
| 15 | [`drive`](./15-drive) | `@nexusts/drive` | Intermediate |
| 16 | [`mail`](./16-mail) | `@nexusts/mail` | Intermediate |
| 17 | [`config`](./17-config) | `@nexusts/config` | Intermediate |
| 18 | [`logger`](./18-logger) | `@nexusts/logger` | Beginner |
| 19 | [`metrics`](./19-metrics) | `@nexusts/metrics` | Intermediate |
| 20 | [`tracing`](./20-tracing) | `@nexusts/tracing` | Advanced |
| 21 | [`i18n`](./21-i18n) | `@nexusts/i18n` | Intermediate |
| 22 | [`crypto`](./22-crypto) | `@nexusts/crypto` | Intermediate |
| 23 | [`grpc`](./23-grpc) | `@nexusts/grpc` | Advanced |
| 24 | [`upload`](./24-upload) | `@nexusts/upload` | Intermediate |
| 25 | [`static-files`](./25-static-files) | `@nexusts/static` | Beginner |
| 26 | [`health`](./26-health) | `@nexusts/health` | Beginner |
| 27 | [`request-scope`](./27-request-scope) | Core | Intermediate |
| 28 | [`inertia-react-spa`](./28-inertia-react-spa) | `@nexusts/view` + Inertia + React | Intermediate |
| 29 | [`inertia-react-ssr`](./29-inertia-react-ssr) | `@nexusts/view` + Inertia + React (SSR) | Advanced |
| 30 | [`inertia-vue-spa`](./30-inertia-vue-spa) | `@nexusts/view` + Inertia + Vue | Intermediate |
| 31 | [`inertia-vue-ssr`](./31-inertia-vue-ssr) | `@nexusts/view` + Inertia + Vue (SSR) | Advanced |
| 32 | [`graphql-hello`](./32-graphql-hello) | `@nexusts/graphql` | Intermediate |
| 33 | [`resilience-calls`](./33-resilience-calls) | `@nexusts/resilience` | Intermediate |
| 34 | [`grpc-streaming`](./34-grpc-streaming) | `@nexusts/grpc` | Advanced |
| 35 | [`standard-decorators`](./35-standard-decorators) | Core | Intermediate |
| 36 | [`kysely-crud`](./36-kysely-crud) | `@nexusts/kysely` | Beginner |

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
bunx create-nexusts my-app   # full scaffold via the CLI
```

`create-nexusts` is a separate package that calls
`bunx @nexusts/core init` under the hood — see
[github.com/nexus-ts/nexusts](https://github.com/nexus-ts/nexusts/tree/main/create-nexusts).

---

## Contributing a new example

When adding a new example:

1. Number it sequentially (`28-foo/`)
2. Include a `README.md` with: what it does, how to run, expected output
3. Keep it under 200 lines total
4. Use `app.db` as the SQLite path so no setup is needed
