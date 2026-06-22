# Resilience · `@kabyeon/nexusjs/resilience`

> 한국어 버전: [`resilience.ko.md`](./resilience.ko.md)

Three classic distributed-systems primitives — retry with backoff,
circuit breaker, and bulkhead (concurrency limiter) — under a
single, decorator-friendly API.

## TL;DR

```bash
# (no peer-deps — pure TypeScript)
```

```ts
import {
  ResilienceModule, ResilienceService, retry,
  CircuitBreaker, Bulkhead, CircuitOpenError, BulkheadFullError,
} from "@kabyeon/nexusjs/resilience";

@Module({
  imports: [ResilienceModule.forRoot()],
  controllers: [AppController],
})
class AppModule {}

class AppController {
  constructor(@Inject(ResilienceService.TOKEN) private r: ResilienceService) {}

  // Inline retry — no decorator needed.
  @Get("/user/:id")
  async getUser(c: any) {
    return this.r.retry(
      () => userApi.fetch(c.req.param("id")),
      { attempts: 3, backoff: "exponential-jitter" },
    );
  }
}
```

The `ResilienceService` (DI singleton) is the registry. Circuits
and bulkheads are created on demand via `getOrCreate(name, config)`
and shared across the entire app — the same circuit for "stripe"
covers every code path that calls Stripe.

## Architecture

```
┌────────────────────────────────────────────────────────────┐
│  ResilienceModule.forRoot({ retry, circuit, bulkhead })    │
│                                                             │
│  ┌─────────────────┐    default config (per call overrides) │
│  │ ResilienceSvc  │◀───── retry / circuit / bulkhead config  │
│  │  .getOrCreate  │                                         │
│  │  Circuit(name)  │   rolling window, threshold, half-open  │
│  │  Bulkhead(name) │   maxConcurrent, maxQueued, FIFO       │
│  │  retry(fn,cfg) │   constant/linear/exp/exp-jitter backoff│
│  └─────────────────┘                                         │
│                                                             │
│  Three composition patterns:                                 │
│   1. inline — r.retry(() => ...), cb.execute(() => ...)   │
│   2. method decorator — @Retry / @CircuitBreaker /         │
│      @Bulkhead / @Resilient                                 │
│   3. shared named registry — every code path uses the        │
│      same `r.getOrCreateCircuit("stripe")`                  │
└────────────────────────────────────────────────────────────┘
```

## When to use which

| Primitive | Use when... | Don't use when... |
|-----------|------------|-------------------|
| **Retry** | The dependency is **expected to flake briefly** (network blips, rate limits). | The failure is durable (downstream is down). |
| **Circuit Breaker** | The dependency is **expected to fail for longer periods** (outage, deploy). | A single call, with no follow-ups. |
| **Bulkhead** | The dependency is **slow and capacity-limited** (external API, DB pool). | The dependency is local and fast. |

These compose. The classic "outermost → innermost" pattern is:

```
Bulkhead (cap concurrent)
  └─> Circuit Breaker (fail-fast during outages)
        └─> Retry (handle transient blips)
```

`@Resilient({ retry, circuit, bulkhead })` applies all three in that
order.

## Retry

```ts
import { retry } from "@kabyeon/nexusjs/resilience";

const user = await retry(
  () => fetch("https://api.example.com/users/42").then(r => r.json()),
  {
    attempts: 3,                  // total tries (including first)
    initialDelay: 100,            // first backoff
    maxDelay: 30_000,             // cap
    backoff: "exponential-jitter", // strategy
    retryOn: (err) => isTransient(err), // filter
    onRetry: (err, attempt, delay) => log.warn({ err, attempt, delay }),
    timeout: 60_000,              // overall budget
  },
);
```

The function passed to `retry` receives an `AbortSignal`. Honor it
in your I/O calls so the overall `timeout` actually fires:

```ts
await retry((signal) => {
  return fetch(url, { signal }).then(r => r.json());
}, { attempts: 5, initialDelay: 200, timeout: 30_000 });
```

### Backoff strategies

| Strategy | Formula | Use when... |
|----------|---------|-------------|
| `constant` | `initialDelay` | throttling, not a real retry |
| `linear` | `initialDelay * attempt` | short-lived flakiness |
| `exponential` | `initialDelay * multiplier^(attempt-1)` | classic exponential |
| `exponential-jitter` | `Math.random() * exponential` | prevent thundering herd |

Default: `exponential-jitter` with `multiplier = 2` and `maxDelay = 30_000`.

## Circuit Breaker

