# Resilience module — design

> 한국어 버전: [`resilience.ko.md`](./resilience.ko.md)

This document explains the architecture of `@kabyeon/nexusjs/resilience`:
why three primitives in one module, how the circuit-breaker
state machine works, why decorators are metadata-only, and what
the framework integration looks like.

## Goals

1. **One module, three primitives.** Retry, circuit breaker, and
   bulkhead are conceptually one feature ("resilience"). They share
   the same DI singleton, the same config defaults, the same
   per-method composition pattern. Users shouldn't have to import
   three packages.
2. **No new runtime dependencies.** Resilience is pure
   TypeScript. No `cockatiel`, no `opossum`, no `cockatoo`. The
   primitives are small (~150 LOC each) and easy to maintain.
3. **Composable via decorators and inline.** `@Retry` and friends
   are convenient; `svc.retry(() => ...)` and
   `svc.getOrCreateCircuit("stripe")` are explicit. Both should
   work and share state.
4. **Shared state across the app.** A circuit for "stripe" must be
   the same circuit everywhere — otherwise one flaky code path
   wouldn't protect the others. The DI singleton with a name-based
   registry makes this automatic.

## Why three primitives in one module

Each primitive solves a different problem:

- **Retry** handles **transient** failures (network blip, rate
  limit, leader election).
- **Circuit Breaker** handles **durable** failures (outage, deploy,
  overload). Don't retry during the storm — back off and let the
  upstream recover.
- **Bulkhead** handles **capacity contention** (slow upstream,
  shared connection pool). Cap the number of in-flight calls so
  one slow dependency doesn't starve the rest of the app.

A typical "external call" stack is

```
Bulkhead (≤ 10 concurrent)
  └─> Circuit Breaker (fail-fast during outage)
        └─> Retry (handle transient blips)
```

Putting all three in one module means:

- One DI singleton (`ResilienceService`) with one `defaults` table.
- One decorator that combines all three (`@Resilient`).
- One entry in the user guide, one section in the design doc.

## Retry implementation

`retry()` is the simplest of the three. The algorithm:

```ts
for (let attempt = 1; attempt <= cfg.attempts; attempt++) {
  try {
    return await fn(ac.signal);
  } catch (err) {
    lastErr = err;
    if (attempt >= attempts) break;
    if (!retryOn(err, attempt)) break;
    const delay = computeBackoff(attempt, cfg);
    onRetry?.(err, attempt, delay);
    await sleep(delay, ac.signal);
  }
}
throw lastErr;
```

Three design choices:

1. **Function signature takes an `AbortSignal`.** The user passes
   the signal into their I/O calls (e.g. `fetch(url, { signal })`).
   This is the only way an `overallTimeout` can actually fire —
   you can't cancel a third-party promise that ignores the signal.

2. **Backoff is `exponential-jitter` by default.** Plain exponential
   causes thundering herd: if 1000 clients all hit the same
   dependency, all 1000 retry at the same time. Jitter (random in
   `[0, base)`) spreads the retries.

3. **`retryOn` is a function, not just an error-class list.** The
   user might want to retry on 5xx but not on 4xx, or retry only
   if the request body is idempotent. A function is more flexible
   than a constructor list.

### Backoff strategies

```ts
function computeBackoff(attempt, cfg) {
  switch (cfg.backoff) {
    case "constant":         return cfg.initialDelay;
    case "linear":           return cfg.initialDelay * attempt;
    case "exponential":      return cfg.initialDelay * Math.pow(cfg.multiplier, attempt - 1);
    case "exponential-jitter": return Math.random() * cfg.initialDelay * Math.pow(cfg.multiplier, attempt - 1);
  }
  return Math.min(raw, cfg.maxDelay);
}
```

The `Math.random()` for jitter is fine for in-process
backoff — it doesn't need to be cryptographically random. If
you need true distribution, use `crypto.getRandomValues()`.

## Circuit Breaker state machine

