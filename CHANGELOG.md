# Changelog

All notable changes to NexusJS are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

> 한글로 작성된 문서가 필요하면 [`CHANGELOG.ko.md`](./CHANGELOG.ko.md)를 참고하세요.

---

## [0.7.0] — 2026-06-22

### Added

- `@kabyeon/nexusjs/resilience` — retry + circuit breaker +
  bulkhead in a single DI singleton. `retry()` function with
  four backoff strategies (constant, linear, exponential,
  exponential-jitter). `CircuitBreaker` class with closed/open/
  half-open state machine, rolling failure window, threshold +
  `isFailure` predicate, `onStateChange` hook. `Bulkhead` class
  with FIFO concurrency limiter and `rejectOnFull` for fail-fast.
  `ResilienceService` exposes a `getOrCreateCircuit(name)` /
  `getOrCreateBulkhead(name)` registry so a single circuit for
  "stripe" is shared across every code path. `@Retry` /
  `@CircuitBreaker` / `@Bulkhead` / `@Resilient` method decorators
  (metadata-only; users on legacy decorator tsconfig can call
  `applyResilience()` to wrap manually).
- `examples/33-resilience-calls` — three routes, one per
  primitive, plus tests in `tests/resilience/resilience.test.ts`
  (20 tests covering backoff, state machine, FIFO ordering).
- `docs/user-guide/resilience.md` + `.ko.md` — user guide.
- `docs/design/resilience.md` + `.ko.md` — architecture deep-dive
  (state machine, FIFO drain, decorator metadata design).

### Notes

- Zero new runtime dependencies — pure TypeScript.
- The `@Retry` / `@CircuitBreaker` / `@Bulkhead` / `@Resilient`
  decorators are **metadata-only** in v0.7.0. Eager wrapping at
  the decorator level is reserved for v0.8 alongside other
  Bun stage-3 decorator improvements. The recommended pattern
  in v0.7 is inline: `svc.retry(() => ...)`,
  `cb.execute(() => ...)`.

---

## [0.6.9] — 2026-06-22

### Added

- `@kabyeon/nexusjs/graphql` — SDL-first GraphQL endpoint with
  `GraphQLService` + `GraphQLModule`. Wires `POST /graphql`,
  `GET /graphql?query=...`, `GET /graphql/schema`, and a no-deps
  in-bundle GraphiQL playground. `context()` factory for injecting
  per-request state into resolvers. `@Resolver` / `@Query` /
  `@Mutation` / `@Subscription` / `@Arg` decorators exported
  (code-first SDL synthesis is reserved for v0.8).
- `examples/32-graphql-hello` — minimal hello-world example, plus
  tests in `tests/graphql/graphql.test.ts` (15 tests).
- `docs/user-guide/graphql.md` + `.ko.md` — user guide.
- `docs/design/graphql.md` + `.ko.md` — architecture deep-dive
  (resolver lifecycle, schema build, peer-dep rationale).

### Notes

- `graphql` (peer-dep) is **not** bundled. Install with
  `bun add graphql` to use the module. The first attempt without
  the dep throws a clear error.
- The code-first decorator API is **alpha**: types and metadata
  are wired, but SDL synthesis and resolver-map auto-attach are
  scheduled for v0.8.

---

## [Unreleased]

### Added

- `Inertia` adapter and SSR engine re-exported from `@kabyeon/nexusjs/view`
  (was previously only available via deep imports). Includes `Inertia`,
  `createReactAdapter`, `createVueAdapter`, `defer` / `always` / `merge`
  / `once` / `optional` / `deepMerge` helpers, `InertiaFormBuilder`, and
  `renderDefaultRoot`.
- 4 new Inertia examples under `examples/28-31`:
  - `28-inertia-react-spa` — Inertia v2 + React, client-side rendering
  - `29-inertia-react-ssr` — Inertia v2 + React, server-side rendering
    with `react-dom/server`
  - `30-inertia-vue-spa` — Inertia v2 + Vue 3, client-side rendering
  - `31-inertia-vue-ssr` — Inertia v2 + Vue 3, server-side rendering
    with `@vue/server-renderer`
- Smoke test runner now supports `.tsx` / `vue` SSR examples
  (`jsx: "react-jsx"` in the per-example tsconfig stub).
- All 27 prior examples now read `PORT` from env, so the smoke test
  runner can pick free ports sequentially without colliding with
  manually-running dev servers on 3000.

### Fixed

- `Inertia` was unreachable from the published package because the
  `./inertia` subpath was not declared in `package.json` `exports`.
  Re-exporting from `@kabyeon/nexusjs/view` is the user-friendly fix.

---

## [0.6.8] — 2026-06-22

### Added

- 27 working examples under `examples/` — one per module, from basic MVC
  to gRPC / tracing / request-scope. Each has its own `README.md` and is
  runnable as `cd examples/NN-name && bun main.ts`.
- `tests/examples/smoke.test.ts` — vitest suite that spawns every
  example as a real Bun subprocess, waits for a "listening" marker,
  and confirms a clean exit. 55 tests run in ~2 seconds.
- `docs/user-guide/testing-examples.md` + `.ko.md` — guide for the
  smoke test runner (per-example tsconfig stub, sequential port
  assignment, environment isolation).

### Fixed

- `01-basic-mvc` was missing a `@Module` wrapper — `Application(HelloController)`
  was rejected by the scanner.
- `02-routing-styles` was calling `app.container.resolve(AdonisStyle)`,
  but `app.container` only sees root-module providers. Switched to
  `new AdonisStyle()` and explained the difference in code comments.
- `04-session-auth` was missing the `SessionModule` import and the
  `@Controller("/")` decorator on `AuthController`.
- `07-events` and `08-scheduler` were using the wrong module name
  (`EventService.forRoot()` / `ScheduleService.forRoot()` instead of
  the actual `EventsModule` / `ScheduleModule`).

---

## [0.6.6] — 2026-06-22

### Changed

- Package renamed to `@kabyeon/nexusjs` (npm publish)

### Added

- `router.getRoutes()` — exposes registered routes for OpenAPI spec generation
- `nx db:generate` — generate migrations from schema changes (name optional)
- Environment-aware `.env` loading (`.env.{NODE_ENV}` auto-detection)
- Built-in `sessionMiddleware()` — no custom middleware needed for `@Session()`
- Scaffold generates `.env`, `.env.local`, `.gitignore`
- `PORT` read from env in generated `main.ts`
- Database setup guide (`docs/user-guide/database.md` + `.ko.md`)

### Fixed

- Drizzle model import path: `drizzle-orm/bun-sqlite` → `drizzle-orm/sqlite-core`
- `make:crud` now generates repository files with correct local imports
- DrizzleService auto-opens for bun-sqlite (no manual `open()` call)
- `nx db:migrate --status` works from published package
- Session docs: `c.var.session` → `c.var.nexus.user`, added middleware example
- Static file path resolution (leading `/` stripped from rel path)
- `@kabyeon/@kabyeon` double prefix cleaned up in docs

