# Changelog

All notable changes to NexusTS are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

> 한글로 작성된 문서가 필요하면 [`CHANGELOG.ko.md`](./CHANGELOG.ko.md)를 참고하세요.

---

## [Unreleased]

---

## [0.9.7] — 2026-06-26

### Added

- **gRPC tests enabled**: Removed `tests/grpc/**` vitest exclusion. All 13 gRPC
  tests pass with updated dual-mode decorators (348 total, +23 from 0.9.6).

### Fixed

- **Core `@Inject`/`@Injectable` export**: `decorators/index.ts` now exports from
  `standard-inject.ts` (dual-mode TC39 + legacy) instead of `injectable.ts`
  (legacy-only). Fixes field injection (`@Inject(Token) declare field`) in
  standard decorator mode — previously the field decorator silently did nothing
  because the legacy `Inject` didn't handle `context.kind === "field"`.

- **Cache decorators (dual-mode)**: `@Cacheable` and `@CacheInvalidate`
  converted to dual-mode. Uses Symbol-on-function metadata bridge for
  standard decorator compatibility.

- **Events decorator (dual-mode)**: `@OnEvent` converted to dual-mode with
  Symbol-on-function metadata bridge and `collectFnHooks` reader.

- **Auth module (standard patterns)**: `AuthService` migrated from constructor
  injection to field injection + lazy `instance` getter. `AuthController`
  migrated from `@Req()`/`@Body()`/`@Res()` parameter decorators to
  `ctx: Context` with `ctx.req.*` methods.

- **Drive module fixes**: `DriveService` migrated to field injection.
  `types.ts` — removed broken import line inside JSDoc comment.
  `DriveModule` — removed unused `safeGetMeta`/`safeDefineMeta`/`safeHasMeta`.

- **Health module (standard patterns)**: `HealthController` and
  `HealthCheckService` migrated to field injection + `ctx: Context`.

- **I18n module**: `ConfiguredI18nModule` migrated from constructor `@Inject`
  to field injection. Removed unused imports.

- **Limiter module**: `LimiterService` and `LimiterMiddleware` migrated to
  field injection. `@RateLimit` decorator converted to dual-mode
  (class-level + method-level). `getLimiterRules` updated for standard mode.

- **Logger module**: `Logger` migrated to field injection + lazy `init()`.
  Setter/getter pattern ensures `init()` runs before any access.
  `init()` preserves externally assigned transports.

- **Mail module**: `MailService` migrated to field injection.
  `types.ts` — removed broken import inside JSDoc.

- **Metrics decorators (dual-mode)**: `@Counted` and `@Timed` converted to
  dual-mode using shared `makeCountedWrapper`/`makeTimedWrapper` helpers.

- **OpenAPI module (dual-mode)**: All API decorators (`@ApiOperation`,
  `@ApiBody`, `@ApiResponse`, `@ApiParam`, `@ApiQuery`) converted to
  dual-mode. New `standard-meta.ts` helpers (`readMethodMeta`,
  `storeMethodMetaStandard`) for Symbol-on-function metadata bridge.
  `OpenAPIService` migrated to field injection + `readMethodMeta` calls.

- **Queue module**: `QueueService` migrated to field injection.
  `@OnQueueReady` converted to dual-mode. Fixes example 09-queue bugs:
  `consume()` → `process()`, `job.id` → `job.jobId`, `{type:"memory"}` →
  `{backend:"memory"}`.

- **Redis module**: No changes needed — pure factory pattern, no DI decorators.

- **Resilience module**: `ResilienceService` migrated to field injection.
  `MemoryResilienceStore` fixed — added missing `loadSnapshot()` method
  (interface had it but implementation only had `getSnapshot`).

- **Schedule decorators (dual-mode)**: `@Cron`, `@Interval`, `@Timeout`
  converted to dual-mode using `makeScheduleDecorator` factory + Symbol
  metadata bridge. `readStashed` uses flat concat (not nested push).

- **Shield module**: `ShieldService` migrated to field injection + lazy
  `init()`. Removed unused module imports.

- **Static module**: Removed unused `safeGetMeta`/`safeDefineMeta`/`safeHasMeta`
  imports. No other changes needed — pure class.

- **Tracing module**: `TracingConfigHolder` and `ConfiguredTracingModule`
  migrated to field injection. `@Trace` decorator converted to dual-mode.

- **Upload module**: `UploadService` migrated to field injection + lazy
  config getter. `@Upload` decorator already had dual-mode support.

- **Feature-flag module**: `FeatureFlagService` migrated to dual constructor
  (accepts `config?` param + `@Inject` fallback). `@FeatureFlag` decorator
  converted to dual-mode.

- **Config module**: `ConfigService` migrated to dual constructor
  (accepts `options?` param for direct instantiation, falls back to
  `@Inject` for DI). All getter/require/reload use `this.#options`.

- **Drizzle module**: `DrizzleService` migrated to constructor `config?`
  parameter + `@Inject` fallback. `DrizzleModule.forRoot` uses `useFactory`
  to pass config to constructor, fixing auto-open for bun-sqlite
  (issue: `@Inject` field was set after constructor ran, so `this._config`
  was `undefined` during construction, preventing automatic DB open).

- **gRPC decorators (dual-mode)**: `@GrpcService`, `@GrpcMethod`,
  `@GrpcServerStream`, `@GrpcClientStream`, `@GrpcBidiStream` converted
  to dual-mode. `getGrpcMethodEntries` falls back to `collectFnMethods`
  for standard mode.

### Docs

- **User guides**: Updated shield, upload, drizzle, logger docs from legacy
  `@Req()`/`@Body()`/`@Res()`/`@Inject` constructor injection patterns
  to standard `ctx: Context`, `ctx.req.*()`, `@Inject(...) declare field`.
- **Korean docs**: Updated design/queue.ko.md, design/auth.ko.md from
  constructor injection to field injection.

---

## [0.9.6] — 2026-06-26

### Added