```
  closed  ── failure rate ≥ threshold (over minCalls) ─▶  open
     ▲                                                       │
     │                                                       │ after `timeout` ms
     │                                                       ▼
  closed ◀── success ── half-open ── failure ──▶  open
     │          (with one or more halfOpenAfter trials)
     └──────── success ──▶  closed
```

### Why "rolling window" instead of "last N calls"?

Two common designs:

- **Counter** (`failures ≥ N`): simple, but doesn't account for
  varying load. 1 failure in 10 calls triggers a counter-style
  breaker; 1 failure in 10000 calls does the same. Too coarse.
- **Last N calls** (e.g. last 10): adapts to load, but the window
  is hard to reason about. A 50% failure rate over the last 10
  calls is very different from a 50% failure rate over the last
  1000.

The framework uses a **rolling time window** (`window` ms). Calls
older than `window` ms are dropped from the count. This adapts to
load (longer windows = more calls considered) without the
discontinuity of "last N".

### Why three states, not two?

Two states (open / closed) work for very simple cases. Three
states add a probe: when a circuit has been open for a while, the
breaker lets one call through to see if the dependency recovered.
This is critical for production — without half-open, you have to
wait for an external signal to close the circuit.

The `halfOpenAfter` parameter is the "let one call through" knob.
Setting it to 1 is the most conservative; setting it to 5 is more
aggressive (parallel probe).

### Why are `onStateChange` and `onCall` settable on the instance, not in the config?

Because we want the user to be able to wire them at registration
time, after the circuit has been created. The `getOrCreateCircuit`
factory hands back a live `CircuitBreaker` instance, and the
caller can attach hooks to it.

```ts
const cb = svc.getOrCreateCircuit("stripe");
cb._onStateChange = (from, to) => metrics.gauge("stripe.circuit", to);
cb._onCall = (name, ok, latency) => histogram.record(latency, { ok });
```

This is private-API territory (the underscore prefix). We could
expose it as a public hook setter, but for v0.7 the underscore
suffices — most users want metrics via the `onStateChange`
constructor option, which we expose as a config field.

## Bulkhead design

Bulkhead is a concurrency limiter with a FIFO queue. Implementation
in `bulkhead.ts`:

- `inFlight: number` — current in-flight count.
- `queue: SlotToken[]` — FIFO of waiters. Each token has
  `acquire()` and `cancel()`.
- `drain()` — called whenever a slot opens. Shifts the next
  waiter, marks it `acquired = true`, resolves its `acquire()`
  promise. The async wrapper inside `enqueue()` then calls the
  user's function, holding the slot until it returns.

```ts
async execute(fn) {
  if (this.inFlight < this.config.maxConcurrent) {
    this.inFlight += 1;
    try { return await fn(); }
    finally { this.inFlight -= 1; this.drain(); }
  }
  if (this.queue.length >= this.config.maxQueued) {
    throw new BulkheadFullError(this.name);
  }
  // …enqueue, wait for slot, run, release…
}
```

The key trick: when a slot opens, we don't `await` the caller's
function inside `drain()` — we resolve a token, and the caller's
async wrapper awaits the token, then runs the function, then
calls `drain()` again. This keeps the `drain()` itself synchronous
and prevents deadlocks.

### Why FIFO and not LIFO?

FIFO is fairest. LIFO (newest first) would starve older
callers if the queue is long. LIFO is sometimes used for
short-lived connections (so the connection pool drains quickly),
but for a generic bulkhead FIFO is the right default.

## Decorator API: metadata-only

The `@Retry` / `@CircuitBreaker` / `@Bulkhead` / `@Resilient`
decorators are **metadata-only**. They write options to
`reflect-metadata` and nothing else:

```ts
function makeMethodDecorator<TConfig>(key, extract) {
  return (config: TConfig): MethodDecorator => {
    return (_target, propertyKey) => {
      Reflect.defineMetadata(key, extract(config), _target, propertyKey);
    };
  };
}
```