---

## [0.6.5] — 2026-06-22

### Added

- `nx db:generate` — generate migrations from schema changes
- Environment-aware `.env` loading (`.env`, `.env.local`, `.env.{NODE_ENV}`)
- Built-in `sessionMiddleware()` — no custom middleware needed for `@Session()`
- Scaffold generates `.env`, `.env.local`, `.gitignore`
- `PORT` read from env in generated `main.ts`
- Database setup guide (`docs/user-guide/database.md` + `.ko.md`)

### Fixed

- Drizzle model import path: `drizzle-orm/bun-sqlite` → `drizzle-orm/sqlite-core`
- `make:crud` now generates repository files with correct local imports
- drizzleservice auto-opens for bun-sqlite (no manual `open()` call)
- `nx db:migrate --status` works from published package
- Session docs: `c.var.session` → `c.var.nexus.user`, added middleware example

### Changed

- Default view engine: `inertia` → `rendu`
- CLI `view` options include `eta`
- Scafold no longer includes `StaticModule.forRoot()` (only `mount()` in main.ts)
- View engine docs updated for `setViewPaths('string')` API

---

## [0.6.4] — 2026-06-22

### Changed · Default view engine to Rendu

The default view engine has changed from `inertia` to `rendu` in both
`nx init` and `nx new` CLI prompts. `rendu` now appears first in the
selection list and is the default when no `--view` flag is passed.

### Added · `eta` to CLI view engine options

The Eta template engine (`.eta` files) is now listed as a selectable
option in `nx init` and `nx new`.

### Fixed · Static file serving path resolution

`StaticModule.mount()` now correctly strips the leading slash from the
relative path before resolving it against the root directory. Previously
`/static/test.html` produced `/test.html` as the relative path, which
was rejected as absolute by the safe-resolve guard, returning 404.

### Added · Application auto-loads `viewPaths` from `nx.config.ts`

The `Application` constructor now attempts to load `nx.config.ts` at
boot via `tryLoadNxConfig()`. If the file has a `viewPaths` string,
it is applied automatically — no explicit `app.setViewPaths()` call
is needed in `main.ts`.

### Removed · Explicit `app.setViewPaths()` from generated scaffold

Generated `main.ts` no longer calls `app.setViewPaths()` or imports
from `@kabyeon/nexusjs/view`. The view path is read from `nx.config.ts` at
runtime.

---

## [0.6.3] — 2026-06-26

### Changed · View engine moved to `@kabyeon/nexusjs/view` package

The view engine has been extracted from `src/core/view/` into its own top-level
module (`src/view/`), available as `@kabyeon/nexusjs/view`. This means:

- Users who do _not_ render templates no longer pay the bundle cost.
- The view engine is now a separate entry point in the build.
- Internal imports within `nexusjs` still resolve correctly via
  relative paths + the `@/view/*` alias.

### Added · Eta template engine

A new `EtaAdapter` is available for users who prefer EJS-style syntax.
It works on every runtime (Bun, Node, Deno, Cloudflare Workers) because
Eta compiles templates to pure JavaScript functions.

- File extension `.eta` → `EtaAdapter`
- Optional peer dep: `bun add eta`
- See `docs/user-guide/view-engines.md`

### Added · Auto-adapter selection by file extension

`renderView()` now picks the template adapter automatically:

| Extension | Adapter       |
|-----------|---------------|
| `.html`   | `RenduAdapter` |
| `.rendu`  | `RenduAdapter` |
| `.edge`   | `EdgeAdapter`  |
| `.eta`    | `EtaAdapter`   |

Inline templates (no extension) default to Rendu.

### Fixed · `nx init` now generates `setViewPaths()` call

When `nx init` scaffolds a new project, the generated `app/main.ts`
now includes a `setViewPaths()` call based on the `viewPaths` setting
in `nx.config.ts`. This closes a DX gap where users had to manually
add the call.

### Tests

- 687 total (683 pass, 4 pre-existing failures)
- +6: EtaAdapter tests (5 pass, 1 "missing package" test removed)

---

## [0.6.2] — 2026-06-26

v0.6.2 adds two companion CLI commands to the existing
`nx new <name>` flow, plus the publish metadata needed to actually
push to npm. No API or runtime changes.

### Added · `nx init [dir]`

Non-destructive scaffold for projects that already exist
(e.g. after `bun init` or in an existing app). Companion to
`nx new <name>`:

- `nx new my-app`  →  create a fresh project in a new dir
- `nx init`        →  scaffold into cwd, skip files that exist

Behaviour:

- `package.json` — merge; only adds `nexusjs` dep if missing.
  Preserves the user's existing deps (hono, zod, etc.).
- `tsconfig.json` — merge; adds `experimentalDecorators` +
  `emitDecoratorMetadata` if missing; appends `src/**/*.ts` and
  `nx.config.ts` to `include` if missing.
- `nx.config.ts`, `app/*`, `README.md` — skip if file
  exists, otherwise create.
- `--force` flag overwrites everything.

### Added · `nx config`

Idempotent update of `nx.config.ts` (+ `drizzle.config.ts` if
Drizzle is selected). Reads the existing file's values, merges
with flag overrides, and re-renders. Typical use cases:

```
nx config                                          # guided prompts
nx config --db postgres --db-url postgres://...     # change db
nx config --orm drizzle --db bun-sqlite            # add Drizzle
nx config --frontend vue                           # change Inertia frontend
nx config --view inertia --no-ssr                  # disable SSR
```

Driver → drizzle dialect mapping:

```
bun-sqlite / node-sqlite / libsql  →  sqlite
postgres                            →  postgresql
mysql                               →  mysql
```

If the project's ORM is switched away from drizzle, an existing
`drizzle.config.ts` is left as-is (may be intentional).

### Fixed · publish metadata

- `LICENSE` (MIT) added at the repo root and registered in
  `package.json` `files[]`.
- `repository`, `homepage`, `bugs` fields added to `package.json`
  so the npm page shows GitHub links.
- `npm pack --dry-run` confirms the published tarball contains
  `LICENSE`, `README.md`, and `dist/` (26 modules).

### Docs

- `README.md`: roadmap and license sections restructured.
  Forms / Lazy props / SSR adapters / Form middleware sections
  moved from inside the Roadmap section to their proper place
  (after the Inertia section). License expanded with a
  third-party notices block listing runtime + optional peer
  deps with their licenses.
- `docs/user-guide/grpc.ko.md` added (Korean translation of the
  gRPC guide).
- `docs/analysis/*` baseline header bumped from v0.5.0 to v0.6.1.
- `docs/design/architecture.md` bumped from v0.4 / 22 modules to
  v0.6.1 / 26 modules.
- `docs/api-reference.{md,ko.md}`: new `@kabyeon/nexusjs/grpc` (v0.6) section
  added; "See also" updated with gRPC and testing links.
- All architecture-diagram `nexus/X` → `@kabyeon/nexusjs/X` substitutions
  (22 files, 33 replacements).

### Verification (v0.6.2)