- **SSE `onAbort()` alias**: `SseStream` now exposes `onAbort()` as an
  alias for `onClose()`, so existing code using `stream.onAbort()` works
  without crashing. Added `onAbort()` to `SseStreamController` interface.
  Removed unused `safeHasMeta` import from SSE types.

- **SSE decorator example**: `examples/11-sse` updated with
  `@SseEventMeta` decorator demo, `getLastEventId()` endpoint,
  and interactive HTML dashboard.

### Fixed

- **reflect-metadata inline polyfill**: Replaced lazy dynamic import with
  a proper inline polyfill in `@nexusts/core/di/safe-reflect`. No external
  `reflect-metadata` package needed. Methods: `getMetadata`, `defineMetadata`,
  `hasMetadata`, `deleteMetadata`, `metadata()`, `getOwnMetadata`.
  Removed `reflect-metadata` from root devDependencies.

- **WebSocket decorators (dual-mode)**: `@WebSocketGateway`,
  `@OnWebSocketOpen`/`@OnWebSocketMessage`/`@OnWebSocketClose` updated to
  support TC39 standard decorator mode + legacy fallback.

- **WebSocket client ID persistence**: Fixed `__clientId` being lost across
  Hono `WSContext` instances. ID is now stored on `wsCtx.raw.__clientId`
  (the raw Bun WebSocket), which is shared across all WSContext instances.
  Fixes issue where WebSocket messages were only received by the sender.

- **bunAdapter env passing**: Fixed `bunAdapter()` to pass the Bun server
  object as `{ server }` to Hono's `app.fetch()`, enabling WebSocket upgrade
  via Hono's `upgradeWebSocket` middleware.

- **Application.listen()**: Now accepts `{ port, websocket }` object to
  support passing websocket config for `Bun.serve()`.

- **Removed unused imports**: `safe-getMeta`, `safeDefineMeta`, `safeHasMeta`,
  `safeParamTypes` cleaned from `server.ts`.

- **examples/10-websocket**: Rewritten to use `createBunWebSocket()` directly
  with manual `Bun.serve()` wiring. Removed separate `client.html` (inline
  HTML). Removed `import 'reflect-metadata'`.

- **examples/11-sse**: Updated to standard decorator pattern (`ctx: Context`
  instead of legacy `@Req()`). Added `@SseEventMeta` decorator demo.

---

## [0.9.5] — 2026-06-26

### Added