We don't touch `descriptor.value` because Bun 1.3's default
stage-3 decorator mode doesn't pass it (the decorator is called
with `(target, key)` only). Touching it would either crash (if
Bun's transpiler optimises the method away) or wrap incorrectly.

The `applyResilience()` function reads the metadata and wraps the
method. Users who want it can call it from their own framework
hook:

```ts
import { applyResilience } from "@kabyeon/nexusjs/resilience";

class MyController {
  @Retry({ attempts: 3 })
  // …

  // Or wrap manually:
  constructor() {
    this.myMethod = applyResilience(
      MyController.prototype, "myMethod",
      this.myMethod.bind(this),
      svc,
    ).value as Function;
  }
}
```

In a future version we'll add a framework-side hook that calls
`applyResilience` automatically on every controller. For now, the
inline pattern (`svc.retry(() => ...)`) is recommended — it makes
the resilience layer visible in the route handler.

### The `setResilienceService` global

The decorators need access to the `ResilienceService` instance at
call time, but the decorator is applied before the DI container
is built. We solve this with a module-level singleton:

```ts
let _resilienceService: ResilienceService | null = null;
export function setResilienceService(svc) { _resilienceService = svc; }
```

`ResilienceModule.forRoot()` calls `setResilienceService(svc)` from
its factory. The eager decorator path (in `decorators/index.ts`)
then reads `_resilienceService` at call time.

This is a "service locator" pattern, which is normally an
anti-pattern in DI. We use it because the alternative (passing
the service into every decorator) is impractical. The pattern is
clearly marked in the docs.

## Service registry

`ResilienceService` is a registry of named circuits and
bulkheads:

```ts
private circuits = new Map<string, CircuitBreaker>();
private bulkheads = new Map<string, Bulkhead>();

getOrCreateCircuit(name, config) {
  let cb = this.circuits.get(name);
  if (!cb) {
    cb = new CircuitBreaker(name, { ...this.defaults.circuit, ...config });
    this.circuits.set(name, cb);
  }
  return cb;
}
```

The map lookup is O(1) and the `getOrCreate` pattern is
thread-safe in JavaScript's single-threaded event loop. No locks
needed.

The map is **not** persisted across requests — every server
restart starts with an empty registry. For multi-pod deployments
the breakers are not shared, but the per-pod threshold still
protects against individual pod-level storms. (Cross-pod circuit
breakers are a v0.8+ roadmap item — they need a shared store.)

## What we did NOT include

- **Token-bucket rate limiting.** That's `@kabyeon/nexusjs/limiter`.
  We considered folding it into resilience, but rate limiting has
  a different shape (request budget, not failure detection) and a
  different storage backend (Redis, Drizzle).
- **Health checks.** That's `@kabyeon/nexusjs/health`.
- **Adaptive retry.** Some libraries (Cockatiel) support
  "backoff proportional to upstream latency". We don't, because
  it's complex and the simple `exponential-jitter` is good enough
  for 95% of use cases.

## Future work

- **Cross-pod circuit breakers.** Share state via a backing store
  (Redis, Drizzle). The `CircuitBreaker` API stays the same.
- **Adaptive thresholds.** Tune `threshold` based on the upstream's
  observed success rate, not a static config value.
- **Bulkhead queue tracing.** Emit `bulkhead.queue.waiting`,
  `bulkhead.queue.max_wait_ms` Prometheus-style metrics.
- **Per-route HTTP middleware.** `@WithResilience({ retry, circuit })`
  on a Hono route, distinct from the method-level decorator.

## See also

- [`../user-guide/resilience.md`](../user-guide/resilience.md) —
  user guide.
- [`../analysis/nestjs-comparison.md`](../analysis/nestjs-comparison.md)
  — resilience gap (now closed).
- [AWS Architecture Blog — "Timeouts, retries, and backoff with jitter"](https://aws.amazon.com/builders-library/timeouts-retries-and-backoff-with-jitter/).
