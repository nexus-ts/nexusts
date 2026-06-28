# AGENTS.md — NexusTS Contributor & Module-Author Guide

> A working guide for AI agents (and humans) developing, testing, and
> extending the NexusTS framework. The conventions here were derived
> from the v0.9 development cycle. Follow them — they exist
> because something broke when we didn't.

---

## 1. What this project is

`@nexusts/core` is a Bun-native fullstack framework. It
publishes **33 independent modules** (one entry point each under
`@nexusts/*`), so a user only ships the code they actually
import. The runtime is built on **TC39 standard ES decorators**
(dual-mode with legacy fallback) + **Hono** (HTTP) +
**Drizzle** (default ORM).

**The non-negotiables** (do not change these without a major version):

- **Runtime targets.** NexusTS supports **Bun** (primary) and
  **Cloudflare Workers** (edge). **Node.js is NOT supported.**
  All code must be compatible with both Bun's native runtime and
  Cloudflare Workers' edge runtime. Do not add Node.js-specific APIs
  (`fs`, `net`, `child_process`) directly — use platform-abstracted
  patterns or conditional imports. The CI matrix includes Bun
  (1.3.10 + latest) and Workers (via `wrangler`).

- **Decorator semantics.** We use **TC39 standard ES decorators** as
  the default. Bun 1.3+ ships stage-3 by default. Legacy decorators
  (`experimentalDecorators: true`) are supported through a dual-mode
  fallback in every decorator factory. New code MUST use standard
  patterns (field injection, `ctx.req.*` methods). See §6 below.
- **No `reflect-metadata` import required.** The framework ships an
  inline Reflect Metadata polyfill in `@nexusts/core/di/safe-reflect`.
  No external `reflect-metadata` package is needed. New modules MUST
  NOT import `reflect-metadata`.
  See §6 (Standard decorator patterns) below.
- **Each module is its own bundle entry point.** Add a new module →
  add a new `entrypoints:` line in `build.ts`, a new `./<name>` row
  in `package.json` `exports`, and a new include glob in
  `tsconfig.build.json`. Skipping any of these → smoke test
  silently fails for the new example.
- **Default ORM = Drizzle.** Anything that suggests TypeORM /
  Mongoose in docs is wrong. Update it.
- **Linting is biome-on-CLI-only.** `biome check src/cli/ tests/cli/`
  is what `bun run lint` runs. Don't try to biome-lint runtime
  modules — biome 2.x strict-decorator checks break them.

---

## 2. Repository layout

```
nexusts/                          # Monorepo root
├── packages/                     # 33 independently-published npm packages
│   ├── core/                     # @nexusts/core — main package (MVC + DI + routing + validation + view)
│   │   ├── package.json          # name: "@nexusts/core", depends on @nexusts/cli, @nexusts/view
│   │   ├── src/
│   │   └── README.md
│   ├── cli/                      # @nexusts/cli — `nx` command runner
│   ├── view/                     # @nexusts/view — view engines + Inertia.js v3 adapter
│   ├── auth/                     # @nexusts/auth — better-auth integration
│   ├── cache, config, crypto, drive, drizzle, events, graphql,
│   │   feature-flag, grpc, health, i18n, limiter, logger, mail,
│   │   metrics, openapi, queue, redis, resilience, schedule,
│   │   session, shield, sse, static, tracing, upload, ws/
│   │   # (26 more modules, all @nexusts/<name>)
│   └── ...                       # 33 packages total, each independently installable
├── tests/                        # Vitest suites (one directory per package's tests)
│   ├── auth, cache, ...          # one directory per module
│   ├── examples/                 # smoke test for examples/
│   └── e2e/                      # (mostly empty — reserved for future)
├── examples/                     # 36 working examples (1 per module) — also serves as smoke-test corpus
│   ├── 01-basic-mvc/ ... 27-request-scope/         # core/DI/etc.
│   ├── 28-inertia-react-spa/ 29-inertia-react-ssr/   # Inertia v3 examples
│   ├── 30-inertia-vue-spa/ 31-inertia-vue-ssr/     # Inertia v3 + Vue
│   ├── 32-graphql-hello/                            # GraphQL example
│   ├── 33-resilience-calls/                         # retry/circuit/bulkhead
│   ├── 34-grpc-streaming/                           # gRPC streaming
│   ├── 35-standard-decorators/                      # Standard decorator mode
│   └── 36-kysely-crud/                              # Kysely typed SQL query builder
├── create-nexusts/               # `bunx create-nexusts my-app` scaffolder
├── docs/
│   ├── user-guide/               # Step-by-step guides (en + .ko)
│   ├── design/                   # Architecture deep-dives (en + .ko)
│   └── analysis/                 # NestTS / AdonisTS gap analysis (en + .ko)
├── scripts/
│   └── clean-examples.sh         # Kills leftover example processes + port 3000
├── build.ts                      # Per-package Bun.build + tsc loop
├── package.json                  # Workspace root (npm workspaces: "packages/*")
├── tsconfig.json                 # Root config (standard decorators; useDefineForClassFields:false for Bun compat)
└── vitest.config.ts              # Vitest with @nexusts/* → packages/*/src aliases
```

