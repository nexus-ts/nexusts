# 09 · Queue

Background job processing with `@nexusts/queue`. Uses the
in-memory backend for this example (no Redis required).

## What it shows

- `QueueModule.forRoot({ backend: 'memory' })` for DI
- `@OnQueueReady()` to register a worker
- `QueueService.add(name, payload, options)` to enqueue
- Type-safe job handlers

## How to run

```bash
cd examples/09-queue
bun main.ts
```

Then:

```bash
# Enqueue a "send email" job
curl -X POST http://localhost:3000/jobs/email \
  -H "Content-Type: application/json" \
  -d '{"to":"alice@example.com","subject":"Hello"}'
```

## Code

```ts
// main.ts
import "reflect-metadata";
import { Application, Controller, Get, Post, Body, Module, Inject, Injectable } from "@nexusts/core";
import { QueueService, QueueModule, OnQueueReady } from "@nexusts/queue";

@Injectable()
class EmailWorker {
  @Inject(QueueService) declare private queue: QueueService;

  @OnQueueReady()
  register() {
    this.queue.process("send-email", async (data: any) => {
      console.log(`[worker] sending email to ${data.to}: ${data.subject}`);
      // simulate I/O
      await new Promise((r) => setTimeout(r, 100));
      return { status: "sent", to: data.to };
    });
  }
}

@Controller("/jobs")
class JobController {
  @Inject(QueueService) declare private queue: QueueService;

  @Post("/email")
  async enqueueEmail(@Body() body: { to: string; subject: string }) {
    const jobId = await this.queue.add("send-email", body);
    return { jobId, status: "queued" };
  }

  @Get("/count")
  count() {
    return { jobs: this.queue.size() };
  }
}

@Module({
  imports: [QueueModule.forRoot({ backend: "memory" })],
  controllers: [JobController],
  providers: [EmailWorker],
})
class AppModule {}

const app = new Application(AppModule);
await app.listen(3000);
```

## Production backends

In real apps, switch to:

| Backend | Setup |
|---------|-------|
| `bullmq` | Add `bullmq` and `ioredis` deps, then `backend: 'bullmq'` |
| `cloudflare` | Set `backend: 'cloudflare'` with a Cloudflare Queue binding |

## Retry logic

```ts
this.queue.process("send-email", handler, {
  attempts: 3,
  backoff: { type: "exponential", delay: 1000 },
});
```

## Enqueueing in services

```ts
class OrderService {
  @Inject(QueueService) declare private queue: QueueService;
  async placeOrder(order: Order) {
    // persist to DB...
    await this.queue.add("send-confirmation", order);
  }
}
```
