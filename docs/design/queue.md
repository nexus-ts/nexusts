# Queue Module Design

> 한국어 버전: [`queue.ko.md`](./queue.ko.md)

## 1. Goal

Provide a single, uniform job API that works on:

- **Bun / Node** with Redis (BullMQ)
- **Cloudflare Workers** with the platform-native Queues
- **Tests / dev** with an in-memory backend

All three speak the same `QueueBackend` interface so user code
(port, test, deploy) never has to know which is configured.

## 2. Why wrap, not re-implement?

A queue system has more moving parts than a casual implementation
suggests:

| Concern | Why we wrap |
| ------- | ----------- |
| Job persistence | Redis (BullMQ) or platform disk (Cloudflare) |
| Retries + backoff | non-trivial to get right (exponential, jitter) |
| Delayed jobs | needs a scheduler (BullMQ has one; Cloudflare uses `delaySeconds`) |
| Concurrency / rate limiting | both libs handle it; manual impl is error-prone |
| Idempotency | BullMQ's `jobId` option is well-tested |
| Visibility / metrics | both libs ship dashboards; our job is to expose events |
| Cross-runtime support | one code path; three runtimes |

Wrapping is the same logic we applied to `better-auth` for
authentication: pay a small abstraction cost, save thousands of
lines of security-sensitive / operationally-fragile code.

## 3. Architecture

```
┌──────────────────────────────────────────────────────────────┐
│                      User code                                │
│   QueueService.add('send-email', data)                        │
│   queue.process('send-email', handler)                        │
└──────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌──────────────────────────────────────────────────────────────┐
│              @nexusts/queue  (separate entry point)             │
│                                                              │
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────┐ │
│  │  QueueService    │  │ @OnQueueReady    │  │ invokeReady- │ │
│  │  (DI facade)     │  │ decorator        │  │ Hooks()      │ │
│  └──────────────────┘  └──────────────────┘  └──────────────┘ │
│                              │                               │
│                              ▼                               │
│                    ┌──────────────────────┐                   │
│                    │   QueueBackend       │                   │
│                    │   (interface)        │                   │
│                    └──────────────────────┘                   │
│                              │                               │
│        ┌─────────────────────┼─────────────────────┐         │
│        ▼                     ▼                     ▼         │
│  ┌──────────┐          ┌──────────┐          ┌──────────┐    │
│  │  Memory  │          │  BullMQ  │          │Cloudflare│    │
│  │  (tests) │          │  (Redis) │          │  (edge)  │    │
│  └──────────┘          └──────────┘          └──────────┘    │
└──────────────────────────────────────────────────────────────┘
                              │
                              ▼
        Redis / Workers runtime / in-process scheduler
```

The facade (`QueueService`) is the only thing user code talks to.
Backends are swappable; the user can change `backend: 'bullmq'` to
`'cloudflare'` by editing `nx.config.ts` and nothing else changes.

## 4. Module separation

`@nexusts/queue` is a separate entry point:

```json
"exports": {
  ".":      { ... },   // core
  "./cli":  { ... },
  "./auth": { ... },
  "./queue":{ ... }    // new
}
```

Build script bundles `src/queue/index.ts` as its own artifact under
`dist/queue/`. The runtime needs different peer deps per backend
(bullmq + ioredis for the BullMQ backend, nothing extra for
Cloudflare / in-memory), so we keep the heavy deps `optional` and
let the user install only what they use.

## 5. Backend interface

The `QueueBackend` interface (in `src/queue/types.ts`) is the
contract every backend must implement:

```ts
interface QueueBackend {
  readonly name: 'bullmq' | 'cloudflare' | 'memory';
  add(name, data, options?): Promise<AddedJob>;
  addBatch(jobs): Promise<AddedJob[]>;
  process<T>(name, handler, options?): Promise<WorkerHandle>;
  drain(): Promise<void>;
  stop(): Promise<void>;
  on(listener): () => void;
}
```

It deliberately omits backend-specific features (BullMQ's `priority`
is exposed via `AddOptions` only as a number; Cloudflare's
`MessageBatch.ackAll()` is consumed internally). Advanced users who
need a backend's full surface can `@Inject(QueueService)` and access
`svc.backend` directly (cast to the specific backend type).

## 6. Job lifecycle

