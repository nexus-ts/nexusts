# 20 · Tracing (OpenTelemetry)

Distributed tracing for HTTP, gRPC, and DB calls with `@nexusts/tracing`.

## What it shows

- `TracingModule.forRoot({ service: 'my-app' })` to enable
- Auto-instrumentation of incoming HTTP, outgoing HTTP, gRPC, Drizzle
- `trace.span(name)` for custom spans

## How to run

```bash
cd examples/20-tracing
bun main.ts
```

```bash
# Hit the endpoint
curl http://localhost:3000/work
# Look for "traceId" in the response
```

## Code

```ts
import "reflect-metadata";
import { Application, Module, Controller, Get, Inject, Injectable } from "@nexusts/core";
import { TracingModule, TracingService } from "@nexusts/tracing";

@Injectable()
class WorkService {
  @Inject(TracingService) declare private trace: TracingService;

  async run() {
    return this.trace.span("do-work", async (span) => {
      span.setAttribute("feature", "demo");
      await new Promise((r) => setTimeout(r, 100));
      return { done: true };
    });
  }
}

@Injectable()
@Controller("/")
class AppController {
  @Inject(WorkService) declare private work: WorkService;

  @Get("/work")
  async work() {
    const result = await this.work.run();
    return result;
  }
}

@Module({
  imports: [TracingModule.forRoot({ serviceName: "demo" })],
  controllers: [AppController],
  providers: [WorkService],
})
class AppModule {}

const app = new Application(AppModule);
await app.listen(3000);
```

## Spans

```ts
this.trace.span("operation", async (span) => {
  span.setAttribute("userId", "42");
  span.addEvent("checkpoint-reached");
  // ...your code...
});
```

## Exporters

By default, spans are written to stdout in JSON. For production, configure
an OTLP exporter:

```ts
TracingModule.forRoot({
  serviceName: "demo",
  exporter: { type: "otlp", endpoint: "http://otel-collector:4318" },
})
```

Supported exporters: `otlp`, `console`, `null`.

## Auto-instrumentation

The TracingModule automatically instruments:

- `fetch` / Hono client
- Drizzle queries
- gRPC client/server
- HTTP server