---

## 3. Adding a new module — the canonical 7-step flow

This is the exact flow that produced `@nexusts/graphql` and
`@nexusts/resilience` in v0.7.0. Follow it in order.

### Step 1 — Design the public surface

Before writing any code, decide:

- **Module name** (singular, lowercase): `graphql`, `resilience`, not `GraphQLs` or `ResilienceModule`.
- **Optional peer-deps?** Anything big (e.g. `graphql`, `bullmq`,
  `ioredis`, `ws`) goes in `peerDependencies` + `peerDependenciesMeta.<dep>.optional: true`. Anything small (e.g. `retry`, `circuit-breaker`, `bulkhead` if you write them yourself) ships as pure TS with **zero** new runtime deps.
- **Public API style.** Three options:
  1. **Pure-function** (e.g. `retry()`): simplest, no DI.
  2. **Service + Module** (e.g. `CacheService` / `CacheModule.forRoot()`): for stateful things that need config.
  3. **Decorator + Service** (e.g. `@Cron` + `ScheduleService`): for "annotate a method, framework wires it up" patterns.

The **default is (2)** for most modules. Use (3) only when decorators
add real value over the function form. Use (1) for stateless helpers.

### Step 2 — Scaffold the directory

```bash
mkdir -p packages/<name>/src/decorators tests/<name>
```

Minimum file layout:

```
packages/<name>/src/
├── index.ts                  # public exports (the only file users see)
├── types.ts                  # Config types, public interfaces, error classes
├── <name>.service.ts         # the main service class (DI injectable)
├── <name>.module.ts          # the <Name>Module.forRoot(config) class
└── decorators/               # optional — only if (3) above
    ├── index.ts              # decorator barrel
    └── <decorator-name>.ts
```

`index.ts` is the **only** file other modules import from. The barrel
re-exports everything users need:

```ts
// packages/<name>/src/index.ts
export * from "./types.js";
export { <Name>Service } from "./<name>.service.js";
export { <Name>Module } from "./<name>.module.js";
export { <Decorator1>, <Decorator2>, apply<...> } from "./decorators/index.js";
```

### Step 3 — Implement the service and module

Look at an existing small module (`src/limiter/` or
`src/cache/`) for the exact pattern. The shape is:

```ts
// <name>.service.ts
import { Inject, Injectable } from "../core/decorators/index.js";

@Injectable()
export class <Name>Service {
  static readonly TOKEN = Symbol.for("nexus:<Name>");
  @Inject("<NAME>_CONFIG") declare config: <Name>Config;
  // public methods
}
```