```
add(name, data)
  │
  ▼
[ queue ] ─────────►  process(name, handler)
                       │
                       ▼
              ┌──────────────────┐
              │ handler(data,ctx)│
              └──────────────────┘
                       │
                       ▼
        ┌──────────────┴──────────────┐
        │                             │
   { status: 'completed' }      { status: 'failed' }
        │                             │
        ▼                             ▼
    removed                  retry (up to `attempts`)
                                      │
                                      ▼
                              { status: 'failed', willRetry: false }
                                      │
                                      ▼
                                 dead-lettered
```

Three return shapes:

| Shape | Meaning |
| ----- | ------- |
| `void` / any value | Treated as `completed` with the value as `returnvalue` |
| `{ status: 'completed', returnvalue? }` | Success |
| `{ status: 'failed', error, willRetry }` | Failure; `willRetry` overrides the default retry policy |
| `{ status: 'retry', reason?, delaySeconds? }` | Explicit retry (BullMQ: `moveToDelayed`; Cloudflare: `message.retry`) |

Thrown errors are caught and treated as `failed` with the default
retry policy (from `AddOptions.attempts`).

## 7. The two production backends

### BullMQ (Redis)

| Concern | How it works |
| ------- | ------------ |
| Persistence | Redis lists + hashes (`bull:<queue>:<name>:*`) |
| Delayed jobs | Sorted set with timestamp score |
| Retries | `attempts` + `backoff` (fixed/exponential) |
| Rate limit | `limiter: { max, duration }` per queue |
| Concurrency | `concurrency` per worker (default: 1) |
| Idempotency | `jobId` option — same ID = no-op |

We use the high-level `Queue.add(name, data, opts)` API rather than
`FlowProducer` so user code stays simple. Power users can access
`svc.backend` (cast to `BullMQBackend`) to use the lower-level APIs.

### Cloudflare Queues (Workers)

| Concern | How it works |
| ------- | ------------ |
| Persistence | Cloudflare's platform (no Redis needed) |
| Producer | `queue.send(body, { delaySeconds })` |
| Consumer | Worker's `queue(batch, env, ctx)` export |
| Delayed jobs | `delaySeconds` on send (max 24h) |
| Concurrency | `max_batch_size` in `wrangler.toml` |
| Idempotency | Not built-in; dedupe on the worker side |

The producer / consumer split is the tricky part: our `add()` and
`process()` API doesn't map 1:1 to Cloudflare's `send` and
`MessageBatch`. We solve it by:

- Wrapping each job in `{ name, data, jobId, options }` on send.
- Exposing `CloudflareQueueBackend.consumerHandler()` that
  dispatches each `Message` to the registered handler for its `name`.
- The Worker's `queue()` export calls `consumerHandler(batch)`.

```ts
// src/worker.ts
const app = new Application(AppModule);
const queue = app.container.resolve(QueueService);
const backend = queue.getCloudflareBackend();
if (backend) backend.bind(env);   // bind Queue from env

export default {
  fetch: app.fetch,
  async queue(batch, env, ctx) {
    const cf = app.container.resolve(QueueService).getCloudflareBackend();
    if (cf) cf.bind(env);
    return cf?.consumerHandler()(batch);
  },
};
```

This indirection is necessary because Workers tear down the isolate
between requests — there's no long-running `process()` call. Each
incoming batch is a fresh invocation.

## 8. In-memory backend

For `vitest` and `bunx nx dev` before Redis is set up:

- Ticks every 100 ms.
- Honors `delaySeconds`, `attempts`, `backoff` (exponential).
- Single-process; not for production.
- `process()` returns immediately (no Worker instance); jobs are
  picked up by the next tick.
- `drain()` waits for in-flight jobs.

The memory backend's tick interval is unref'd so it doesn't keep
Node alive in tests.

## 9. `@OnQueueReady` lifecycle

The `@OnQueueReady` decorator + `invokeQueueReadyHooks(instance)`
gives workers a clean way to register on boot:

```ts
@Injectable()
class EmailWorker {
  @Inject(QueueService.TOKEN) declare queue: QueueService;

  @OnQueueReady()
  async register() {
    await this.queue.process('send-welcome-email', this.handle);
  }
}
```

The decorator writes `propertyKey` into a `nexus:queue:ready-hooks`
metadata slot on the class. `invokeQueueReadyHooks` reads that
metadata and calls each hook. We don't auto-wire it into
`Application.start()` yet because the worker might live in a child
container that the user has to resolve manually — but a future
release will.

## 10. Events

The backend emits a `QueueEvent` on every state change:

