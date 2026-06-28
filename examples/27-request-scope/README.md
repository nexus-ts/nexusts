# 27 · Request Scope

Per-request provider instances — each HTTP request gets its own copy.

## What it shows

- `@Injectable({ scope: 'request' })` for per-request services
- How to inject request-scoped data into a service
- When to use (and not use) request scope

## How to run

```bash
cd examples/27-request-scope
bun main.ts
```

```bash
# Each request gets a fresh counter
curl http://localhost:3000/counter
curl http://localhost:3000/counter
```

## Code

```ts
import "reflect-metadata";
import { Application, Module, Controller, Get, Injectable, Inject, Ctx } from "@nexusts/core";

@Injectable({ scope: "request" })
class RequestContext {
  requestId = Math.random().toString(36).slice(2, 10);
  hits = 0;
}

@Injectable()
@Controller("/")
class AppController {
  @Inject(RequestContext) declare private ctx: RequestContext;

  @Get("/counter")
  counter() {
    this.ctx.hits += 1;
    return { requestId: this.ctx.requestId, hits: this.ctx.hits };
  }

  @Get("/info")
  info(@Ctx() c: any) {
    return {
      requestId: this.ctx.requestId,
      url: c.req.url,
      method: c.req.method,
    };
  }
}

@Module({
  controllers: [AppController],
  providers: [RequestContext],
})
class AppModule {}

const app = new Application(AppModule);
await app.listen(3000);
```

## Why request scope?

- A counter that resets every request
- A request log that captures the trace ID
- A per-request transaction (DB session)
- A per-request user principal

## Performance

Request-scoped providers are slower than singletons — the framework
creates a new instance for each request. Use them only when you need
fresh state per request.

## When NOT to use

- Read-mostly data → use `@Injectable()` (default singleton)
- Connection pools → singleton with internal queue
- Configuration → use `ConfigService` (singleton)

## Full-stack example

```ts
@Injectable({ scope: "request" })
class RequestTx {
  @Inject(DrizzleService) declare private db: DrizzleService;

  async run(fn: (tx: any) => Promise<any>) {
    // open a transaction just for this request
    return this.db.transaction(fn);
  }
}
```