```ts
// <name>.module.ts
import { Module } from "../core/decorators/module.js";
import { <Name>Service } from "./<name>.service.js";

@Module({
  providers: [<Name>Service, { provide: <Name>Service.TOKEN, useExisting: <Name>Service }],
  exports: [<Name>Service, <Name>Service.TOKEN],
})
export class <Name>Module {
  static forRoot(config: <Name>Config) {
    @Module({
      providers: [
        { provide: <Name>Service.TOKEN, useValue: new <Name>Service(config) },
        { provide: "<NAME>_CONFIG", useValue: config },
      ],
      exports: [<Name>Service.TOKEN, "<NAME>_CONFIG"],
    })
    class Configured<Name>Module {}
    Object.defineProperty(Configured<Name>Module, "name", { value: "Configured<Name>Module" });
    return Configured<Name>Module;
  }
}
```

### Step 4 — Wire it into the build

The build pipeline (`build.ts`) **auto-scans** `packages/` and
picks up any directory with a `src/index.ts`. No manual
`entrypoints:` registration needed.

However, you must still update these files:

`package.json`:

```jsonc
// add to "exports"
"./<name>": {
  "types": "./dist/<name>/index.d.ts",
  "import": "./dist/<name>/index.js"
}

// add to "peerDependencies" if you have any
"optional-peer-dep-name": "^x.y.z"

// add to "peerDependenciesMeta" if it's optional
"optional-peer-dep-name": { "optional": true }
```

`vitest.config.ts` and `vitest.config.node.ts` — add a `@nexusts/<name>`
alias so in-tree tests resolve correctly:

```ts
{ find: /^@nexusts\/<name>$/, replacement: `${root}/packages/<name>/src/index.ts` },
```

Forgetting any of these is a silent failure: the example may
import from source via path alias, but the published package
will be missing the entry point.

### Step 5 — Add a peer-dep (only if you need one)

If your module needs a runtime dep (e.g. `graphql`):

```bash
bun add -d <peer-dep>
```

Then in `package.json`:

```jsonc
"peerDependencies": { "<peer-dep>": "^x.y.z" },
"peerDependenciesMeta": { "<peer-dep>": { "optional": true } },
```

In the service, use **dynamic import** to load it lazily:

```ts
let _peer: any = null;
async function loadPeer() {
  if (_peer) return _peer;
  try {
    _peer = await import("<peer-dep>");
    return _peer;
  } catch {
    throw new Error("[nexusts/<name>] Install `<peer-dep>` with `bun add <peer-dep>`.");
  }
}
```

The error message must mention the install command. Users see this
on the first failing call, not at module load time.

### Step 6 — Tests

See §5 below for the full test structure. Minimum: one vitest file
at `tests/<name>/<name>.test.ts` with 15+ tests covering:

- Service construction (default config, custom config)
- The public method shapes
- Edge cases (empty input, invalid input, the unhappy path)
- Module integration (the decorator barrel exports what it says it does)

### Step 7 — Example + docs

Add an example at `examples/NN-<name>/main.ts` (next number after
the current max). It must boot successfully under the smoke test.

Update the table in `examples/README.md`, the module table in the
top-level `README.md`, the user guide table in
`docs/user-guide/README.md`, the analysis docs (`docs/analysis/`
sections on Tier 1/2/3 gaps), and the `CHANGELOG.md` `[Unreleased]`
section.

The order in which docs need to be touched (in order of blast
radius):

1. `packages/<name>/src/` (the code)
2. `tests/<name>/` (the tests)
3. `examples/NN-<name>/` (the example)
4. `package.json` (exports + deps — build.ts auto-scans)
5. `vitest.config.ts` + `vitest.config.node.ts` (aliases)
6. `examples/README.md` (one row in the table)
7. Top-level `README.md` (module table + Why NexusTS row)
8. `docs/user-guide/<name>.md` + `.ko.md` (user guide)
9. `docs/design/<name>.md` + `.ko.md` (design deep-dive)
10. `docs/analysis/nestjs-comparison.md` + `.ko.md`
11. `CHANGELOG.md` + `.ko.md`

