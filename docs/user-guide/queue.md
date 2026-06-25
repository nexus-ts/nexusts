# Queue · BullMQ, Cloudflare Queues

> 한국어 버전: [`queue.ko.md`](./queue.ko.md)

NexusTS ships a queue module under `@nexusts/queue` that wraps two
production-ready backends:

- **BullMQ** — Redis-backed, for long-running Bun / Node servers.
- **Cloudflare Queues** — Workers-native, edge-friendly.
- **In-memory** — for tests and single-instance dev.

Both share a common `QueueBackend` interface, so application code
talks to `QueueService` and never to a specific backend directly.

The queue module is **separate from `@nexusts/core`** and is added as its
own bundle entry point.

---

## 1. Install

```bash
bun add @nexusts/queue bullmq ioredis
# Only need the one(s) for your backend:
#   bun add bullmq ioredis     # for the BullMQ backend
#   no extra deps             # for the Cloudflare backend (Workers runtime provides them)
#   no extra deps             # for the in-memory backend (tests)
```

---

## 2. Quick start

```ts
// app/app.module.ts
import { Module } from '@nexusts/core';
import { QueueModule } from '@nexusts/queue';

@Module({
  imports: [
    QueueModule.forRoot({
      backend: 'bullmq',
      bullmq: {
        connection: process.env.REDIS_URL ?? 'redis://localhost:6379',
        prefix: 'nexusts',
      },
      defaults: { attempts: 3, backoff: { type: 'exponential', delayMs: 1000 } },
    }),
  ],
})
export class AppModule {}
```

Enqueue from any controller or service:

```ts
import { Inject } from '@nexusts/core';
import { QueueService } from '@nexusts/queue';
import { Controller, Post, Body } from '@nexusts/core';

@Controller('/signup')
class SignupController {
  @Inject(QueueService.TOKEN) declare queue: QueueService;

  @Post('/')
  async signup(ctx: Context) {
    const body = await ctx.req.json() as { email: string };
    await this.queue.add('send-welcome-email', { email: body.email });
    return { status: 'queued' };
  }
}
```

Register a worker:

```ts
import { Inject, Injectable } from '@nexusts/core';
import { QueueService, OnQueueReady } from '@nexusts/queue';

@Injectable()
class EmailWorker {
  @Inject(QueueService.TOKEN) declare queue: QueueService;

  @OnQueueReady()
  async register() {
    await this.queue.process('send-welcome-email', async (data, ctx) => {
      ctx.prefix; // → "[queue:send-welcome-email]"
      // ... send the email
      return { status: 'completed' };
    });
  }
}
```

Wire it up:

```ts
@Module({
  providers: [EmailWorker],
})
class WorkerModule {}
```

---

## 3. The two backends

### BullMQ

Production-ready, Redis-backed. Use for:

- Long-running Bun / Node servers.
- Jobs that need delayed execution, retries, or rate limiting.
- Multi-instance deployments sharing a Redis cluster.

```ts
QueueModule.forRoot({
  backend: 'bullmq',
  bullmq: {
    connection: 'redis://localhost:6379',
    // or: { host: '...', port: 6379, password: '...' }
    prefix: 'nexusts',
  },
  defaults: {
    attempts: 5,
    backoff: { type: 'exponential', delayMs: 1000 },
    removeOnComplete: 100,
    removeOnFail: 1000,
  },
});
```

### Cloudflare Queues

Workers-native. Use for:

- Edge deployments (Cloudflare Workers).
- Apps that want zero infrastructure (no Redis to manage).
- Tight integration with other Workers features (Durable Objects,
  Cron Triggers).

```ts
QueueModule.forRoot({
  backend: 'cloudflare',
  cloudflare: {
    bindingName: 'MY_QUEUE',
    queueName: 'my-queue',
  },
});
```

The Worker entry needs the Queue binding:

```toml
# wrangler.toml
[[queues.producers]]
binding = "MY_QUEUE"
queue = "my-queue"

[[queues.consumers]]
queue = "my-queue"
max_batch_size = 10
max_retries = 3
```

```ts
// app/worker.ts
import { Application } from '@nexusts/core';
import { QueueService, QueueModule } from '@nexusts/queue';

const AppModule = QueueModule.forRoot({
  backend: 'cloudflare',
  cloudflare: { bindingName: 'MY_QUEUE' },
});

const app = new Application(AppModule);

// Register workers (see "Worker registration" below).
app.container.resolve(QueueService);

export default {
  fetch: app.fetch,

  // The `queue` handler dispatches each message to the registered worker.
  async queue(batch, env, ctx) {
    const svc = app.container.resolve(QueueService);
    const backend = svc.getCloudflareBackend();
    if (backend) backend.bind(env);
    // Drive the message dispatch.
    for (const message of batch.messages) {
      message.ack();
    }
  },
};
```