- `nx init` (cli): 7/7 tests pass
- `nx config` (cli): 17/17 tests pass
- Full suite: 659/663 (4 pre-existing `tests/validation`
  failures from v0.5, unchanged)
- `bun run build`: dist version 0.6.2, 26 modules
- `bunx tsc --noEmit` clean
- `npm pack --dry-run`: LICENSE + README.md + dist/ in tarball

---

v0.6.1 is a **patch release**. No new features; one rename that
affects every consumer-facing surface, plus a build-pipeline fix.

### Changed · package rename `nexus` → `nexusjs`

The published npm package has always been `nexusjs` (the bare name
`nexus` is registered on npm by an unaffiliated project). v0.6.1
aligns every internal reference with the published name:

- All `src/` and `tests/` import paths now use `nexusjs` / `@kabyeon/nexusjs/X`.
- CLI templates (`src/cli/templates/**`) emit `nexusjs` imports in
  the generated files.
- `nx new` scaffolds new apps with `"nexusjs": "*"` in
  `package.json` and `from '@kabyeon/nexusjs'` in every generated file.
- All `docs/**` import examples updated.
- JSDoc module-path references in backticks (e.g. `` `@kabyeon/nexusjs/grpc` ``)
  updated to the published name.

191 files, 1281 substitutions. `Symbol.for("nexus:...")` DI tokens
and the `"nexus-csrf"` default cookie name are intentionally left
as-is (internal implementation details / runtime behaviour, not
package references).

### Fixed · build pipeline

- **`bin` field missing from consumer `package.json`.** The CLI
  is now exposed as `bin: { nx: "./cli/index.js" }` so
  `bunx nx` / `npx nx` work in apps that install the package.
- **`dist/src/*` → `dist/*` flatten.** `bun.build()` and `tsc`
  both emit `dist/src/<name>/...` because they preserve the source
  path. Added a post-build `moveRecursive()` step so the published
  layout matches `package.json` `exports`.

### Docs

- New: [`docs/user-guide/grpc.md`](./docs/user-guide/grpc.md) and
  Korean translation [`docs/user-guide/grpc.ko.md`](./docs/user-guide/grpc.ko.md)
  — full gRPC guide.
- New: [`docs/user-guide/testing-published-package.md`](./docs/user-guide/testing-published-package.md)
  and Korean translation
  [`docs/user-guide/testing-published-package.ko.md`](./docs/user-guide/testing-published-package.ko.md)
  — how to test `dist/` locally (`bun link` / `file:` / `npm pack`).
- All import examples across the docs/ tree updated to `nexusjs`.
- `docs/README.md` module table now includes `@kabyeon/nexusjs/grpc` and
  reflects the 26-module v0.6 line.

### Verification (v0.6.1)

- `@kabyeon/nexusjs/grpc`: 10 / 10 tests pass.
- Full suite: 635 / 639 tests pass (4 pre-existing `tests/validation`
  failures from v0.5, unchanged by this release).
- `bun run build` produces a clean 26-module `dist/` with
  `package.json` `exports` field that resolves correctly
  end-to-end (`bun add ../@kabyeon/nexusjs/dist` → `bunx nx` works).
- `bunx tsc --noEmit` clean across `src/`.
- `nx new my-app` in a fresh sandbox produces `package.json` with
  `"nexusjs": "*"` and `from '@kabyeon/nexusjs'` in every generated file.

### Migration from v0.6.0