**IMPORTANT: Every doc change must be written in BOTH English (`.md`)
and Korean (`.ko.md`) simultaneously.** Do not write one first and
"translate later" — the Korean docs drift from the English within a
single session. Always create or update both files in the same commit.

Format: copy the English `.md`, translate the prose, keep the code
blocks verbatim.

---

## 4. The build pipeline

`bun run build` runs `build.ts` which has three phases:

1. **`Bun.build()`** — bundles each `entrypoints:` entry into
   `dist/packages/<name>/src/index.js`. Per-module entry means each
   `<name>` ships as its own JS file.
2. **`tsc --emitDeclarationOnly`** — emits `dist/packages/<name>/src/index.d.ts`
   for type info. Run from `tsconfig.build.json` (which has the
   per-module include globs).
3. **Flatten** — moves `dist/src/*` → `dist/*` so the published
   layout matches `package.json` `exports` (which says
   `./<name>/index.js`, not `./packages/<name>/src/index.js`).

`Bun.build` and `tsc` are split because Bun's bundler does not
currently emit `.d.ts`.

**After build, verify:**

```bash
ls dist/<name>/        # index.js, index.js.map, index.d.ts, types.d.ts, etc.
grep '"<name>"' package.json   # under "exports"
```

If `dist/<name>/index.js` is missing, you forgot to add to `build.ts`.
If `dist/<name>/index.d.ts` is missing, you forgot `tsconfig.build.json`.
If `package.json` doesn't list `./<name>` in `exports`, users can't
import it.

---

## 5. Testing — three tiers, three purposes

### Tier 1 — Unit tests (`tests/<name>/<name>.test.ts`)

Vitest, no Bun. Covers the public surface in isolation. 15-30 tests
per module is typical. Run with `bun x vitest run tests/<name>/`.

```ts
import { beforeAll, describe, expect, it } from "vitest";

let <Name>Service: any, <Name>Module: any;
beforeAll(async () => {
  const mod = await import("@nexusts/<name>");
  <Name>Service = mod.<Name>Service;
  <Name>Module = mod.<Name>Module;
});

describe("<Name>Service", () => {
  it("default config", () => { /* ... */ });
  it("custom config", () => { /* ... */ });
  it("edge case", () => { /* ... */ });
});
```

The dynamic `import("@nexusts/<name>")` pattern is critical —
it gives you a fresh module per test, and it tells you immediately
if the build wiring is wrong (the import will fail with `Cannot
find module`).

### Tier 2 — Smoke tests (`tests/examples/smoke.test.ts`)

Already present. Covers all 34 examples in `examples/`. Tests that:

- A README.md exists in each example folder (≥200 chars, contains
  `How to run`).
- Each `main.ts` boots in a Bun subprocess, prints one of
  `/listening|server|started|ready|on port|on http/i` within 8s, then
  can be killed with SIGTERM.

Sequential port assignment 14000..14032. Each example's main.ts
must read `process.env.PORT ?? 3000` and use that — we deliberately
allow them to default to 3000 for manual use.

**The smoke test owns the example's tsconfig.json.** It writes a stub
`tsconfig.json` into each example folder in `beforeAll` (with
`experimentalDecorators: true`, `useDefineForClassFields: false`,
`jsx: "react-jsx"`) and deletes it in `afterAll`. Don't add your own
`tsconfig.json` to the example folder — it'll be deleted and recreated
on every test run.

**If your new example fails the smoke test:**

1. Check the test's `tail -20` of stderr/stdout. Look for the actual
   error.
2. Common cause: a decorator reading `descriptor.value` in a stage-3
   decorator context. Bun 1.3 doesn't supply it. Either:
   - **Metadata-only**: write the decorator to only set
     `Reflect.defineMetadata`, then wire application at controller-mount
     time.
   - **Inline pattern**: don't use the decorator — call the service
     from inside the route handler:

     ```ts
     @Get("/retry")
     retryRoute() {
       return this.r.retry(() => this.flaky.fetchExternal(), { attempts: 3 });
     }
     ```