### In-memory (tests)

No Redis, no Workers runtime — for `vitest` and `bunx nx dev` before
you've set up Redis:

```ts
QueueModule.forRoot({ backend: 'memory' });
```

The in-memory backend ticks every 100 ms and is fully await-able in
tests.

---

## 4. Job lifecycle

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
    removed from queue         retry (up to `attempts`)
                                      │
                                      ▼
                              { status: 'failed', willRetry: false }
                                      │
                                      ▼
                                 dead-lettered
```

The handler can return:

```ts
{ status: 'completed', returnvalue?: T }     // success
{ status: 'failed', error: Error, willRetry: boolean }  // failure
{ status: 'retry', reason?: string, delaySeconds?: number }  // explicit retry
```

A plain thrown error is treated as a failure with the configured
retry policy.

---

## 5. `@OnQueueReady` lifecycle hook

Workers self-register at boot:

```ts
@Injectable()
class EmailWorker {
  @Inject(QueueService.TOKEN) declare queue: QueueService;

  @OnQueueReady()
  async register() {
    await this.queue.process('send-welcome-email', this.handle);
  }

  handle = async (data) => { ... };
}
```

`invokeQueueReadyHooks(instance)` runs every `@OnQueueReady` method
on an instance. Pair with a bootstrap helper:

```ts
// app/main.ts
const app = new Application(AppModule);
await app.container.resolve(QueueService).start();

// Run all @OnQueueReady hooks on the worker instances.
for (const worker of [...app.container.list()]) {
  await invokeQueueReadyHooks(/* get instance */);
}
```

In a future release, this will be automatic via the `Application`
lifecycle.

---

## 6. Events

```ts
const unsub = queue.on((event) => {
  switch (event.kind) {
    case 'job:added':     // before the job is dispatched
    case 'job:active':    // a worker picked it up
    case 'job:completed': // success
    case 'job:failed':    // error (willRetry indicates whether it'll be retried)
    case 'worker:started': // process() succeeded
    case 'worker:stopped': // close() was called
  }
});
```

Handy for logging, metrics, or wiring into the NexusTS event system
(v0.2).

---

## 7. Concurrency, rate limiting, locking

```ts
await queue.process('resize-image', this.handle, {
  concurrency: 5,            // 5 in-flight at once
  limiter: {                  // token-bucket rate limit
    max: 10,
    durationMs: 1000,         // 10 per second
  },
  lockDurationMs: 30000,      // hold the lock for up to 30s before re-queue
});
```

Cloudflare Queues has its own concurrency / batching settings in
`wrangler.toml` (`max_batch_size`, `max_retries`); they take precedence
over the per-process options.

---

## 8. Delayed jobs

```ts
await queue.add('reminder', { userId: 42 }, { delaySeconds: 60 * 60 });
```

Cloudflare supports up to 24 hours (`delaySeconds ≤ 86400`). BullMQ has
no fixed upper bound.

---

## 9. Idempotency

Pass a `jobId` to dedupe:

```ts
await queue.add(
  'charge-customer',
  { customerId, amount },
  { jobId: `charge:${customerId}:${requestId}` },
);
```

If the same `jobId` is enqueued twice, the second `add()` is a no-op
(BullMQ). Cloudflare has no equivalent — dedupe on the worker side
instead.

---

## 10. CLI: `nx make:queue`

Generates a worker + enqueue helper:

```bash
nx make:queue send-welcome-email
nx make:queue process-image --backend cloudflare
nx make:queue notify --no-job
```

Generates:

- `app/queue/workers/<name>.worker.ts` — `@OnQueueReady` handler class
- `app/queue/jobs/<name>.job.ts` — `enqueue*` helper for callers

Flags:

| Flag | Effect |
| ---- | ------ |
| `--backend` | Override the backend (`bullmq` / `cloudflare` / `memory`) |
| `--no-job` | Skip the enqueue helper |
| `--no-worker` | Skip the worker class |

---

## 11. Testing

Use the in-memory backend in tests:

```ts
const AppQueueModule = QueueModule.forRoot({ backend: 'memory' });

@Module({ imports: [AppQueueModule] })
class TestModule {}

const app = new Application(TestModule);
const queue = app.container.resolve(QueueService);
await queue.start();

let received: unknown;
await queue.process('send-email', async (data) => {
  received = data;
  return { status: 'completed' };
});
await queue.add('send-email', { to: 'x@y.z' });

await new Promise((r) => setTimeout(r, 200));
expect(received).toEqual({ to: 'x@y.z' });

await queue.stop();
```

---

## 12. See also

- [`../design/queue.md`](../design/queue.md) — architecture, decisions
- [BullMQ docs](https://docs.bullmq.io/)
- [Cloudflare Queues docs](https://developers.cloudflare.com/queues/)
- [`./cli.md`](./cli.md) — `nx make:queue` reference