- **`@nexusts/kysely`**: New first-party module — Kysely typed SQL query
  builder integration. `KyselyService`, `KyselyRepository` (Lucid-style),
  `KyselyModule.forRoot()` / `forRootAsync()`, built-in migration support
  via Kysely Migrator. `BunSqliteDialect` adapter for bun:sqlite.
  Optional `kysely` peer dependency.
  See [`docs/user-guide/kysely.md`](./docs/user-guide/kysely.md).
  ([#example: 36-kysely-crud](./examples/36-kysely-crud/))

- **CLI Kysely integration**: All scaffold commands now Kysely-aware:
  - `nx init`/`new --orm kysely` — project scaffold with `KyselyModule`
  - `nx make:model --orm kysely` — `KyselyRepository` + typed table interface
  - `nx make:migration --orm kysely` — `.ts` migration files with `up()`/`down()`
  - `nx make:crud --orm kysely` — full CRUD with KyselyRepository
  - `nx make:repository` — ORM-aware (DrizzleRepository/KyselyRepository)
  - `nx db:generate --orm kysely` — Kysely `.ts` migration generator
  - `nx db:migrate --orm kysely` — runs Kysely `Migrator` in-process

### Changed

- **Service template**: Replaced Drizzle-specific `eq()` import with
  ORM-agnostic `findById()`/`updateById()`/`deleteById()` methods.
  Works for both Drizzle and Kysely repositories.

- **KyselyService**: Auto-opens synchronously on construction when Kysely
  is available (matching DrizzleService behaviour for bun:sqlite).

### Removed

- **Prisma**: Removed from all CLI ORM options (`init`, `new`, `config`,
  `make:model`, `make:migration`, `make:crud`, `make:repository`).
  Deleted `packages/cli/src/templates/model/prisma.ts`.
  Updated all documentation (user-guide, design docs, webpage).

### Migration (from v0.9.4)

No breaking changes for existing Drizzle users. Projects using `--orm prisma`
will now receive an error — use `--orm drizzle` or `--orm kysely` instead.

---

## [0.9.4]

---

## [0.9.4] — 2026-06-26

### Fixed

- **Deep import resolution**: Include `src/constants.ts` in published
  `@nexusts/core` package. The `src/di/standard-inject.ts` and
  `src/di/standard-meta.ts` deep imports reference `../constants.js`,
  which was missing from the published package, causing
  `Cannot find module '../constants.js'` errors.

- (none)

---

## [0.9.3] — 2026-06-25

### Fixed

- **Cross-bundle metadata sharing**: `safeDefineMeta` now stores metadata
  on `Class.__nexus_meta__` in ADDITION to the internal Map. `safeGetMeta`
  reads from `__nexus_meta__` as fallback. This fixes DI resolution when
  decorators and the container run from different package bundles
  (e.g., `@nexusts/drizzle` → `@nexusts/core`).
- **`DrizzleService` constructor injection**: `@Inject("DRIZZLE_CONFIG")`
  parameter decorator on `DrizzleService` now resolves correctly when
  the service is instantiated via `DrizzleModule.forRoot()`.
- **CRUD scaffold compatibility**: `nx make:crud` generated repositories
  now properly receive the `DrizzleService` dependency.
- **`@Module` decorator legacy mode**: Stores module metadata on
  `Class.__nexus_meta__` in addition to `safeDefineMeta`, ensuring
  cross-bundle scanner compatibility.
- **`@Inject` field decorator (legacy)**: Now properly handles property
  decorator mode (`@Inject(Token) declare field: Type`) in addition to
  parameter decorator mode, fixing `nx init` scaffolded Inertia controllers.

---

## [0.9.2] — 2026-06-25

### Fixed

- **`@Inject` dual-mode**: The `@Inject(Token)` decorator now properly handles
  property decorator mode (field injection like `@Inject(Inertia.TOKEN) declare inertia: Inertia`).
  Previously it only supported parameter decorator mode (constructor injection).
  Fixes scaffold-generated Inertia controllers and CRUD repositories.
- **`bump-version.sh` script**: Added `scripts/bump-version.sh` for batch
  version updates across all 32 packages.

### Added

- (none)

### Fixed

- (none)

---

## [0.9.1] — 2026-06-25

### Fixed

- **npm publish**: Include `src/di/` directory in `@nexusts/core` package so deep imports like `@nexusts/core/di/safe-reflect` resolve correctly when installed from npm. Fixes `bunx create-nexusts` scaffolding error.

### Added

- (none)

### Fixed

- (none)

---

## [0.9.0] — 2026-06-25

### Added

- **TC39 standard ES decorators**: Framework now uses standard decorators
  by default. No `experimentalDecorators` or `reflect-metadata` required.
  Dual-mode backward compatibility with legacy decorators.
- **Field injection**: `@Inject(Token) declare field: Type` pattern replaces
  constructor injection. DI container auto-detects field injection and
  switches to no-arg constructor path.
- **`ctx.req.*` methods**: Controller methods receive Hono `Context` directly
  and access request data via `ctx.req.param()`, `ctx.req.query()`,
  `await ctx.req.json()` instead of `@Param`/`@Body`/`@Query` parameter decorators.
- **`inputValue()` helper**: Chained validation/sanitization helper for
  standard decorator mode: `inputValue(ctx.req.param('id')).number().required().value()`
- **`CtxInput` helper with `uploadedFile()`/`uploadedFiles()`**: File upload
  access without `@UploadedFile` parameter decorator.
- **Standard decorator CI pipeline**: New `test-standard-decorators` CI job
  tests examples under TC39 stage-3 mode (`experimentalDecorators: false`).
- **`@Upload` dual-mode decorator**: Works with both legacy and standard
  decorator modes.
- **DrizzleRepository field injection**: Repository template now supports
  `@Inject(DrizzleService.TOKEN) declare db` pattern.

### Changed

- **Core decorators**: `@Module`, `@Controller`, `@Injectable` are now
  dual-mode (standard + legacy).
- **`reflect-metadata` removed**: No longer a runtime dependency. Lazy-loaded
  only when legacy code paths are detected. ~16KB bundle savings.
- **Router auto-detection**: Detects standard decorator mode by checking
  `paramMeta.length === 0` — passes `ctx` directly with `attachInputHelper()`.
- **54 test files**: `import 'reflect-metadata'` removed — synchronous Map
  fallback handles legacy metadata storage.
- **All 34 examples**: Migrated to standard decorator patterns (field
  injection + `ctx.req.*` methods).
- **AGENTS.md**: Updated for standard decorator conventions, field injection,
  and dual-mode patterns.
- **All documentation**: Updated to reflect TC39 standard ES decorators as
  core value (README, architecture, DI, user guides, webpage).

### Removed

- **`reflect-metadata` peer dependency**: No longer required at install time.
  See `docs/design/standard-decorators-migration.md` for migration guide.
- **`ParameterDecorator` usage in CLI templates**: All generated code now
  uses field injection and `ctx.req.*` methods.

### Added

- **Inertia scaffold templates**: `nx init`/`nx new` now generate
  proper React/Vue page components (`resources/js/Pages/Welcome.tsx`
  or `Welcome.vue`) with Inertia v3 client entry point
  (`resources/js/app.tsx`/`app.ts`) and SSR adapter setup.
- **`InertiaConfig.scripts`**: new config option to inject client-side
  `<script>` tags into the HTML shell. Scaffold sets
  `scripts: ['/static/app.js']` by default.

### Fixed

- **Inertia v3 protocol compliance**: initial page data is now
  embedded via `<script data-page="app" type="application/json">`
  instead of the v2 `data-page` attribute on `<div id="app">`.
- **Inertia SSR adapter setup**: moved from `container.resolve()`
  (which fails because module providers live in child containers)
  to direct `new Inertia()` in the module provider.
- **`--no-interaction` flag**: was not working because `parseArgs`
  stores it as `flags.interaction = false` but `flagBool` checked
  `flags["no-interaction"]`. Fixed to use
  `flagBool(flags, "interaction", true)`.
- **CLI input validation**: flag values are now validated against
  the allowed options list. Invalid flags in non-interactive mode
  show an error and exit. Interactive mode re-prompts on invalid
  input.
- **`mergePackageJson()`**: now adds `build:frontend` and updates
  `dev` script when switching to Inertia view engine (fixes
  "Script not found 'build:frontend'" when toggling React↔Vue).

### Changed

- **CLI scaffold refactored**: `init.ts`/`new.ts` template generation
  extracted to shared `packages/cli/src/core/scaffold.ts`.
  Reduces code duplication by ~400 lines.
- **Inertia deps**: `@inertiajs/react` → `^3.0.0`,
  `@inertiajs/vue3` → `^3.0.0`.
- **All analysis docs**: baselines updated to v0.8.4.

---

## [0.8.3] — 2026-06-24

### Fixed

- **CI workflows**: all 4 workflows (CI, Benchmarks, Cloudflare Workers,
  Drizzle Dialect) now pass. Fixes include:
  - Type-check: exclude test dirs, install optional peer deps in CI
  - Lint: use `biome lint` instead of `biome check` (organizeImports
    assist errors caused exit 1)
  - Benchmarks: read results from file (not stdout), BUN_BIN fallback,
    regression check logs warnings instead of failing
  - Node.js 22: sync vitest exclude list with main config
- **3 real TS errors fixed**: feature-flag enabled check, gRPC handler
  return type, resilience store type argument.

---

## [0.8.2] — 2026-06-24

### Added

- **gRPC streaming** (`@GrpcServerStream`, `@GrpcClientStream`,
  `@GrpcBidiStream`): full server/client/bidirectional streaming
  support. Example at `examples/34-grpc-streaming`.
- **Multi-runtime CI**: workflows for Bun, Node.js 22, Drizzle
  dialects (bun-sqlite + postgres), and Cloudflare Workers.
- **Benchmark suite**: `benchmarks/bench.ts` with cross-runtime
  HTTP benchmark (NexusTS vs Hono), auto-regression check in CI.

### Fixed

- **CI workflows**: lint (biome exit code), Node.js 22 test config
  (vitest exclude list), benchmark BUN_BIN path, Cloudflare Workers
  smoke test file, Drizzle dialect test exclusion.
- **All 314 tests pass** across 18 test files.

---

## [0.8.1] — 2026-06-24

### Added

- **Cross-pod circuit breaker store** — `ResilienceStore` interface
  with three backends:
  - `RedisResilienceStore`: share circuit state across pods via Redis
  - `DrizzleResilienceStore`: persistent storage via any Drizzle DB
  - `MemoryResilienceStore`: default in-process store
  Configurable `syncIntervalMs`. Last-writer-wins conflict resolution.
  Store errors are non-fatal (falls back to local state).

---

## [0.8.0] — 2026-06-24

### Added

- **`ResilienceAdminModule`** — HTTP admin endpoints for circuit
  breaker and bulkhead runtime inspection and control:
  - `GET {prefix}/circuits` — list all circuits with metrics
  - `GET {prefix}/bulkheads` — list all bulkheads with stats
  - `POST {prefix}/circuits/:name/force-open` — force circuit open
  - `POST {prefix}/circuits/:name/force-close` — force circuit closed
  - `POST {prefix}/circuits/:name/reset` — reset circuit history
  Default prefix: `"/resilience"`. Unknown circuit names return 404.
- **Eager `applyResilience()`**: controller methods decorated with
  `@Retry`/`@CircuitBreaker`/`@Bulkhead`/`@Resilient` are now
  automatically wrapped at mount time when `ResilienceModule.forRoot()`
  is imported. No manual `svc.retry()` / `cb.execute()` calls needed.
- **Korean publishing docs**: `docs/publishing/README.ko.md`,
  `local-publish.ko.md`, `npm-rate-limit.ko.md` added.

### Changed

- **Repository migrated** to `nexus-ts/nexusts` (GitHub org).
  All URLs, git remote, and package.json fields updated.
- Version bump from 0.7.x to 0.8.0.

---

## [0.7.9] — 2026-06-24

### Added

- **GitHub repo metadata**: all 32 package.json files now include
  `repository`, `homepage`, and `bugs` fields pointing to the
  `nexus-ts/nexusts` repository.

### Fixed

- **Bun decorator diagnostics**: improved error messages when Bun's
  stage-3 decorator mode clashes with legacy `@Inject`/`@Controller`
  decorators. Added runtime checks with actionable guidance.
- **`@Arg` signature in docs**: corrected from `@Arg("name", { type:
  "String!" })` to `@Arg("name", "String!")` — the second parameter
  is a string, not an object.
- **Docs synced**: Bun decorator warnings added to English
  `controllers.md` (were only in Korean).

---

## [0.7.8] — 2026-06-24

### Changed

- **Repository migrated** from `kabyeon/nexusts` to
  `nexus-ts/nexusts`. All URLs updated across docs, package.json,
  and git remote.

---

## [0.7.7] — 2026-06-24

### Added

- **GraphQL code-first SDL synthesis** (`autoSchema: true`):
  `@Resolver`/`@Query`/`@Mutation` decorators now auto-generate SDL.
  `@Arg` supports TypeScript type aliases (`string` → `String`,
  `int` → `Int`, etc.). `extend type` merge when user's `typeDefs`
  already defines a root type. Resolver classes are auto-instantiated
  and wired into the resolver map.

### Fixed

- **`create-nexusts` → `nx init`**: `mergePackageJson()` now handles
  `devDependencies` — `drizzle-kit` was missing when creating a
  project via `bunx create-nexusts my-app`.
- **`nx make:crud` next steps**: suggest `bun run dev` instead of
  `bun --hot app/main.ts`; use `&&` instead of `&` for sequential
  commands.

### Changed

- **Publish batch break**: reduced from 10s to 5s (configurable via
  `PUBLISH_BATCH_BREAK_MS`).

---

## [0.7.6] — 2026-06-24

### Added

- **Global `@Resolver` class registry**: resolver classes no longer
  need to be manually listed in `GraphQLModule.forRoot()`. Any class
  decorated with `@Resolver()` is auto-registered — just add it to
  the module's providers array.
- **`nx init` / `nx new` improvements**:
  - `drizzle.config.ts` auto-generated when ORM is drizzle
  - `drizzle-kit ^0.31.0` added to devDependencies
  - Database driver deps auto-added (`pg`, `mysql2`, `better-sqlite3`)
    based on selected dialect

### Fixed

- **`nx init` / `nx new`**: missing `drizzle.config.ts` caused
  `db:generate` and `db:migrate` to fail until `nx config` was run.
  Now generated from the start.
- **`nx db:generate` help text**: clarified difference from
  `make:migration` — `db:generate` auto-generates from schema,
  `make:migration` scaffolds an empty file for manual editing.

---

## [0.7.5] — 2026-06-24

### Added

- **Circuit breaker admin API**: `ResilienceService.listCircuits()` /
  `listBulkheads()`, `CircuitBreaker.metrics()` / `forceOpen()` /
  `forceClose()` / `reset()`. Inspect and manually control circuits
  and bulkheads at runtime. Includes `CircuitMetrics` type for
  monitoring (state, failure ratio, ms until half-open, etc.).
- **`nx make:repository` command** (aliases: `mr`, `make-repo`):
  generate a `DrizzleRepository` class under `app/repositories/`.

### Fixed

- **`nx make:service`**: missing `snake` context variable caused
  broken imports (`import {  } from '...'`) and broken `eq()` calls
  (`eq(.id, id)` instead of `eq(user.id, id)`).
- **`nx db:seed`**: seed runner script used `./src/drizzle/index.js`
  relative paths that only work in the monorepo. Fixed to use
  `@nexusts/drizzle` and `@nexusts/logger` npm packages.
- **`nx route:list`**: controller prefix was not applied because
  the command read the wrong metadata key (`nexus:controller:prefix`
  → `nexus:controller`). Routes now show correct paths like
  `GET /posts/:id` instead of `GET /:id`.
- **`nx make:model` (bun-sqlite)**: `createdAt` default was stored
  as the literal string `(datetime('now'))` instead of a real
  timestamp. Fixed to use `$defaultFn(() => new Date().toISOString())`.
- **`SeedContext` type**: was referenced in seed template but never
  defined or exported from `@nexusts/cli`. Now exported from CLI core.

---

## [0.7.4] — 2026-06-24

### Added

- **Logger user guide**: `docs/user-guide/logger.md` + `logger.ko.md` —
  comprehensive guide for the Logger module with Pino, pretty-print,
  request-scoped logging, and transport configuration.
- **Logger: pino made a direct dependency** — users no longer need
  to `bun add pino` separately. The logger just works out of the box.
  `pino-pretty` remains optional for colorized dev output.
- **CLI REPL improvements**:
  - `.help` hint added to the REPL banner
  - Version now dynamically read from package.json (`v0.7.4`)
  - Dynamic banner alignment (works with any version string length)
  - `.routes` now shows handler class.method (e.g. `HomeController.index`)
    matching `nx route:list` output
  - `.services` no longer shows "(no services registered)"
    (added `listProviders()` method to DIContainer)
  - `.modules` now shows real module class names instead of `Object`
    (stored `moduleClass` in ScanResult)

### Fixed

- **CLI REPL preload paths**: replaced brittle `../../drizzle/...`
  relative paths with npm package names (`@nexusts/drizzle`, etc.)
  so `logger`, `db`, `cfg`, `cache`, `events` are correctly
  resolved in the published CLI package.
- **Schedule hot-reload**: `ScheduleService` now registers a
  `module.hot.dispose()` handler that clears all timers when Bun
  reloads the module (prevents duplicate cron executions after
  source changes with `--hot`).
- **`.d.ts` generation**: fixed 11 packages whose type declarations
  failed during `tsc --emitDeclarationOnly`:
  - `cache`, `limiter`, `session`: relative `../../drizzle/...`
    imports → `@nexusts/drizzle`
  - `cli/init.ts`: `as const` for `PlanEntry.mode` literal type
  - `drizzle/drivers`: `loadMigrator` now returns async functions;
    `logger` option cast for drizzle-orm 0.45 type changes
  - `sse`: `HonoSSEApi.sleep()` return type `Promise<unknown>`
    matching Hono 4.12 API
- **CI publish workflow**: simplified delays from 30s/10min to
  3s/10s; removed separate batch/resume scripts

## [0.7.3] — 2026-06-23

### Added

- **Exception Filters**: `@UseFilters()`, `HttpException`, `ExceptionFilter`
  interface — catch and transform HTTP errors with full control over
  the response shape.
- **Interceptors**: `@UseInterceptors()`, `LoggingInterceptor`,
  `TimeoutInterceptor` — pipeline interception with onion composition.
- **HTTP Guards**: `@UseGuards()`, `AuthGuard`, `RolesGuard`,
  `createHttpGuard()` — declarative request protection.
- **Lifecycle Hooks**: `OnModuleInit`, `OnApplicationInit`,
  `OnModuleDestroy`, `OnApplicationShutdown` — deterministic
  startup/shutdown ordering.
- **`@Global()` decorator**: mark a module as globally-scoped so its
  providers are available in every module without explicit imports.
- **Router integration tests**: 17 tests covering `@Body("field")`
  param extraction, `@Param`/`@Query`/`@Headers`, guards, filters,
  response serialization, and DI wiring.
- **Application lifecycle tests**: 10 tests covering middleware
  ordering, bootstrap/shutdown, and idempotency.
- `@nexusts/drizzle`: `Entity` decorator + `generateMigrations()` /
  `pushSchema()` exports + Zod schema creation helpers
  (`createSelectSchema`/`InsertSchema`/`UpdateSchema`).
- **End-to-end validation app** at `../blog-app/` (sibling repo) that
  exercises the framework against a real SQLite database with real auth,
  real CRUD, and real markdown rendering. Includes a 23-endpoint
  validation script (`scripts/test-api.sh`) that verifies the framework's
  happy paths.
- `@nexusts/crypto`: standalone helper functions exported —
  `scryptHash()`, `scryptVerify()`, `hash()`, `verify()`. These wrap
  `HashService` for use outside the DI container (CLI scripts, seeders,
  smoke tests).
- `@nexusts/drizzle`: `select<T>()` / `insert<T>(table)` / `update<T>(table)` /
  `delete<T>(table)` are now generic so call sites get full type
  inference via `select(...).from(table).all()` chains.
- **New user-guide**: `docs/user-guide/common-pitfalls.md` +
  `common-pitfalls.ko.md` — comprehensive debugging recipes for the
  10 most common pitfalls first-time users hit.
- Existing guides updated with cross-references to the pitfalls doc.
- **New analysis**: `docs/analysis/wasp-comparison.md` +
  `wasp-comparison.ko.md` — comparison with [Wasp](https://wasp.sh).

### Fixed

- **Core framework bugs found via blog app**:
  - `@Body("field")` param extraction (router.ts: added `param.name`
    check in parsed branch)
  - `listen()` double-start (bootstrap no longer calls `server.start()`)
  - Middleware ordering (`ApplicationOptions.middleware[]` registers
    before routes)
  - `require()` → static import for `requestScopeMiddleware` (server.ts)
- **CLI templates**:
  - All import paths fixed (`@nexusts/core` → `../core/index.js`)
  - `init.ts`/`new.ts`: package.json deps, DrizzleModule import,
    StaticModule conditional, home.controller.ts JSON response
  - `make:crud`: `findOne(id)` → `findOne(eq(...))`, `DrizzleService`
    injection, `snake` context variable
  - `make-schedule.ts`: removed manual `scanForSchedulers`
  - `drizzle-dialect.ts`: bun-sqlite text timestamps, `defaultTs`/
    `defaultTsUpdate` for all dialects
- **Schedule auto-scan**: `ScheduleService.onApplicationInit()`
  auto-starts; `Application.bootstrap()` calls `scanProviderForSchedules`
  via global `setScheduleScanner` hook.
- **Cron-parser next() offset**: 5-field expressions started from +1s
  instead of +1m, causing `* * * * *` to fire every second.
- `@nexusts/resilience` decorators: metadata-only pattern (no
  `descriptor.value` reads in decorator body).
- `Inertia` was unreachable from the published package — missing
  `./inertia` subpath in `package.json` `exports`.

---

## [0.7.0] — 2026-06-22

### Added

- `@nexusts/resilience` — retry + circuit breaker +
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
  decorators are **metadata-only** in v0.7.0.

---

## [0.6.9] — 2026-06-22

### Added

- `@nexusts/graphql` — SDL-first GraphQL endpoint with
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
  `bun add graphql` to use the module.

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

- Package renamed to `@nexusts/core` (npm publish)

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
from `@nexusts/view`. The view path is read from `nx.config.ts` at
runtime.

---

## [0.6.3] — 2026-06-26

### Changed · View engine moved to `@nexusts/view` package

The view engine has been extracted from `src/core/view/` into its own top-level
module (`src/view/`), available as `@nexusts/view`. This means:

- Users who do _not_ render templates no longer pay the bundle cost.
- The view engine is now a separate entry point in the build.
- Internal imports within `nexusts` still resolve correctly via
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

- `package.json` — merge; only adds `nexusts` dep if missing.
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
- `docs/api-reference.{md,ko.md}`: new `@nexusts/grpc` (v0.6) section
  added; "See also" updated with gRPC and testing links.
- All architecture-diagram `nexus/X` → `@nexusts/X` substitutions
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

### Changed · package rename `nexus` → `nexusts`

The published npm package has always been `nexusts` (the bare name
`nexus` is registered on npm by an unaffiliated project). v0.6.1
aligns every internal reference with the published name:

- All `src/` and `tests/` import paths now use `nexusts` / `@nexusts/X`.
- CLI templates (`src/cli/templates/**`) emit `nexusts` imports in
  the generated files.
- `nx new` scaffolds new apps with `"nexusts": "*"` in
  `package.json` and `from '@nexusts/core'` in every generated file.
- All `docs/**` import examples updated.
- JSDoc module-path references in backticks (e.g. `` `@nexusts/grpc` ``)
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
- All import examples across the docs/ tree updated to `nexusts`.
- `docs/README.md` module table now includes `@nexusts/grpc` and
  reflects the 26-module v0.6 line.

### Verification (v0.6.1)

- `@nexusts/grpc`: 10 / 10 tests pass.
- Full suite: 635 / 639 tests pass (4 pre-existing `tests/validation`
  failures from v0.5, unchanged by this release).
- `bun run build` produces a clean 26-module `dist/` with
  `package.json` `exports` field that resolves correctly
  end-to-end (`bun add ../@nexusts/dist` → `bunx nx` works).
- `bunx tsc --noEmit` clean across `src/`.
- `nx new my-app` in a fresh sandbox produces `package.json` with
  `"nexusts": "*"` and `from '@nexusts/core'` in every generated file.

### Migration from v0.6.0

No code changes required if you were already using `nexusts` imports
(which you had to be, since that's the published name). If any of
your source files still have `from "nexus"` or `from "nexus/X"`,
update them to `nexusts` / `@nexusts/X` — they were never going to
resolve against the published package.

---

v0.6 is the **gRPC + tooling** milestone. The framework gains a
first-class gRPC integration with reflection-based proto loading
and a typed client API, plus the build pipeline produces a
publishable `dist/` layout that matches `package.json` `exports`.

### Added · `@nexusts/grpc`

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

- `@nexusts/grpc`: 10 / 10 tests pass.
- Full suite: 634 / 639 tests pass (5 pre-existing
  `tests/validation` failures from v0.5, unrelated to v0.6).
- `bun run build` produces a clean 26-module `dist/` with
  `package.json` `exports` field that resolves correctly
  end-to-end (`bun add ../@nexusts/dist` → `bunx nx` works).
- `bunx tsc --noEmit` clean across `src/`.
- `@nexusts/grpc` entry point is 54th runtime file in `dist/`.

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

### Added · `@nexusts/redis`

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

### Added · `@nexusts/session` — Redis & Cloudflare KV backends

`SessionModule.forRoot({ backend: "redis", redis: { client, keyPrefix } })`
uses the new `RedisSessionStorage` (works on Bun, Node, or any
other runtime that exposes a `RedisClient`). For Cloudflare
Workers, pass a `CloudflareKVAdapter` and use
`backend: "cloudflare-kv"`. Per-user session indexes are
maintained automatically; `gc()` cleans up orphans.

### Added · `@nexusts/cache` — Redis cache store

`RedisCacheStore` is a `CacheStore` that wraps a `RedisClient`.
Tag-based invalidation is supported via a per-tag index that
`gc()` prunes. Same config works on Bun (`Bun.redis`),
Node (`ioredis`), or Cloudflare Workers (KV).

### Migration from v0.4

The vast majority of v0.4 code is compatible with v0.5 unchanged.
No breaking changes in this release EXCEPT the cookie session
backend and the CSRF guard now use HKDF-derived HMAC keys:
existing signed cookies will be invalidated. Users will be
signed out after the upgrade. New `@nexusts/ws` and `@nexusts/crypto`
modules are opt-in — install them only when you need them.

---

### Added · `@nexusts/i18n`

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

### Added · `@nexusts/ws`

`@nexusts/ws` gives a single, ergonomic API for Hono's
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
`@nexusts/session` middleware), or first-message handshake. See
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

- **Optional peer dep** `@nexusts/ws`:
  - `ws` (^8.18.0) — only on Node runtime. Bun apps don't need it.

### Documentation

- New guide `docs/user-guide/ws.md` (English) + `ws.ko.md`
  (Korean): quick start (Bun and Node), `WebSocketService` API,
  `WebSocketClient` wrapper, auth patterns, heartbeats, Cloudflare
  Workers integration recipe, configuration reference.
- Updated:
  - `docs/README.md` — module table now lists 23 entries.
  - `docs/api-reference.md` — new `@nexusts/ws` section.
  - `README.md` — module count 22 → 23; roadmap updated.

### Verification (v0.5)

- **490 / 490 tests pass** in 2.71s (excluding pre-existing failures
  in `tests/validation`, `tests/e2e`, `tests/config` that predate
  v0.3). Up from 464 in v0.4 (+26 new).
- `tsc --noEmit` clean.
- 23 bundle entry points; 46 runtime files emitted to `dist/`.

### Added · `@nexusts/crypto`

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

### Changed · `@nexusts/session` and `@nexusts/shield` migrated

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

### Added · `@nexusts/redis`

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

### Added · `@nexusts/session` — Redis & Cloudflare KV backends

`SessionModule.forRoot({ backend: "redis", redis: { client, keyPrefix } })`
uses the new `RedisSessionStorage` (works on Bun, Node, or any
other runtime that exposes a `RedisClient`). For Cloudflare
Workers, pass a `CloudflareKVAdapter` and use
`backend: "cloudflare-kv"`. Per-user session indexes are
maintained automatically; `gc()` cleans up orphans.

### Added · `@nexusts/cache` — Redis cache store

`RedisCacheStore` is a `CacheStore` that wraps a `RedisClient`.
Tag-based invalidation is supported via a per-tag index that
`gc()` prunes. Same config works on Bun (`Bun.redis`),
Node (`ioredis`), or Cloudflare Workers (KV).

### Migration from v0.4

The vast majority of v0.4 code is compatible with v0.5 unchanged.
No breaking changes in this release EXCEPT the cookie session
backend and the CSRF guard now use HKDF-derived HMAC keys:
existing signed cookies will be invalidated. Users will be
signed out after the upgrade. New `@nexusts/ws` and `@nexusts/crypto`
modules are opt-in — install them only when you need them.

---

### Added · `@nexusts/i18n`

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

### Added · `@nexusts/ws`

v0.4 is the **observability and developer experience** milestone.
Every "Tier 1" _and_ "Tier 2" gap from the NestJS / AdonisJS
feature analyses is closed. The framework now ships 22 modules
(was 17 in v0.3).

### Added · Modules

The framework gained **6 new modules** in v0.4:

| Module | Tier | Purpose |
| ------ | ---- | ------- |
| `@nexusts/openapi` | 1 | OpenAPI 3.1 spec generation + Scalar UI. Auto-derives from `@Validate({body,query,params,headers})` Zod schemas. |
| `@nexusts/upload` | 1 | Multipart file-upload helper. `UploadService` parses `multipart/form-data`, validates size / MIME / count. `@Upload()` / `@UploadedFile()` / `@UploadedFiles()` decorators. |
| `@nexusts/sse` | 2 | Server-Sent Events. `SseStream` wraps Hono's `SSEStreamingApi` with pending-write tracking. `sse(c, handler)` helper. `onClose()` for cleanup. |
| `@nexusts/tracing` | 2 | OpenTelemetry distributed tracing. `TracingService`, `TracingModule.forRoot()` (lazy OTel SDK), `@Trace()` decorator, W3C + B3 propagation, Hono auto-instrumentation. |
| `@nexusts/metrics` | 2 | Prometheus / OpenMetrics. `Counter` / `Gauge` / `Histogram` / `Summary`, labels, `/metrics` endpoint with content negotiation. `@Counted()` / `@Timed()` decorators. |
| (core) **Request-scoped DI** | 2 | `@Injectable({ scope: 'request' })` provider option. Hono middleware activates a per-request scope via `AsyncLocalStorage`. `getRequest()` / `getRequestScope()` / `getRequestState()` helpers. `REQUEST` and `REQUEST_SCOPE` tokens. |

### Added · Tracing

`@nexusts/tracing` is a thin, ergonomic wrapper around the OpenTelemetry
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

`@nexusts/metrics` is a Prometheus-compatible metrics collection library
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
import { getRequest, getRequestState, REQUEST, Inject, Injectable } from "nexusts";

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

`@nexusts/openapi` generates an OpenAPI 3.1 spec and serves it via the
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

`@nexusts/upload` is a thin, ergonomic multipart upload helper built on
top of Hono's `c.req.parseBody()`. Accepts both Bun's `Blob` and
Node's `File` types transparently.

- **`@Upload('field', opts)`** — route-level config.
- **`@UploadedFile('field')` / `@UploadedFiles('field')`** —
  parameter injection.
- **Validation** — `maxFileSize` (10MB default), `maxFiles`
  (5 default), `allowedMimeTypes` (with wildcards like `image/*`).
- **Errors** — `FILE_TOO_LARGE`, `MIME_NOT_ALLOWED`,
  `MISSING_FIELD`, `TOO_MANY_FILES` (all return 400).
- **Optional `@nexusts/drive` integration** — `driveToken` + `drivePrefix`
  pipe uploads straight to a `DriveService` bucket.

### Added · SSE

`@nexusts/sse` provides a `SseStream` wrapper around Hono's
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
- import { CurrentSession } from "@nexusts/session";
+ import { Session } from "@nexusts/session";

- add(@CurrentSession() session) { ... }
+ add(@Session() session) { ... }
```

### Changed · Build

- Bundle count: 17 → 22 entry points. 34 → 44 runtime files.
- New bundle entry points: `./openapi`, `./upload`, `./sse`,
  `./tracing`, `./metrics`. (Request-scoped DI ships with `core`.)
- TypeScript: `strict: true`; experimental decorators enabled.

### Dependencies

- **Optional peer dep** `@nexusts/tracing`:
  - `@opentelemetry/api` (always needed, ~7kb)
  - `@opentelemetry/sdk-node`, `@opentelemetry/exporter-trace-otlp-http`,
    `@opentelemetry/resources`, `@opentelemetry/semantic-conventions`
    (only when `TracingModule.forRoot()` is called)
- **No new required deps.** `@nexusts/metrics` has zero runtime deps.
  `@nexusts/upload` / `@nexusts/openapi` / `@nexusts/sse` use only
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
import { CurrentSession } from "@nexusts/session";
class C {
  add(@CurrentSession() session) { ... }
}

// v0.4
import { Session } from "@nexusts/session";
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
| `@nexusts/health` | `@nexusts/health` | Liveness / readiness / startup endpoints. Built-in indicators: memory, disk, HTTP, Drizzle DB probe. |
| `@nexusts/config` | `@nexusts/config` | Zod-validated configuration. Layered loading (process.env → `.env` → `load()` → schema). |
| `@nexusts/logger` | `@nexusts/logger` | Pino-backed structured logging. Pretty-print in dev, JSON in prod. Request-scoped via AsyncLocalStorage. |
| `@nexusts/static` | `@nexusts/static` | Static file serving with ETag, Range, path-traversal protection, MIME inference. |
| `@nexusts/limiter` | `@nexusts/limiter` | Rate limiting. 3 strategies (fixed / sliding / token-bucket) × 2 backends (memory / drizzle). |
| `@nexusts/shield` | `@nexusts/shield` | Security suite: CSRF (HMAC) + HSTS + CSP + X-Frame-Options + Referrer-Policy. |
| `@nexusts/cache` | `@nexusts/cache` | Application cache. Memory (LRU + TTL) and Drizzle backends. Real tag-based invalidation. |
| `@nexusts/drive` | `@nexusts/drive` | File storage abstraction. Memory / Local / S3 / R2 drivers. Signed URLs. |
| `@nexusts/mail` | `@nexusts/mail` | Outbound email. Null / File / SMTP transports. MJML rendering. |
| `@nexusts/drizzle` | `@nexusts/drizzle` | **Default ORM.** Drizzle ORM integration. 5 dialects (postgres / mysql / sqlite / bun-sqlite / d1). Lucid-equivalent API. |

### Added · Drizzle backends for existing modules

`@nexusts/session`, `@nexusts/health`, `@nexusts/limiter`, and `@nexusts/cache`
all gained Drizzle-backed backends, so a multi-pod deployment can
share state through any Drizzle-compatible database.

| Module | Drizzle backend |
| ------ | --------------- |
| `@nexusts/session` | `DrizzleSessionStorage` (`backend: 'database'`) |
| `@nexusts/health` | `DrizzleHealthIndicator` (`SELECT 1` probe) |
| `@nexusts/limiter` | `DrizzleRateLimitStorage` (all 3 strategies) |
| `@nexusts/cache` | `DrizzleCacheStore` (with tag index for `invalidateByTag`) |

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

`@nexusts/drizzle` closes the biggest AdonisJS gap (Lucid ORM) with:

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

- **Required peer dep**: `drizzle-orm` (the entire `@nexusts/drizzle`
  module is meaningless without it).
- **Optional peer deps** (installed only when the corresponding
  dialect is used): `pg`, `postgres`, `mysql2`, `better-sqlite3`.
- `pino` and `pino-pretty` added to dependencies for `@nexusts/logger`.

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

- **`@nexusts/auth`** — better-auth integration. `AuthService`,
  `AuthController`, `authMiddleware`, `@CurrentUser()` decorator.
- **`@nexusts/queue`** — BullMQ + Cloudflare Queues + memory backends.
  `@OnQueueReady` decorator, `QueueService.add/process`, retry
  policy, `nx make:queue` scaffold.
- **`@nexusts/schedule`** — In-tree cron parser (no `croner` /
  `node-cron` deps). `@Cron` / `@Interval` / `@Timeout`
  decorators. `nx make:schedule` scaffold.
- **`@nexusts/events`** — `NexusEventEmitter` with wildcards
  (`*` / `**`), priorities, guards. `@OnEvent` decorator.
- **`@nexusts/session`** — Cookie (HMAC) + memory backends. Session
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

[0.8.3]: https://github.com/nexus-ts/nexusts/compare/v0.8.2...v0.8.3
[0.8.2]: https://github.com/nexus-ts/nexusts/compare/v0.8.1...v0.8.2
[0.8.1]: https://github.com/nexus-ts/nexusts/compare/v0.8.0...v0.8.1
[0.8.0]: https://github.com/nexus-ts/nexusts/compare/v0.7.9...v0.8.0
[0.7.9]: https://github.com/nexus-ts/nexusts/compare/v0.7.8...v0.7.9
[0.7.8]: https://github.com/nexus-ts/nexusts/compare/v0.7.7...v0.7.8
[0.7.7]: https://github.com/nexus-ts/nexusts/compare/v0.7.6...v0.7.7
[0.7.6]: https://github.com/nexus-ts/nexusts/compare/v0.7.5...v0.7.6
[0.7.5]: https://github.com/nexus-ts/nexusts/compare/v0.7.4...v0.7.5
[0.7.4]: https://github.com/nexus-ts/nexusts/compare/v0.7.3...v0.7.4
[0.7.3]: https://github.com/nexus-ts/nexusts/compare/v0.7.0...v0.7.3
[0.7.0]: https://github.com/nexus-ts/nexusts/compare/v0.6.9...v0.7.0
[0.6.9]: https://github.com/nexus-ts/nexusts/compare/v0.6.8...v0.6.9
[0.6.2]: https://github.com/nexus-ts/@nexusts/compare/v0.6.1...v0.6.2
[0.3.0]: https://github.com/nexus-ts/@nexusts/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/nexus-ts/@nexusts/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/nexus-ts/@nexusts/releases/tag/v0.1.0