3. Other common cause: missing `setViewPaths()`, missing `ResilienceService.TOKEN` registration, port already in use (cleanup with
   `bash scripts/clean-examples.sh`).

### Tier 3 — E2E tests (`tests/e2e/`) — RESERVED

Currently mostly empty. The intended pattern is full HTTP roundtrip
tests against a running server. For now, the smoke test is the
production-quality test surface.

### What does NOT belong in tests

- Tests that need a network. Use the `memory` backend, the `null`
  transport, etc. The exception is gRPC (one test file uses
  `connection refused` to verify the failure path).
- Tests that import from `dist/`. Always import from the source.
- Tests that call `app.listen(3000)`. Use a free port from
  `process.env.PORT`.

---

## 6. Standard decorator patterns (v0.9+)

NexusTS v0.9 migrated from legacy TypeScript decorators to **TC39 standard ES decorators**. New code MUST use these patterns:

### Field injection (NOT constructor injection)

```ts
// ✅ Standard decorator mode (v0.9+)
@Injectable()
class UserService {
  @Inject('DB') declare db: DrizzleLike;
}

// ❌ Legacy (v0.8 and earlier)
@Injectable()
class UserService {
  constructor(@Inject('DB') private db: DrizzleLike) {}
}
```

### `ctx.req.*` methods (NOT `@Param`/`@Body`/`@Query`)

```ts
// ✅ Standard decorator mode
@Get('/:id')
async show(ctx: Context) {
  const id = ctx.req.param('id');
  const body = await ctx.req.json();
}

// ❌ Legacy
@Get('/:id')
async show(@Param('id') id: string, @Body() body: any) {}
```

### Writing a new method decorator (metadata-only)

For metadata-only decorators (like `@Retry`, `@Cron`, `@OnEvent`),
use the dual-mode factory pattern:

```ts
import { safeDefineMeta } from '@nexusts/core/di/safe-reflect';

const KEY = Symbol.for('nexus:MyDecorator');

export function MyDecorator(config: any): any {
  return function (this: any, target: any, context?: any): void {
    // Standard decorator mode (TC39)
    if (context?.kind === 'method' && context?.metadata) {
      context.metadata[KEY] = config;
      return;
    }
    // Legacy decorator mode (experimentalDecorators)
    const propertyKey = typeof context === 'string' ? context : arguments[1];
    safeDefineMeta(KEY, config, target, propertyKey);
  };
}
```

The key points:

- **Standard mode**: `context?.kind === 'method'` detects TC39 decorators. Store metadata on `context.metadata`.
- **Legacy mode**: `target` is prototype, `propertyKey` is string/symbol from `arguments[1]`.
- **Never read `descriptor.value`** in the decorator body — it's `undefined` in standard mode.
- Use `safeDefineMeta`/`safeGetMeta` from `@nexusts/core/di/safe-reflect` for legacy fallback.

### InputValue helper for sanitization

```ts
import { inputValue } from '@nexusts/core';

const id = inputValue(ctx.req.param('id')).number().required().value();
const name = inputValue(ctx.req.query('name')).trim().max(100).value();
```

### Existing decorators already dual-mode

| Decorator | Package | Standard mode |
|-----------|---------|--------------|
| `@Module` | core | ✅ (since v0.6) |
| `@Controller` | core | ✅ (since v0.6) |
| `@Injectable` | core | ✅ (since v0.6) |
| `@Inject` | core | ✅ field decorator (v0.9) |
| `@Get/@Post/etc` | core | ✅ method decorator |
| `@Retry/@CircuitBreaker/@Bulkhead` | resilience | ✅ metadata-only |
| `@Cron/@Interval/@Timeout` | schedule | ✅ metadata-only |
| `@Cacheable/@CacheInvalidate` | cache | ✅ dual-mode (v0.9.7) |
| `@OnEvent` | events | ✅ metadata-only |
| `@Upload` | upload | ✅ (v0.9 dual-mode) |
| `@WebSocketGateway` | ws | ✅ dual-mode (v0.9.5) |
| `@OnWebSocketOpen`/`@OnWebSocketMessage`/`@OnWebSocketClose` | ws | ✅ dual-mode (v0.9.5) |

