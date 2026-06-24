# Resilience · `@nexusts/resilience`

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
  ResilienceModule, ResilienceAdminModule, ResilienceService, retry,
  CircuitBreaker, Bulkhead, CircuitOpenError, BulkheadFullError,
} from "@nexusts/resilience";

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
import { retry } from "@nexusts/resilience";

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

## `@Resilient` decorator

A combined decorator that wraps a method with retry + circuit +
bulkhead. When `ResilienceModule.forRoot()` is imported, decorated
controller methods are **automatically wrapped** at mount time.

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

## Eager auto-wrapping

When `ResilienceModule.forRoot()` is imported, the framework
**automatically** wraps any controller method decorated with
`@Retry` / `@CircuitBreaker` / `@Bulkhead` / `@Resilient` at
controller mount time. No manual `svc.retry(...)` or
`cb.execute(...)` calls needed.

```ts
import { Retry, CircuitBreaker, Bulkhead, Resilient } from "@nexusts/resilience";

@Controller("/payments")
class PaymentController {
  @Post("/charge")
  @Resilient({
    retry:    { attempts: 3, backoff: "exponential-jitter" },
    circuit:  { threshold: 0.5, timeout: 30_000 },
    bulkhead: { maxConcurrent: 5 },
  })
  async charge(@Body() body: ChargeDto) {
    // ← auto-wrapped: bulkhead → circuit → retry
    return stripe.charge(body);
  }

  @Get("/history")
  @Retry({ attempts: 2, initialDelay: 200 })
  async history() {
    return db.query("SELECT ...");
  }

  @Get("/health")
  @CircuitBreaker({ threshold: 0.5 })
  async health() {
    return externalApi.ping();
  }
}
```

### How it works

1. `ResilienceModule.forRoot()` registers a controller-method hook
   in the core router.
2. When each controller is mounted, the hook checks each method for
   resilience metadata.
3. If metadata exists, the method is wrapped with `makeResilientWrapper`.
4. At call time, the wrapper applies bulkhead → circuit → retry in
   that order.

### Wrap order (outside → inside)

```
bulkhead → circuit → retry → original method
```

### Notes

- Without `ResilienceModule.forRoot()`, decorators are metadata-only
  (no wrapping).
- `@Retry` / `@CircuitBreaker` / `@Bulkhead` can be used independently
  or combined via `@Resilient`.
- Circuit names are derived from the method name (e.g. `charge`,
  `history`).

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

## Admin API

Inspect and manually control circuits and bulkheads at runtime.

### List all circuits

```ts
const circuits = svc.listCircuits();
// → [
//     { name: "stripe",  state: "open",   metrics: { failures: 8, totalCalls: 10, ... } },
//     { name: "github", state: "closed", metrics: { failures: 0, totalCalls: 42, ... } },
//   ]
```

Each entry includes a `CircuitMetrics` snapshot:

| Field | Type | Description |
|-------|------|-------------|
| `name` | `string` | Circuit name |
| `state` | `"closed"` \| `"open"` \| `"half-open"` | Current state |
| `totalCalls` | `number` | Calls in the rolling window |
| `failures` | `number` | Failed calls in the window |
| `successes` | `number` | Successful calls |
| `failureRatio` | `number` | `failures / totalCalls` (0..1) |
| `openedAt` | `number` | Timestamp when last opened (0 if never) |
| `msUntilHalfOpen` | `number` | ms until open → half-open transition |

### List all bulkheads

```ts
const bulkheads = svc.listBulkheads();
// → [
//     { name: "stripe", inFlight: 2, queued: 0, maxConcurrent: 5 },
//   ]
```

### Manual circuit overrides

```ts
const cb = svc.getOrCreateCircuit("stripe", { threshold: 0.5 });

// Metrics snapshot (same as above, from the circuit directly)
const m = cb.metrics();
console.log(`State: ${m.state}, failures: ${m.failures}/${m.totalCalls}`);

// Force the circuit open (e.g. during a known outage).
cb.forceOpen();

// Force the circuit closed (e.g. after you know the upstream recovered).
cb.forceClose();

// Reset to clean closed state (clears all history).
cb.reset();
```