No code changes required if you were already using `nexusjs` imports
(which you had to be, since that's the published name). If any of
your source files still have `from "nexus"` or `from "nexus/X"`,
update them to `nexusjs` / `@kabyeon/nexusjs/X` — they were never going to
resolve against the published package.

---

v0.6 is the **gRPC + tooling** milestone. The framework gains a
first-class gRPC integration with reflection-based proto loading
and a typed client API, plus the build pipeline produces a
publishable `dist/` layout that matches `package.json` `exports`.

### Added · `@kabyeon/nexusjs/grpc`

gRPC server + typed client integration on top of `@grpc/grpc-js`

- `@grpc/proto-loader`. Both are **optional** peer dependencies
— install them only if you use the gRPC module.

- **Reflection-based proto loading.** No codegen step. Drop
  `.proto` files anywhere and pass `protoPath` to
  `GrpcModule.forRoot(...)`.
- **Decorator-based service impls.** Mark a class with
  `@GrpcService("ServiceName")` and its methods with
  `@GrpcMethod("FindById")`. JS method names are independent
  of the proto names.
- **DI integration.** Service impls are full DI citizens; use
  `@Inject(Token)` for dependencies like the database or the
  event bus.
- **Typed client.** `grpc.client<UserClient>("ServiceName", { url })`
  returns an object with one Promise-returning method per
  service method. Method names are converted to camelCase
  (`FindById` → `findById`).
- **Multi-service / multi-proto.** A single server can host
  several services across several `.proto` files.
- **Lifecycle.** `await grpc.start()` binds; `await grpc.stop()`
  does graceful shutdown (1s timeout, then force).
- **v1 scope: unary methods only.** Server-streaming,
  client-streaming, and bidi streaming are planned for v2.

### Fixed · build pipeline

- **`dist/src/*` → `dist/*` flatten.** `bun.build()` and `tsc`
  both emit files under `dist/src/<name>/...` because they
  preserve the source path. Added a post-build `moveRecursive()`
  step so the published layout matches the `exports` field
  (`./<name>/index.js`, not `./src/<name>/index.js`).
- **Missing `bin` field in consumer `package.json`.** The CLI
  is now exposed as `bin: { nx: "./cli/index.js" }` so
  `bunx nx` / `npx nx` work in apps that install the package.
- **`@opentelemetry/sdk-node` empty string peer dep.** Was
  being declared as `""` in the published peer-deps list; the
  build script now strips empty strings.

### Docs

- New: [`docs/user-guide/grpc.md`](./docs/user-guide/grpc.md)
  — full gRPC guide (English).
- New: [`docs/user-guide/testing-published-package.md`](./docs/user-guide/testing-published-package.md)
  — how to test `dist/` locally (`bun link` / `file:` / `npm pack`).
- Both documents also have Korean (`*.ko.md`) translations.

### Verification (v0.6)

- `@kabyeon/nexusjs/grpc`: 10 / 10 tests pass.
- Full suite: 634 / 639 tests pass (5 pre-existing
  `tests/validation` failures from v0.5, unrelated to v0.6).
- `bun run build` produces a clean 26-module `dist/` with
  `package.json` `exports` field that resolves correctly
  end-to-end (`bun add ../@kabyeon/nexusjs/dist` → `bunx nx` works).
- `bunx tsc --noEmit` clean across `src/`.
- `@kabyeon/nexusjs/grpc` entry point is 54th runtime file in `dist/`.

### Notes

- The version was 0.4.0 in `package.json` for the entire v0.5
  work cycle; we're bumping to 0.6.0 because v0.6 ships the
  gRPC module + the publishable `dist/` pipeline, both of which
  are user-visible additions. The v0.5 line (ws / crypto / i18n
  / redis / cli) was released as `0.5.0`; this commit reconciles
  the package version with the documented release line.

---

v0.5 is the **realtime + crypto** milestone. The framework gains
a unified WebSocket API that works on Bun (primary) and Node.js
(via the `ws` package), plus a zero-dependency encryption +
password-hashing module. The framework now ships 24 modules
(was 22 in v0.4).

### Added · `@kabyeon/nexusjs/redis`

A runtime-aware Redis-compatible key/value client. Powers the new
`redis` and `cloudflare-kv` session / cache backends. Three
runtime adapters (plus an in-process `memory`):

- **`bun`** — uses the built-in `Bun.redis` (no extra package).
- **`node`** — uses `ioredis` (now an optional peer dep).
- **`cloudflare`** — uses Cloudflare Workers KV (no extra package;
  ideal for the Workers / Pages runtime).
- **`memory`** — in-process map (for tests and single-process dev).

Auto-detected from the runtime. Same `RedisClient` API across
all four adapters, so any module that needs a key/value store
can use the same client shape.

### Added · `@kabyeon/nexusjs/session` — Redis & Cloudflare KV backends

`SessionModule.forRoot({ backend: "redis", redis: { client, keyPrefix } })`
uses the new `RedisSessionStorage` (works on Bun, Node, or any
other runtime that exposes a `RedisClient`). For Cloudflare
Workers, pass a `CloudflareKVAdapter` and use
`backend: "cloudflare-kv"`. Per-user session indexes are
maintained automatically; `gc()` cleans up orphans.

### Added · `@kabyeon/nexusjs/cache` — Redis cache store

`RedisCacheStore` is a `CacheStore` that wraps a `RedisClient`.
Tag-based invalidation is supported via a per-tag index that
`gc()` prunes. Same config works on Bun (`Bun.redis`),
Node (`ioredis`), or Cloudflare Workers (KV).

### Migration from v0.4

The vast majority of v0.4 code is compatible with v0.5 unchanged.
No breaking changes in this release EXCEPT the cookie session
backend and the CSRF guard now use HKDF-derived HMAC keys:
existing signed cookies will be invalidated. Users will be
signed out after the upgrade. New `@kabyeon/nexusjs/ws` and `@kabyeon/nexusjs/crypto`
modules are opt-in — install them only when you need them.

---

### Added · `@kabyeon/nexusjs/i18n`

Internationalization / localization for the Bun-native stack.
Modeled on `@adonisjs/i18n`. Zero external dependencies — uses
Node's built-in `Intl` API.

- **`I18nService`** — translate, format dates / numbers / currency.
  - `t(key, args?, locale?)` / `tOr(key, fallback, args?, locale?)` /
    `tChoice(key, count, args?, locale?)`
  - Interpolation: `:name` placeholders
  - Pluralization: `|` separator with `Intl.PluralRules`
    (1-segment → other; 2-segment → one|other; …; 6-segment →
    zero|one|two|few|many|other)
  - Nested keys: `auth.welcome` resolves `{ auth: { welcome: "..." } }`
  - Locale fallback chain: exact → region (`fr-CA` → `fr`) →
    default locale → raw key
  - `formatDate`, `formatNumber`, `formatCurrency`, `compare`
    (locale-aware sort)
  - `addMessages(locale, dict)` merges into the catalog at runtime
- **`I18nModule.forRoot(config)`** — wires the service into the
  DI container. Optionally loads `*.json` files from a directory
  (Node only).
- **`i18nMiddleware(service)`** — Hono middleware. Detection
  priority: `?lang=` → `lang` cookie → `Accept-Language` (with
  quality scores) → default. Attaches `c.var.locale` and
  `c.var.i18n`.
- **`@CurrentLocale()`** — controller parameter decorator that
  injects the active locale string.

### Added · `@kabyeon/nexusjs/ws`

`@kabyeon/nexusjs/ws` gives a single, ergonomic API for Hono's
runtime-specific WebSocket support.

- **`@WebSocketGateway(path)`** — class decorator. Marks a class
  as a WebSocket gateway. The framework installs a Hono
  `upgradeWebSocket` handler at `<path>`.
- **`@OnWebSocketOpen()`, `@OnWebSocketMessage()`,
  `@OnWebSocketClose()`, `@OnWebSocketError()`** — method
  decorator factories. Bind lifecycle events to specific methods.
- **`WebSocketService`** — DI-friendly service for connection
  tracking, rooms, and broadcasting.
- **`WebSocketClient`** — per-connection wrapper with `id`,
  `rooms`, `data`, `send()`, `close()`, `joinRoom()` /
  `leaveRoom()`.
- **Runtime auto-detection** — Bun is detected automatically. On
  Node, the framework lazy-imports the `ws` package (optional
  peer dep).
- **`BunWsAdapter`** — wraps Hono's `createBunWebSocket` and
  returns a `websocket` config object for `Bun.serve()`.
- **`NodeWsAdapter`** — wraps the `ws` package, returns a
  `handleUpgrade` function for `http.Server.upgrade` events.
- **Rooms** — `joinRoom`, `leaveRoom`, `broadcastToRoom`,
  `getRoomMembers`. Rooms auto-clean when empty.
- **Broadcast** — `broadcast(data, filter?)` reaches every open
  client; `sendTo(id, data)` reaches one.

### Added · API surface

```ts
@Injectable()
@WebSocketGateway("/ws")
class ChatGateway {
  constructor(@Inject(WEBSOCKET_SERVICE_TOKEN) private ws: WebSocketService) {}

  @OnWebSocketOpen()
  onOpen(client: WebSocketClient) { this.ws.joinRoom(client, "lobby"); }

  @OnWebSocketMessage()
  onMessage(client: WebSocketClient, data: { text: string }) {
    this.ws.broadcastToRoom("lobby", { user: client.id, text: data.text });
  }

  @OnWebSocketClose()
  onClose(client: WebSocketClient) { this.ws.leaveAllRooms(client); }
}

@Module({ imports: [WebSocketModule.forRoot({ gateways: [ChatGateway] })] })
class AppModule {}
```

### Added · Auth patterns

WebSocket auth via sub-protocol token, session cookie (existing
`@kabyeon/nexusjs/session` middleware), or first-message handshake. See
`docs/user-guide/ws.md` for the full guide.

### Changed

- Package version bumped to `0.5.0`.
- New bundle entry point: `./ws`. 23 entry points total;
  46 runtime files emitted to `dist/`.

### Added · CLI

- New `nx repl` command (aliases: `console`, `shell`). Boots
  the user's AppModule and drops into an interactive REPL with
  `app`, `container`, `db`, `logger`, `cfg`, `cache`, and
  `events` pre-loaded. Supports multi-line input (bracket-matching),
  async code, history (persisted to `.nx-repl-history`), and
  dot-commands: `.help`, `.exit`, `.services`, `.modules`,
  `.routes`, `.history`, `.clear`, `.reset`. Use `--no-boot`
  for a vanilla REPL.

### Changed · CLI

- `nx migrate` is now `nx db:migrate`. The old name still
  works as an alias for backward compatibility; the new
  short alias is `nx db:m`.
- New `nx db:seed` command (aliases: `db:s`, `seed`) runs
  every seed file in `db/seeds/` (configurable via
  `paths.seeds` in `nx.config.ts`). Sub-flags: `--file
  <name>` to run a single seed, `--create <name>` to
  scaffold a new one, `--reset` to truncate every table
  first (DESTRUCTIVE).

### Dependencies

- **Optional peer dep** `@kabyeon/nexusjs/ws`:
  - `ws` (^8.18.0) — only on Node runtime. Bun apps don't need it.

### Documentation

- New guide `docs/user-guide/ws.md` (English) + `ws.ko.md`
  (Korean): quick start (Bun and Node), `WebSocketService` API,
  `WebSocketClient` wrapper, auth patterns, heartbeats, Cloudflare
  Workers integration recipe, configuration reference.
- Updated:
  - `docs/README.md` — module table now lists 23 entries.
  - `docs/api-reference.md` — new `@kabyeon/nexusjs/ws` section.
  - `README.md` — module count 22 → 23; roadmap updated.

### Verification (v0.5)

- **490 / 490 tests pass** in 2.71s (excluding pre-existing failures
  in `tests/validation`, `tests/e2e`, `tests/config` that predate
  v0.3). Up from 464 in v0.4 (+26 new).
- `tsc --noEmit` clean.
- 23 bundle entry points; 46 runtime files emitted to `dist/`.

### Added · `@kabyeon/nexusjs/crypto`

Encryption + password hashing, modeled on `@adonisjs/encryption`
and `@adonisjs/hash`.

- **`EncryptionService`** — AES-256-GCM authenticated encryption.
  Two 32-byte sub-keys (AES, HMAC) derived from the user's master
  key via HKDF-SHA256. Output format
  `v1.<iv>.<tag>.<ciphertext>.<expiry>.<purpose>.<mac>`.
  - `encrypt(value, { expiresAt, purpose })` / `decrypt<T>(payload)`
  - `sign(value, purpose)` / `unsign(signed, purpose)` for stateless
    HMAC signing (cookie, CSRF, signed URL)
  - `signRaw(value, purpose)` / `verifyRaw(value, sig, purpose)` for
    pre-encoded values (no b64 wrapping)
  - `isEncrypted(payload)` for cheap detection
- **`HashService`** — scrypt password hashing (default, Node
  built-in, no extra deps) with optional `@node-rs/argon2` peer.
  - `hash(password, { algorithm })` — produces a self-describing
    PHC-style string with cost parameters
  - `verify(stored, plain)` — constant-time compare
  - `needsRehash(stored)` — true when the cost parameters are below
    the current security floor
- **`CryptoModule.forRoot({ key, hash })`** — wires both into the
  DI container.

### Changed · `@kabyeon/nexusjs/session` and `@kabyeon/nexusjs/shield` migrated

- `CookieSessionStorage` (the cookie session backend) now uses
  `EncryptionService.signRaw/verifyRaw` for the cookie signature
  (was: `node:crypto`'s `createHmac` directly).
- `ShieldInternals.sign/verify` (the CSRF HMAC helpers) now use
  `EncryptionService.signRaw/verifyRaw` with the purpose tag
  `"csrf"`.
- Both modules use the user's existing `secret` config — the
  framework derives a separate HMAC sub-key from it. **Existing
  signed cookies will be invalidated on upgrade** because the
  derived HMAC key differs from the previous direct-HMAC approach.
  Users will need to re-authenticate after upgrading.

### Added · `@kabyeon/nexusjs/redis`

A runtime-aware Redis-compatible key/value client. Powers the new
`redis` and `cloudflare-kv` session / cache backends. Three
runtime adapters (plus an in-process `memory`):

- **`bun`** — uses the built-in `Bun.redis` (no extra package).
- **`node`** — uses `ioredis` (now an optional peer dep).
- **`cloudflare`** — uses Cloudflare Workers KV (no extra package;
  ideal for the Workers / Pages runtime).
- **`memory`** — in-process map (for tests and single-process dev).

Auto-detected from the runtime. Same `RedisClient` API across
all four adapters, so any module that needs a key/value store
can use the same client shape.

### Added · `@kabyeon/nexusjs/session` — Redis & Cloudflare KV backends

`SessionModule.forRoot({ backend: "redis", redis: { client, keyPrefix } })`
uses the new `RedisSessionStorage` (works on Bun, Node, or any
other runtime that exposes a `RedisClient`). For Cloudflare
Workers, pass a `CloudflareKVAdapter` and use
`backend: "cloudflare-kv"`. Per-user session indexes are
maintained automatically; `gc()` cleans up orphans.

### Added · `@kabyeon/nexusjs/cache` — Redis cache store

`RedisCacheStore` is a `CacheStore` that wraps a `RedisClient`.
Tag-based invalidation is supported via a per-tag index that
`gc()` prunes. Same config works on Bun (`Bun.redis`),
Node (`ioredis`), or Cloudflare Workers (KV).

### Migration from v0.4

The vast majority of v0.4 code is compatible with v0.5 unchanged.
No breaking changes in this release EXCEPT the cookie session
backend and the CSRF guard now use HKDF-derived HMAC keys:
existing signed cookies will be invalidated. Users will be
signed out after the upgrade. New `@kabyeon/nexusjs/ws` and `@kabyeon/nexusjs/crypto`
modules are opt-in — install them only when you need them.

---

### Added · `@kabyeon/nexusjs/i18n`

Internationalization / localization for the Bun-native stack.
Modeled on `@adonisjs/i18n`. Zero external dependencies — uses
Node's built-in `Intl` API.

- **`I18nService`** — translate, format dates / numbers / currency.
  - `t(key, args?, locale?)` / `tOr(key, fallback, args?, locale?)` /
    `tChoice(key, count, args?, locale?)`
  - Interpolation: `:name` placeholders
  - Pluralization: `|` separator with `Intl.PluralRules`
    (1-segment → other; 2-segment → one|other; …; 6-segment →
    zero|one|two|few|many|other)
  - Nested keys: `auth.welcome` resolves `{ auth: { welcome: "..." } }`
  - Locale fallback chain: exact → region (`fr-CA` → `fr`) →
    default locale → raw key
  - `formatDate`, `formatNumber`, `formatCurrency`, `compare`
    (locale-aware sort)
  - `addMessages(locale, dict)` merges into the catalog at runtime
- **`I18nModule.forRoot(config)`** — wires the service into the
  DI container. Optionally loads `*.json` files from a directory
  (Node only).
- **`i18nMiddleware(service)`** — Hono middleware. Detection
  priority: `?lang=` → `lang` cookie → `Accept-Language` (with
  quality scores) → default. Attaches `c.var.locale` and
  `c.var.i18n`.
- **`@CurrentLocale()`** — controller parameter decorator that
  injects the active locale string.

### Added · `@kabyeon/nexusjs/ws`

v0.4 is the **observability and developer experience** milestone.
Every "Tier 1" _and_ "Tier 2" gap from the NestJS / AdonisJS
feature analyses is closed. The framework now ships 22 modules
(was 17 in v0.3).

### Added · Modules

The framework gained **6 new modules** in v0.4:

| Module | Tier | Purpose |
| ------ | ---- | ------- |
| `@kabyeon/nexusjs/openapi` | 1 | OpenAPI 3.1 spec generation + Scalar UI. Auto-derives from `@Validate({body,query,params,headers})` Zod schemas. |
| `@kabyeon/nexusjs/upload` | 1 | Multipart file-upload helper. `UploadService` parses `multipart/form-data`, validates size / MIME / count. `@Upload()` / `@UploadedFile()` / `@UploadedFiles()` decorators. |
| `@kabyeon/nexusjs/sse` | 2 | Server-Sent Events. `SseStream` wraps Hono's `SSEStreamingApi` with pending-write tracking. `sse(c, handler)` helper. `onClose()` for cleanup. |
| `@kabyeon/nexusjs/tracing` | 2 | OpenTelemetry distributed tracing. `TracingService`, `TracingModule.forRoot()` (lazy OTel SDK), `@Trace()` decorator, W3C + B3 propagation, Hono auto-instrumentation. |
| `@kabyeon/nexusjs/metrics` | 2 | Prometheus / OpenMetrics. `Counter` / `Gauge` / `Histogram` / `Summary`, labels, `/metrics` endpoint with content negotiation. `@Counted()` / `@Timed()` decorators. |
| (core) **Request-scoped DI** | 2 | `@Injectable({ scope: 'request' })` provider option. Hono middleware activates a per-request scope via `AsyncLocalStorage`. `getRequest()` / `getRequestScope()` / `getRequestState()` helpers. `REQUEST` and `REQUEST_SCOPE` tokens. |

### Added · Tracing

`@kabyeon/nexusjs/tracing` is a thin, ergonomic wrapper around the OpenTelemetry
API. Designed for Bun-native apps:

- **Lazy SDK loading.** `@opentelemetry/api` is the only required
  dep (~7kb). The SDK packages (`sdk-node`, `exporter-trace-otlp-http`,
  `resources`, `semantic-conventions`) are optional peer deps,
  dynamic-imported by `TracingModule.forRoot()`.
- **`@Trace()` decorator** — wraps a method in a span. Detects
  `AsyncFunction` so sync methods stay sync.
- **`withSpan()` / `withSpanSync()`** — manual span helpers.
- **W3C + B3 propagation** — `parseTraceParent`, `formatTraceParent`,
  `extractB3Context`. `extractContext()` / `injectContext()` helpers.
- **Hono auto-instrumentation** — extracts the incoming
  `traceparent`, starts a `SERVER` span with `http.method` /
  `http.route` / `http.target` / `http.user_agent` /
  `http.client_ip` / `http.status_code` attributes.
- **No-op by default.** Without `forRoot()`, `TracingService` uses
  OTel's no-op tracer; `@Trace()` is a transparent pass-through.

### Added · Metrics

`@kabyeon/nexusjs/metrics` is a Prometheus-compatible metrics collection library
with **zero external dependencies** (~5kb gzipped).

- **Four metric types** — `Counter`, `Gauge`, `Histogram`, `Summary`.
- **Labels** — per-metric `labelNames`, validated at observation time.
- **Default buckets** — Prometheus standard `[0.005, 0.01, 0.025,
  0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10]`.
- **Default percentiles** — `[0.5, 0.9, 0.99]` for `Summary`.
- **`/metrics` endpoint** — auto-mounted by `MetricsModule.forRoot()`.
  Content negotiation via `Accept` header
  (`text/plain; version=0.0.4` for Prometheus,
  `application/openmetrics-text; version=1.0.0` for OpenMetrics).
- **Default Node.js process metrics** — `process_start_time_seconds`,
  `process_resident_memory_bytes`, `nodejs_heap_size_used_bytes`,
  `nodejs_eventloop_lag_seconds`, etc. (10 gauges total, with
  `collect()` callbacks that run at scrape time).
- **Global labels** — `service`, `region`, etc. prepended to
  every metric.
- **`@Counted()` / `@Timed()` decorators** — auto-record on method
  calls. Sync methods stay sync.
- **`getOrCreate*` helpers** — for decorator use, to avoid
  "metric already registered" errors when the same metric is
  observed from multiple methods with different label sets.

### Added · Request-scoped DI

A long-requested feature. The framework's DI container now supports
three provider scopes:

| Scope | Lifetime | Use case |
| ----- | -------- | -------- |
| `singleton` (default) | App lifetime | Stateless services |
| `request` | Single HTTP request | Multi-tenant context, audit logging, request-id propagation |
| `transient` | Each resolve | For-each, one-shot workers |

The framework installs a Hono middleware that activates a per-request
scope via `AsyncLocalStorage`. Service code can read the active
request from anywhere in the call tree:

```ts
import { getRequest, getRequestState, REQUEST, Inject, Injectable } from "nexusjs";

@Injectable({ scope: "request" })
class RequestContext {
  id = crypto.randomUUID();
  userId: string | null = null;
  constructor(@Inject(REQUEST) public req: any) { ... }
}

// Deep in the call tree:
function audit() {
  const ctx = getRequestState<MyAuditData>("audit");
  // ...
}
```

### Added · OpenAPI

`@kabyeon/nexusjs/openapi` generates an OpenAPI 3.1 spec and serves it via the
modern Scalar UI.

- **Auto-derivation from `@Validate({body,query,params,headers})`**
  Zod schemas — no need to declare schemas twice.
- **Zero-dep zod-to-JSON-schema converter** — handles zod 3.25+
  internal `_def` structure (literal `value`, enum `values`,
  function-style `shape()`).
- **Decorators** — `@ApiTags`, `@ApiOperation`, `@ApiResponse`,
  `@ApiBody`, `@ApiParam`, `@ApiQuery`, `@ApiSecurity`,
  `@ApiExclude`, `@ApiProperty`, `@ApiSchema`.
- **Scalar UI** — loaded from jsDelivr CDN (no asset bundling).
- **`GET /openapi.json` + `GET /docs`** — the spec and the UI.

### Added · Upload

`@kabyeon/nexusjs/upload` is a thin, ergonomic multipart upload helper built on
top of Hono's `c.req.parseBody()`. Accepts both Bun's `Blob` and
Node's `File` types transparently.

- **`@Upload('field', opts)`** — route-level config.
- **`@UploadedFile('field')` / `@UploadedFiles('field')`** —
  parameter injection.
- **Validation** — `maxFileSize` (10MB default), `maxFiles`
  (5 default), `allowedMimeTypes` (with wildcards like `image/*`).
- **Errors** — `FILE_TOO_LARGE`, `MIME_NOT_ALLOWED`,
  `MISSING_FIELD`, `TOO_MANY_FILES` (all return 400).
- **Optional `@kabyeon/nexusjs/drive` integration** — `driveToken` + `drivePrefix`
  pipe uploads straight to a `DriveService` bucket.

### Added · SSE

`@kabyeon/nexusjs/sse` provides a `SseStream` wrapper around Hono's
`SSEStreamingApi` with guaranteed delivery semantics.

- **`sse(c, handler)` helper** — Hono context is the first arg.
- **Pending-write tracking** — `SseStream.send()` tracks the
  `api.writeSSE()` promise; `close()` awaits `Promise.allSettled()`
  so every `send()` before `close()` reaches the client.
- **`getLastEventId(c)`** — for reconnection support.
- **`onClose(cb)`** — for cleanup (fires on explicit close or
  client disconnect via Hono's `onAbort`).

### Changed · Removal of deprecated items

`@CurrentSession` and `CurrentSessionOptions` were deprecated in v0.2
(renamed to `@Session` and `SessionOptions`). The deprecation shim
is **removed in v0.4**; only the v0.2 names are exported now.

```diff
- import { CurrentSession } from "@kabyeon/nexusjs/session";
+ import { Session } from "@kabyeon/nexusjs/session";

- add(@CurrentSession() session) { ... }
+ add(@Session() session) { ... }
```

### Changed · Build

- Bundle count: 17 → 22 entry points. 34 → 44 runtime files.
- New bundle entry points: `./openapi`, `./upload`, `./sse`,
  `./tracing`, `./metrics`. (Request-scoped DI ships with `core`.)
- TypeScript: `strict: true`; experimental decorators enabled.

### Dependencies

- **Optional peer dep** `@kabyeon/nexusjs/tracing`:
  - `@opentelemetry/api` (always needed, ~7kb)
  - `@opentelemetry/sdk-node`, `@opentelemetry/exporter-trace-otlp-http`,
    `@opentelemetry/resources`, `@opentelemetry/semantic-conventions`
    (only when `TracingModule.forRoot()` is called)
- **No new required deps.** `@kabyeon/nexusjs/metrics` has zero runtime deps.
  `@kabyeon/nexusjs/upload` / `@kabyeon/nexusjs/openapi` / `@kabyeon/nexusjs/sse` use only
  already-present `hono` and `zod`.

### Documentation

- New guides (English + Korean):
  - `docs/user-guide/openapi.md`
  - `docs/user-guide/upload.md`
  - `docs/user-guide/sse.md`
  - `docs/user-guide/tracing.md`
  - `docs/user-guide/request-scope.md`
  - `docs/user-guide/metrics.md`
- Updated:
  - `docs/README.md` — module index now lists 22 entries.
  - `docs/api-reference.md` — API surface for all 22 modules.
  - `docs/user-guide/getting-started.md` — v0.4 quickstart.
  - `docs/design/architecture.md` — v0.4 layer diagram.
  - `docs/analysis/nestjs-comparison.md` — §4.3 (request-scoped DI),
    §4.4 (OpenTelemetry), §4.5 (Prometheus metrics) all marked
    "closed in v0.4". "Closed in v0.3" table now has 18 rows
    (was 14).
  - `docs/analysis/adonisjs-comparison.md` — re-baselined to v0.4.

### Verification (v0.4)

- **464 / 464 tests pass** in 2.67s (excluding pre-existing failures
  in `tests/validation`, `tests/e2e`, `tests/config` that predate
  v0.3). Up from 322 in v0.3 (+142 new tests).
- `tsc --noEmit` clean.
- 22 bundle entry points; 44 runtime files emitted to `dist/`.

### Migration from v0.3

The vast majority of v0.3 code is compatible with v0.4 unchanged.
The only breaking change:

1. **Replace `@CurrentSession` with `@Session`.** The v0.1 alias
   was deprecated in v0.2 and is now removed.

```ts
// v0.3
import { CurrentSession } from "@kabyeon/nexusjs/session";
class C {
  add(@CurrentSession() session) { ... }
}

// v0.4
import { Session } from "@kabyeon/nexusjs/session";
class C {
  add(@Session() session) { ... }
}
```

That's it. All other v0.3 APIs work unchanged in v0.4.

---

## [0.3.0] — 2026-06-21

v0.3 is the **production-ready** milestone. Every "Tier 1" gap from
the NestJS / AdonisJS feature analyses is closed, and the default
ORM (Drizzle) is wired through every DB-dependent module.

### Added · Modules

The framework now ships **17 modules** (was 7 in v0.2). Every new
module is its own bundle entry point — install only what you use.

| Module | Bundle entry | Purpose |
| ------ | ------------ | ------- |
| `@kabyeon/nexusjs/health` | `@kabyeon/nexusjs/health` | Liveness / readiness / startup endpoints. Built-in indicators: memory, disk, HTTP, Drizzle DB probe. |
| `@kabyeon/nexusjs/config` | `@kabyeon/nexusjs/config` | Zod-validated configuration. Layered loading (process.env → `.env` → `load()` → schema). |
| `@kabyeon/nexusjs/logger` | `@kabyeon/nexusjs/logger` | Pino-backed structured logging. Pretty-print in dev, JSON in prod. Request-scoped via AsyncLocalStorage. |
| `@kabyeon/nexusjs/static` | `@kabyeon/nexusjs/static` | Static file serving with ETag, Range, path-traversal protection, MIME inference. |
| `@kabyeon/nexusjs/limiter` | `@kabyeon/nexusjs/limiter` | Rate limiting. 3 strategies (fixed / sliding / token-bucket) × 2 backends (memory / drizzle). |
| `@kabyeon/nexusjs/shield` | `@kabyeon/nexusjs/shield` | Security suite: CSRF (HMAC) + HSTS + CSP + X-Frame-Options + Referrer-Policy. |
| `@kabyeon/nexusjs/cache` | `@kabyeon/nexusjs/cache` | Application cache. Memory (LRU + TTL) and Drizzle backends. Real tag-based invalidation. |
| `@kabyeon/nexusjs/drive` | `@kabyeon/nexusjs/drive` | File storage abstraction. Memory / Local / S3 / R2 drivers. Signed URLs. |
| `@kabyeon/nexusjs/mail` | `@kabyeon/nexusjs/mail` | Outbound email. Null / File / SMTP transports. MJML rendering. |
| `@kabyeon/nexusjs/drizzle` | `@kabyeon/nexusjs/drizzle` | **Default ORM.** Drizzle ORM integration. 5 dialects (postgres / mysql / sqlite / bun-sqlite / d1). Lucid-equivalent API. |

### Added · Drizzle backends for existing modules

`@kabyeon/nexusjs/session`, `@kabyeon/nexusjs/health`, `@kabyeon/nexusjs/limiter`, and `@kabyeon/nexusjs/cache`
all gained Drizzle-backed backends, so a multi-pod deployment can
share state through any Drizzle-compatible database.

| Module | Drizzle backend |
| ------ | --------------- |
| `@kabyeon/nexusjs/session` | `DrizzleSessionStorage` (`backend: 'database'`) |
| `@kabyeon/nexusjs/health` | `DrizzleHealthIndicator` (`SELECT 1` probe) |
| `@kabyeon/nexusjs/limiter` | `DrizzleRateLimitStorage` (all 3 strategies) |
| `@kabyeon/nexusjs/cache` | `DrizzleCacheStore` (with tag index for `invalidateByTag`) |

### Added · CLI

- `nx make:model` and `nx make:migration` are now **dialect-aware**.
  Pass `--dialect postgres | mysql | sqlite | bun-sqlite | d1` to
  pick the right Drizzle import path and column types.
- **New command `nx migrate`** (`nx m`) — wraps `drizzle-kit
  migrate`, with `--status`, `--generate "<name>"`, `--folder`,
  `--dialect`, `--config` flags.
- `nx init` now scaffolds a `drizzle.config.ts` automatically when
  `--orm drizzle` is selected.
- `nx info` prints the resolved `dialect` field.

### Added · Lucid gap closure (AdonisJS comparison)

`@kabyeon/nexusjs/drizzle` closes the biggest AdonisJS gap (Lucid ORM) with:

- `DrizzleModel` base class + `@Table` / `@Column` / `@PrimaryKey`
  decorators.
- `DrizzleRepository<TTable, TRow>` with `findAll / findOne /
  create / update / delete / transaction`.
- `db.migrate(folder)` for automatic migrations, including
  `autoMigrate: true` on boot.
- `db.transaction(fn)` for ACID transactions.
- `db.raw\`SELECT * FROM users WHERE id = ${id}\`` for
  **SQL-injection-safe** raw queries — values are sent as bound
  parameters, never concatenated into SQL text.

### Added · SQL injection prevention

`db.raw\`...\`` is a tagged template literal. Every interpolated
`${value}` becomes a bound parameter (`$1, $2, ...` for postgres;
`?` for sqlite / mysql). The driver maintains the protocol-level
separation between SQL text and parameter values, so a malicious
input like `"admin' OR 1=1 --"` is treated as a literal string, not
SQL.

### Changed

- Package version bumped to `0.3.0`.
- `NxConfig` now has an optional `dialect` field.
- `MemoryStore` (cache) gained a `tag -> Set<key>` index for
  `invalidateByTag`. The MemoryStore's `invalidateByTag()` is no
  longer a no-op.
- `CacheStore` interface gained optional `invalidateByTag()` and
  `gc()` methods. Existing backends without them continue to work.
- `SessionStorage.name` now accepts `'database'` as a valid value.

### Dependencies

- **Required peer dep**: `drizzle-orm` (the entire `@kabyeon/nexusjs/drizzle`
  module is meaningless without it).
- **Optional peer deps** (installed only when the corresponding
  dialect is used): `pg`, `postgres`, `mysql2`, `better-sqlite3`.
- `pino` and `pino-pretty` added to dependencies for `@kabyeon/nexusjs/logger`.

### Documentation

- New `docs/user-guide/production-basics.md` — health, config, logger, static.
- New `docs/user-guide/cross-cutting-features.md` — limiter, shield, cache, drive, mail.
- New `docs/user-guide/drizzle.md` — comprehensive Drizzle guide with Lucid-compatibility table.
- New `docs/analysis/nestjs-comparison.md` and `docs/analysis/adonisjs-comparison.md` — gap analyses.
- All user guides now have Korean (`.ko.md`) translations.

### Verification (v0.3)

- 322 / 322 tests pass (excluding pre-existing failures in
  `tests/validation`, `tests/e2e`, `tests/config` that predate v0.3).
- `tsc --noEmit` clean.
- 17 bundle entry points; 34 runtime files emitted to `dist/`.

---

## [0.2.0] — 2026-05-15

Feature-complete MVP. The framework gained all of its "v0.2
promised" modules.

### Added

- **`@kabyeon/nexusjs/auth`** — better-auth integration. `AuthService`,
  `AuthController`, `authMiddleware`, `@CurrentUser()` decorator.
- **`@kabyeon/nexusjs/queue`** — BullMQ + Cloudflare Queues + memory backends.
  `@OnQueueReady` decorator, `QueueService.add/process`, retry
  policy, `nx make:queue` scaffold.
- **`@kabyeon/nexusjs/schedule`** — In-tree cron parser (no `croner` /
  `node-cron` deps). `@Cron` / `@Interval` / `@Timeout`
  decorators. `nx make:schedule` scaffold.
- **`@kabyeon/nexusjs/events`** — `NexusEventEmitter` with wildcards
  (`*` / `**`), priorities, guards. `@OnEvent` decorator.
- **`@kabyeon/nexusjs/session`** — Cookie (HMAC) + memory backends. Session
  rotation, sliding expiry, `nx make:session` scaffold.
- **`nx` CLI** — 12 commands: `new`, `init`, `make:crud`,
  `make:controller`, `make:service`, `make:module`, `make:model`,
  `make:migration`, `make:middleware`, `make:validator`, `info`,
  `route:list`.

### Changed

- `@CurrentSession` → `@Session` (current alias kept for
  migration).
- Package version bumped to `0.2.0`.

### Verification (v0.2)

- 117 / 117 tests pass.
- 7 bundle entry points; clean typecheck.

---

## [0.1.0] — 2026-04-30

Initial release. **feature-complete MVP core.**

### Added

- **Core MVC**:
  - `@Controller`, `@Get`, `@Post`, `@Put`, `@Delete`, `@Patch`,
    `@Options`, `@Head` HTTP method decorators.
  - `@Req`, `@Res`, `@Next`, `@Body`, `@Query`, `@Param`,
    `@Headers`, `@Ctx`, `@User` parameter decorators.
  - Three routing styles: **Nest** (class decorators),
    **Adonis** (router table), **Functional** (Hono-native).
- **DI container** — class-based injection with `@Injectable`,
  `@Inject`, `Symbol.for("nexus:X")` tokens, `useExisting`,
  `useFactory`, `useValue` providers, request-scoped lifecycle.
- **Validation pipeline** — Zod schemas via `@Validate` decorator.
- **View engines**:
  - **Rendu** (Bun-native, default).
  - **Edge** (Adonis-style).
  - **Inertia.js adapter** — full SPA UX without an API.
    Asset versioning, lazy-evaluation helpers, merge props.
- **Runtime**:
  - Bun (default).
  - Node (≥ 18) supported via Hono.
  - Cloudflare Workers (Hono adapter).
- **CLI bootstrap** — minimal scaffold tool.

### Verification (v0.1)

- 24 / 24 tests pass.
- Single bundle entry point; clean typecheck.

---

[0.6.2]: https://github.com/kabyeon/@kabyeon/nexusjs/compare/v0.6.1...v0.6.2
[0.3.0]: https://github.com/kabyeon/@kabyeon/nexusjs/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/kabyeon/@kabyeon/nexusjs/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/kabyeon/@kabyeon/nexusjs/releases/tag/v0.1.0