### Legacy decorator gotchas (Bun 1.3)

Legacy decorators (`experimentalDecorators: true`) still require:

```jsonc
// tsconfig.json
"experimentalDecorators": true,
"useDefineForClassFields": false
```

The per-example `tsconfig.json` in `tests/examples/smoke.test.ts`
continues to flip this back for legacy tests.

**The unsafe pattern** is reading `descriptor.value` in the decorator
body. Don't do it. Even if it works on the version of Bun you're
using today, it'll break the smoke test on the next Bun upgrade.

---

## 7. Peer-dependency pattern (the `graphql` precedent)

When a module needs a runtime dep, make it a peer-dep (not a
direct dep) and load it lazily:

```ts
// packages/<name>/packages/<name>/src.service.ts
let _peer: any = null;
let _attempted = false;

export async function loadPeer() {
  if (_peer) return _peer;
  if (_attempted) {
    throw new Error("[nexusts/<name>] `<peer-dep>` failed to load. Install with `bun add <peer-dep>`.");
  }
  _attempted = true;
  try {
    _peer = (await import("<peer-dep>")) as any;
    return _peer;
  } catch (err) {
    throw new Error("[nexusts/<name>] `<peer-dep>` is required. Install with `bun add <peer-dep>`.\nOriginal error: " + (err as Error).message);
  }
}
```

Then call `loadPeer()` from the first public method that needs it.
The first call pays the cost of dynamic import; subsequent calls hit
the cached `_peer` variable.

The error message **must include the install command**. Users hit
this on the first call, not at module load, so they get a clear
"this is fixable" message.

**Why peer-dep and not direct dep?** A direct dep is forced on
every user of the framework. `@nexusts/graphql` users need
`graphql`; everyone else doesn't. A peer-dep means "the consumer
installs what they use", which is the whole point of per-module
entry points.

---

## 8. Commit message conventions

Conventional Commits, lowercase, imperative mood:

```
feat(graphql): add @nexusts/graphql module with v0.6.9
feat(resilience): add @nexusts/resilience module (retry + circuit + bulkhead) v0.7.0
docs(analysis): update nestjs/adonisjs comparison docs to v0.6.8
docs: full README rewrite for v0.7.0 (GraphQL + Resilience)
chore: bump to v0.6.8
chore(scripts): add clean-examples.sh helper for killing leftover example processes
test: add examples/ smoke test suite + fix 4 example bugs found by it
feat(view): add Eta template engine adapter (lazy-loaded)
style: reformat clean-examples.sh indentation
```

The `(scope)` is the module or area: `graphql`, `resilience`,
`view`, `auth`, `cli`, `openapi`, `sse`, `ws`, `analysis`, `core`,
etc. Or omit for cross-cutting changes.

Don't include the issue/PR number unless you're using GitHub
auto-linking.

For `feat:` commits that add a user-visible feature, also update
`CHANGELOG.md` in the same commit — move the relevant entry from
`[Unreleased]` to a dated `[X.Y.Z]` section, and set the
corresponding `.ko.md` section.

---

## 9. Common patterns to copy

### Service that wraps a constructor with config

```ts
@Injectable()
export class FooService {
  static readonly TOKEN = Symbol.for("nexus:Foo");
  @Inject("FOO_CONFIG") declare config: FooConfig;
}
```

### Module with `forRoot(config)`