### HTTP Admin endpoints

`ResilienceAdminModule` mounts five HTTP endpoints for runtime
inspection and control. Protect behind auth middleware in production.

```ts
import { ResilienceModule, ResilienceAdminModule } from "@nexusts/resilience";

@Module({
  imports: [
    ResilienceModule.forRoot({ threshold: 0.5 }),
    ResilienceAdminModule.forRoot({ prefix: "/resilience" }),
  ],
})
class AppModule {}
```

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `{prefix}/circuits` | List all circuits with metrics |
| `GET` | `{prefix}/bulkheads` | List all bulkheads with stats |
| `POST` | `{prefix}/circuits/:name/force-open` | Force a circuit open |
| `POST` | `{prefix}/circuits/:name/force-close` | Force a circuit closed |
| `POST` | `{prefix}/circuits/:name/reset` | Reset a circuit |

Default prefix: `"/resilience"`.

```bash
# List all circuits
curl http://localhost:3000/resilience/circuits

# Force-close the stripe circuit
curl -X POST http://localhost:3000/resilience/circuits/stripe/force-close
```

Unknown circuit names return 404.

## Cross-pod circuit breakers (v0.8)

The default `CircuitBreaker` manages state in-process only. In a
multi-pod environment, pod A may open the circuit while pod B still
attempts failing requests. A `ResilienceStore` shares circuit state
across pods.

### MemoryResilienceStore (default, single pod)

```ts
ResilienceModule.forRoot({
  retry: { attempts: 3 },
  circuit: { threshold: 0.5 },
  // store: 'memory' — default, can be omitted
})
```

### RedisResilienceStore (multi-pod, recommended)

```ts
import { createRedisClient }     from '@nexusts/redis';
import { RedisResilienceStore }  from '@nexusts/resilience';

const redisClient = await createRedisClient({ url: process.env.REDIS_URL });
const store = new RedisResilienceStore(redisClient, { keyPrefix: 'myapp:cb:' });

ResilienceModule.forRoot({
  circuit:         { threshold: 0.5, timeout: 30_000 },
  store,
  syncIntervalMs:  5_000,
})
```

### DrizzleResilienceStore (database-backed)

```ts
import { DrizzleResilienceStore } from '@nexusts/resilience';

const store = new DrizzleResilienceStore(drizzleService);
// Automatically creates nexus_circuit_state table (IF NOT EXISTS)

ResilienceModule.forRoot({ circuit: { threshold: 0.5 }, store })
```

### How it works

| Step | Behaviour |
| ---- | --------- |
| On state transition | Snapshot saved to store immediately (fire-and-forget) |
| On `execute()` | Snapshot read from store after `syncIntervalMs` elapsed |
| Conflict resolution | Last-writer-wins via `updatedAt` timestamp |
| Store errors | Fall back to local state — never propagate exceptions |

Set `syncIntervalMs = 0` to poll on every `execute()` (for testing).

### Custom backend

Implement `ResilienceStore` to integrate any external store:

```ts
import type { ResilienceStore, CircuitSnapshot } from '@nexusts/resilience';

class EtcdResilienceStore implements ResilienceStore {
  async getSnapshot(name: string): Promise<CircuitSnapshot | null> { ... }
  async saveSnapshot(name: string, snap: CircuitSnapshot): Promise<void> { ... }
}
```

## What's not in this release

- **Bulkhead queue tracing.** When the queue is long, you currently
  only see `BulkheadFullError`. A future version will emit
  `bulkhead.queue.waiting` Prometheus-style metrics.
- **Per-route HTTP integration.** A `@WithResilience({ retry, circuit })`
  Hono middleware variant is on the roadmap.

## See also

- [`../design/resilience.md`](../design/resilience.md) —
  architecture deep-dive.
- [`../../user-guide/testing-examples.md`](./testing-examples.md) —
  smoke-test runner; resilience is exercised by example 33.
- [AWS Architecture Blog — "Timeouts, retries, and backoff with jitter"](https://aws.amazon.com/builders-library/timeouts-retries-and-backoff-with-jitter/).