```ts
const cb = svc.getOrCreateCircuit("stripe", {
  threshold: 0.5,        // open at >= 50% failure rate
  minCalls: 5,           // need at least 5 calls before threshold matters
  timeout: 30_000,       // wait 30s before half-open trial
  halfOpenAfter: 1,      // 1 trial call in half-open
  window: 60_000,        // rolling window for failure ratio
  isFailure: (err) => err.status >= 500, // don't count 4xx
  onStateChange: (from, to, name) => metrics.gauge(`circuit.${name}.state`, to),
});

try {
  const charge = await cb.execute(() => stripe.charge(amount));
} catch (e) {
  if (e instanceof CircuitOpenError) {
    // Stripe is currently considered down. Don't retry — back off.
    return { ok: false, reason: "service_degraded" };
  }
  throw e;
}
```

The state machine:

```
  closed  ── failure rate ≥ threshold (over minCalls) ─▶  open
     ▲                                                       │
     │                                                       │ after `timeout` ms
     │                                                       ▼
  closed ◀── success ── half-open ── failure ──▶  open
     │          (with one or more halfOpenAfter trials)
     └──────── success ──▶  closed
```

`open` rejects immediately with `CircuitOpenError`. The next call
after `timeout` ms triggers a half-open trial; if it succeeds, the
circuit closes.

## Bulkhead

```ts
const stripeBulkhead = svc.getOrCreateBulkhead("stripe", {
  maxConcurrent: 5,     // max 5 in-flight calls
  maxQueued: 100,       // up to 100 waiters
  rejectOnFull: false,  // wait in queue (default)
});

try {
  return await stripeBulkhead.execute(() => stripe.charge(amount));
} catch (e) {
  if (e instanceof BulkheadFullError) {
    return { ok: false, reason: "overloaded" };
  }
  throw e;
}
```

The bulkhead is fair — callers are released in FIFO order. With
`rejectOnFull: true`, calls fail fast with `BulkheadFullError`
when the queue is full.

## `@Resilient` decorator (alpha)

A combined decorator that wraps a method with retry + circuit +
bulkhead. Available as metadata today; eager wrapping at the
decorator level is reserved for v0.8 alongside other Bun
stage-3-decorator improvements.

```ts
@Resilient({
  retry: { attempts: 3, backoff: "exponential-jitter" },
  circuit: { threshold: 0.5, timeout: 30_000 },
  bulkhead: { maxConcurrent: 5 },
})
async callExternal() { ... }
```

The semantics: retry wraps the inner; circuit wraps retry; bulkhead
wraps circuit. The order matters — bulkhead-on-outside means
`rejectOnFull` fires before the circuit can.

## Service registry

`ResilienceService` is a DI singleton. The standard access pattern
is to inject the `TOKEN` and call `getOrCreateCircuit` /
`getOrCreateBulkhead`. Multiple controllers calling
`getOrCreateCircuit("stripe")` get the *same* circuit, so a flake
in one path protects all other paths.

```ts
class OrderService {
  constructor(@Inject(ResilienceService.TOKEN) private r: ResilienceService) {}
  async charge(order: Order) {
    const cb = this.r.getOrCreateCircuit("stripe", { threshold: 0.5 });
    return cb.execute(() => stripe.charge(order));
  }
}

class SubscriptionService {
  // Same circuit, same state — one Stripe outage opens the circuit
  // for both OrderService and SubscriptionService.
  constructor(@Inject(ResilienceService.TOKEN) private r: ResilienceService) {}
  async renew(sub: Subscription) {
    const cb = this.r.getOrCreateCircuit("stripe");
    return cb.execute(() => stripe.updateSubscription(sub));
  }
}
```

## What's not in this release

- **Bulkhead queue tracing.** When the queue is long, you currently
  only see `BulkheadFullError`. A future version will emit
  `bulkhead.queue.waiting` Prometheus-style metrics.
- **Half-open chaos testing.** A `forceOpen(name)` / `forceClose(name)`
  admin API is planned for v0.8.
- **Per-route HTTP integration.** A `@WithResilience({ retry, circuit })`
  Hono middleware variant is on the roadmap.

## See also

- [`../design/resilience.md`](../design/resilience.md) —
  architecture deep-dive.
- [`../../user-guide/testing-examples.md`](./testing-examples.md) —
  smoke-test runner; resilience is exercised by example 33.
- [AWS Architecture Blog — "Timeouts, retries, and backoff with jitter"](https://aws.amazon.com/builders-library/timeouts-retries-and-backoff-with-jitter/).