```ts
@Module({
  providers: [FooService, { provide: FooService.TOKEN, useExisting: FooService }],
  exports: [FooService, FooService.TOKEN],
})
export class FooModule {
  static forRoot(config: FooConfig) {
    @Module({
      providers: [
        { provide: FooService.TOKEN, useValue: new FooService(config) },
        { provide: "FOO_CONFIG", useValue: config },
      ],
      exports: [FooService.TOKEN, "FOO_CONFIG"],
    })
    class ConfiguredFooModule {}
    Object.defineProperty(ConfiguredFooModule, "name", { value: "ConfiguredFooModule" });
    return ConfiguredFooModule;
  }
}
```

### Lazy-load a peer-dep

See §7 above.

### Inertia-style "service locator" for eager decorators

When a decorator is applied at class-definition time but the service
it needs is only available at boot time, use a module-level
singleton that the module's `forRoot()` sets:

```ts
// packages/<name>/src/decorators/index.ts
let _service: <Name>Service | null = null;
export function set<Name>Service(svc: <Name>Service | null) {
  _service = svc;
}
export function get<Name>Service(): <Name>Service | null {
  return _service;
}
```

```ts
// packages/<name>/packages/<name>/src.module.ts
import { set<Name>Service } from "./decorators/index.js";
static forRoot(config) {
  // ... inside useFactory:
  const svc = new <Name>Service(config);
  set<Name>Service(svc);  // <-- the registration
  return svc;
}
```

The decorator at call time then reads `_service` and proceeds. This
avoids the circular-import problem (decorators ↔ service) while
keeping the decorator ergonomics.

`@Resilient` uses this pattern. See `src/resilience/decorators/`
and `src/resilience/resilience.module.ts`.

### Shared named registry (the "stripe circuit" pattern)

```ts
// packages/<name>/packages/<name>/src.service.ts
export class <Name>Service {
  private things = new Map<string, Thing>();

  getOrCreate(name: string, config?: ThingConfig): Thing {
    let t = this.things.get(name);
    if (!t) {
      t = new Thing(name, { ...this.defaults, ...config });
      this.things.set(name, t);
    }
    return t;
  }
}
```

This is the pattern behind `getOrCreateCircuit("stripe")` —
multiple call sites in the same app get the same circuit, so a
single upstream outage opens it for all of them. Use it for any
resource that has shared state across the app (caches, rate limiters,
connection pools, deduplication tables).

### Sequential port assignment for tests

The smoke runner does `14000 + i` for example index `i`. Examples
must use `process.env.PORT ?? 3000`. Don't hardcode 3000 only —
the smoke runner's port is sequential, not 3000, so each example
sees a unique port. Hardcoding 3000 in the example's `main.ts` works
because the smoke runner doesn't actually hit the HTTP endpoint, it
just waits for the boot log.

