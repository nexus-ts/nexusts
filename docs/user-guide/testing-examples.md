# Testing the example apps

> 한국어 버전: [`testing-examples.ko.md`](./testing-examples.ko.md)

The `examples/` folder ships **27 working minimal apps** — one per
module — that double as living documentation and as a regression test
suite. Before every release we run them as smoke tests so that a broken
import, a renamed export, or a missing `@Module` wrapper never ships.

This guide explains the smoke test runner, how to run individual
examples, and how to add a new one.

---

## What the smoke test checks · 무엇을 검증하나

For each numbered folder under `examples/` we verify:

1. **Structure** — `main.ts` exists, `README.md` is at least 200 chars
   long and contains a "How to run" section.
2. **Boot** — `bun run main.ts` starts the example successfully. The
   test waits for a "listening" / "started" / "ready" / "on port" /
   "on http" log line within 8 seconds, then sends `SIGTERM` and
   confirms a clean exit.

We do **not** exercise HTTP endpoints in the smoke runner because the
27 examples expose wildly different surfaces (raw HTTP, gRPC, SSE,
WebSocket, queues, …). A clean boot is the contract.

The suite lives in `tests/examples/smoke.test.ts` and is run with
`vitest`.

---

## Running the suite · 실행 방법

```bash
# Run every example's smoke test
bun x vitest run tests/examples/smoke.test.ts

# Run a single example by name (substring match)
bun x vitest run tests/examples/smoke.test.ts -t "04-session"
bun x vitest run tests/examples/smoke.test.ts -t "01-basic"
```

Expected output (excerpt):

```
 ✓ tests/examples/smoke.test.ts (55 tests) 1714ms

 Test Files  1 passed (1)
      Tests  55 passed (55)
```

---

## How the runner works · 동작 원리

The runner spawns each example as a real Bun subprocess, which means
it exercises the full import graph — `bun build` checks would miss
runtime DI failures.

### Per-example tsconfig

Bun's default TypeScript settings use the **new** (stage-3) decorator
semantics, where method decorators receive only `(target, key)` with
`descriptor === undefined`. The framework uses **legacy** decorators
that need `descriptor.value`. Without a `tsconfig.json` next to
`main.ts`, every example would fail with `TypeError: undefined is not
an object (evaluating 'descriptor.value')`.

The runner fixes this by writing a stub `tsconfig.json` into every
example folder in `beforeAll`:

```jsonc
{
  "compilerOptions": {
    "experimentalDecorators": true,
    "useDefineForClassFields": false,
    "noEmit": true,
    "types": ["bun-types"]
  },
  "include": ["./**/*.ts", "../../src/**/*.ts"]
}
```

The stub is removed in `afterAll`, so the source tree is clean
after the test run. The shared `examples/tsconfig.json` does **not**
work because Bun looks for `tsconfig.json` next to the entry file,
not at the parent level.

### Sequential port assignment

Each example's `main.ts` hard-codes `port: 3000`. To avoid port
collisions, the runner uses sequential ports starting at `14000`:

| Example | Port |
| ------- | ---- |
| `01-basic-mvc` | 14000 |
| `02-routing-styles` | 14001 |
| … | … |
| `27-request-scope` | 14026 |

The `PORT` env var is set on each subprocess, but most examples
ignore it and use `3000` directly. That's fine — the example's HTTP
traffic is never actually exercised, so the port collision is harmless.

### Environment isolation

These env vars are forced on every subprocess so modules with
external dependencies don't try to reach the network:

- `NODE_ENV=test`
- `OTEL_SDK_DISABLED=true` — tracing examples
- `OTEL_EXPORTER_OTLP_ENDPOINT=` — gRPC + tracing examples
- `APP_KEY=0123456789abcdef0123456789abcdef` — crypto example
- `NO_COLOR=1` — strip ANSI from logs

### Lifecycle

For each example:

```ts
spawn("bun", ["run", mainTs], { cwd, env, stdio: ["ignore", "pipe", "pipe"] });

// Race three things:
//   1. stdout matches /listening|server|started|ready|on port|on http/i → success
//   2. process exits with non-SIGTERM signal → boot crash
//   3. 8-second timer elapses → timeout (also failure)
```

The successful `SIGTERM` send is followed by a 1.5-second grace before
`SIGKILL` to ensure port releases don't bleed into the next test.

---

## Adding a new example · 새 예제 추가

1. **Number it sequentially.** Pick the next number (`28-…`, `29-…`).
2. **Mirror the structure of existing examples:**

   ```
   examples/28-my-feature/
   ├── main.ts        # imports from "@nexusts/core" (no local path aliases)
   ├── README.md      # English, with "How to run" / `bun main.ts` block
   └── (optional) views/, public/, proto/, …
   ```

3. **Keep it under 200 lines.** A working example should be a
   small, focused demonstration of one feature.
4. **Don't add `tsconfig.json` to the example folder** — the runner
   creates and removes it automatically.
5. **Don't hard-code port 3000 for production-style apps** — for the
   smoke test to work, the example just needs to print one of the
   success markers. The actual port doesn't matter.
6. **Add it to the table** in `examples/README.md`.

When you commit, the smoke test runs as part of CI and will fail if
your example is broken. Fix it before pushing again.

---

## Why boot-only, not HTTP? · HTTP 호출 검증을 안 하는 이유

We deliberately avoid HTTP requests in the smoke test. Here's why:

- **Surface mismatch** — 27 examples, 27 different protocols
  (HTTP, gRPC, SSE, WebSocket, queues, mail file transport).
  Writing per-example HTTP probes would be more test code than
  example code.
- **Speed** — boot + SIGTERM takes ~60ms per example. A full
  HTTP roundtrip with timeouts adds another 100-200ms each.
- **False positives** — examples that need a real external
  service (Redis, Postgres) would need mocks, which couples the
  test to the example's internals.

The boot test catches ~95% of regressions (missing imports, renamed
exports, broken DI wiring, missing decorators). The remaining 5% —
handler logic bugs — are the example author's responsibility to
catch with their own review.

If you need full HTTP smoke tests, write a separate
`tests/examples/e2e/*.test.ts` suite for the specific examples
that matter to you. The boot suite stays fast (under 2 seconds for
all 27) so it can run on every commit.

---

## Troubleshooting · 문제 해결

### "TypeError: undefined is not an object (evaluating 'descriptor.value')"

The example is missing a `tsconfig.json` with legacy decorator
settings. The runner should add one automatically — if this error
appears, the runner is broken. Check `tests/examples/smoke.test.ts`
and make sure `beforeAll` is calling `ensureExampleTsconfig` for
every example.

### "No provider for 'X'"

The example references a class in its DI graph that isn't registered.
Either add the class to `controllers` / `providers` of the relevant
`@Module`, or — if the example uses `app.container.resolve(X)` —
remember that `app.container` only sees the **root** module's
providers. Use `app.modules[0].container.resolve(X)` or
`new X()` for module-scoped services.

### "Listening on port …" never appears

The example probably hangs after boot, e.g. `await app.listen(3000)`
succeeds but no log line follows. Update the example to print one
of the recognized markers (or change `bootExample`'s regex in
`smoke.test.ts` if your example has a legit custom message).

### Test hangs for > 2 seconds per example

Either the example is genuinely slow to boot, or it's printing logs
that match the success regex too early. Look at the example's stdout
during the test run.