| Kind | When |
| ---- | ---- |
| `job:added` | After `add()` returns |
| `job:active` | When a worker picks the job up |
| `job:completed` | On success |
| `job:failed` | On failure (with `willRetry`) |
| `worker:started` | When `process()` succeeds |
| `worker:stopped` | When `close()` is called |

Listeners subscribe via `queue.on(listener)`. This is the integration
point for the NexusTS event system (v0.2) and for metrics
exporters.

## 11. DI integration

```
ApplicationContainer
  └── ConfiguredQueueModule (returned by QueueModule.forRoot(config))
        ├── QueueService
        ├── QueueService.TOKEN (useExisting alias)
        └── 'QUEUE_CONFIG' (useValue)
```

The service is registered under both the class token and the
`QueueService.TOKEN` Symbol via `useExisting`, mirroring the
`AuthService` pattern.

## 12. Configuration shape

The user-facing config (parsed from `nx.config.ts`) maps 1:1 onto
the runtime config:

```ts
interface QueueConfig {
  backend: 'bullmq' | 'cloudflare' | 'memory';
  bullmq?: {
    connection: string | { host: string; port: number; password?: string };
    prefix?: string;
  };
  cloudflare?: {
    bindingName: string;
    queueName?: string;
  };
  defaults?: AddOptions;
}
```

We don't try to express every backend option — only the ones that
match the common `QueueBackend` interface. Backend-specific tweaks
happen in user code (by casting `svc.backend`).

## 13. CLI integration

`nx make:queue <Name>` generates:

- `src/queue/workers/<name>.worker.ts` — `@OnQueueReady` handler
- `src/queue/jobs/<name>.job.ts` — `enqueue()` / `enqueueBatch()` helper

The worker template wraps the handler in a try/catch and returns the
right `JobResult` shape so retries work out of the box. The job
template just delegates to `queue.add` so the call site is
ergonomic:

```ts
// src/controllers/checkout.controller.ts
await this.checkoutJob.enqueue({ userId, cart });
```

The CLI's `make:queue --backend bullmq` reuses the backend choice
in `nx.config.ts` if `--backend` isn't passed.

## 14. Testing strategy

- **Unit tests** for the in-memory backend (no Redis, no Workers).
- **Integration tests** for `QueueService` DI + `add` / `process` /
  `stop` flow.
- **@OnQueueReady tests** — invoke hooks on instances and assert
  side effects.
- **Validation tests** — `forRoot({ backend: 'bullmq' })` without
  `connection` throws on resolve.

BullMQ- and Cloudflare-specific behavior is tested at the
underlying library's level (we don't re-test what we wrap). The
tests focus on the **NexusTS integration points**.

## 15. Known issues

### ioredis v5 + Bun

`ioredis@5` works under Bun but needs `maxRetriesPerRequest: null`
for BullMQ to behave (the connection is shared with the worker, and
BullMQ requires that to disable its internal retry). Our wrapper
sets this automatically.

### Cloudflare `bind()` race

`CloudflareQueueBackend.bind(env)` must be called before the first
`add()`. We do this in the Worker's `queue()` export (right after
`app = new Application(...)`). Forgetting to bind produces a clear
error: `"[queue/cloudflare] bind() must be called before add()"`.

### Test ergonomics

The in-memory backend's tick interval (100ms) makes tests slightly
slower than a sync queue would. We considered exposing a "flush"
API to drain the queue synchronously but it would diverge from the
real backends. Instead, tests `await new Promise(r => setTimeout(r, 250))`
after `add()` to give the tick a chance to dispatch.

## 16. Future work

- **Streaming jobs** — long-running jobs that emit progress events
  to a websocket (BullMQ Pro feature).
- **Cron / scheduled jobs** — first-class `@Scheduled(cron)` decorator
  that turns into a one-shot `add({ delaySeconds: ... })`.
- **Job chains** — `addBatch([a, b, c])` where each job depends on
  the previous one's output.
- **Dead-letter queue (DLQ)** — auto-route permanently-failed jobs
  to a separate queue.
- **Better-auth hooks** — listen to `user.created` events and enqueue
  a welcome email.

## 17. See also

- [`queue.md`](../user-guide/queue.md) — user-facing guide
- [BullMQ docs](https://docs.bullmq.io/)
- [Cloudflare Queues docs](https://developers.cloudflare.com/queues/)
- [`auth.md`](./auth.md) — sibling design doc (same pattern)