(If you want to write an e2e test that does hit the endpoint,
you'll need the `PORT` env pattern.)

---

## 10. Troubleshooting

### `Class "X" is missing the @Controller() decorator` (standard mode)

The `@Controller` class decorator isn't applying metadata. Check that:

- The decorator factory returns a function compatible with standard decorator mode (checks `context?.kind === "class"`).
- The `@Injectable()` and `@Controller()` decorators are both present (order doesn't matter — they share `context.metadata`).
- If in legacy mode, `experimentalDecorators: true` is set in tsconfig.

### `Decorators are not valid here` (LSP error)

This TypeScript LSP error appears when the project-level tsconfig uses
the default (stage-3) decorator mode but the file uses legacy decorators
(or vice versa). This is a pre-existing issue — the smoke test handles
it by writing per-example tsconfig files. Ignore the LSP error; run the
smoke test to verify.

### `import 'reflect-metadata' not found / not needed`

The framework no longer requires `import 'reflect-metadata'` anywhere.
If you see this import in source code, remove it. The framework ships
an inline Reflect Metadata polyfill in `@nexusts/core/di/safe-reflect`.
No external `reflect-metadata` package is needed.

### `TypeError: undefined is not an object (evaluating 'descriptor.value')`

You're writing a method decorator that reads `descriptor.value`
in a stage-3 decorator context. See §6. Switch to metadata-only +
framework-side wire-up.

### `Cannot find module '@nexusts/<name>'`

Check `package.json` `exports` has a `./<name>` entry. If it does,
run `bun run build` — you may have forgotten to add to `build.ts`
or `tsconfig.build.json`. Without those, the `dist/<name>/index.js`
never gets created.

### `No provider for "Symbol(nexus:Foo)"`

The `@Inject(Symbol)` token wasn't registered. The provider is
either missing from the `@Module({ providers: [...] })` array, or
the controller is in a different module that didn't import this
module. Check the module graph: the controller's module must
`imports: [FooModule]`.

### `[nexusts/<name>] <peer-dep> failed to load`

The user didn't install the peer-dep. The error message includes
the install command. (See §7 for the error message format.)

### Build passes, smoke test fails with "port 3000 in use"

`bash scripts/clean-examples.sh` — that kills leftover Bun.serve
processes from previous test runs and releases port 3000.

### Smoke test shows `expected 0 to be greater than 200`

The new example doesn't have a `README.md`, or it's less than 200
chars, or it's missing the `How to run` / `run:` / `bash` pattern.
Add a README that opens with installation and a `bun main.ts`
command.

### Korean docs drift from English

The .ko.md files are tracked separately. After any user-guide or
design-doc change, translate the English to Korean. The
`docs/analysis/` and `CHANGELOG` have a smaller translation
requirement — only update Korean if the change is significant.

---

## 11. When to push back on the user

- **"Add a new ORM"** — Drizzle is the default and the only
  first-party ORM. New ORMs are out of scope until v1.0; use the
  `optional` peer-dep path (`@nexusts/drizzle` is a peer).
- **"Change the decorator semantics"** — The framework uses TC39 standard ES decorators as the default. Legacy decorators (`experimentalDecorators`) continue to work via the dual-mode fallback. Do not remove the dual-mode paths.
- **"Add reflect-metadata back"** — The framework ships an inline
  Reflect Metadata polyfill in `@nexusts/core/di/safe-reflect`. No
  external `reflect-metadata` package is needed. Use
  `safeGetMeta`/`safeDefineMeta` instead.
- **"Use constructor injection"** — New code MUST use field injection (`@Inject(Token) declare field: Type`). Constructor injection is legacy-only.
- **"Drop the Inertia / gRPC / GraphQL / Resilience module to save
  bundle size"** — modules are opt-in by import. If a user doesn't
  import it, it isn't in their bundle. Don't break the API.
- **"Make `<x>` a required peer-dep"** — adds install friction for
  the 90% of users who don't need `<x>`. Always make heavy deps
  optional peer-deps with the dynamic-import pattern (§7).

---

## 12. Useful commands

```bash
# Build
bun run build                  # full pipeline (3 phases)
bun run typecheck              # tsc --noEmit against the whole tree

# Tests
bun run test                   # all vitest suites
bun x vitest run tests/graphql/                 # one module
bun x vitest run tests/examples/ -t "33-resilience"  # one example
bun x vitest run tests/graphql/ tests/examples/ tests/resilience/  # subset

# Smoke test lifecycle
bun run examples:smoke         # 70 vitest tests, ~2s
bun run examples:clean         # bash scripts/clean-examples.sh

# CLI
bun run nx -- info
bun run nx -- make:controller Foo
```

Pre-commit checklist:

1. `bun run typecheck` passes.
2. `bun run test` passes (or at minimum the new module's tests).
3. `bun run examples:smoke` passes (or at minimum the new example's
   tests).
4. `bun run build` succeeds; the new module appears in `dist/`.
5. No `import 'reflect-metadata'` in new source files.
6. New decorators use the dual-mode pattern (standard + legacy).
7. New services/controllers use field injection
   (`@Inject(Token) declare field: Type`), NOT constructor injection.
8. `README.md`, `CHANGELOG.md`, `examples/README.md`, the user-guide
   table, and the analysis docs are all updated.
9. Korean docs (user guide + design) are translated for user-visible
   additions.
