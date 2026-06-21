# Distributed tracing · `nexus/tracing` (Tier 2 v0.4)

> Tier 2 gap from the v0.3 gap analyses, closed in **v0.4**.

`nexus/tracing` is a thin, ergonomic wrapper around the
[OpenTelemetry](https://opentelemetry.io/) API. It provides:

- **`TracingService`** — a DI-friendly service that exposes
  `startSpan()`, `withSpan()`, and context propagation helpers.
- **`TracingModule.forRoot(config)`** — starts the OTel SDK with
  the exporter, sampler, and resource attributes of your choice.
- **`@Trace()` decorator** — wrap any class method in a span
  (sync methods stay sync, async methods stay async).
- **`tracingMiddleware()`** — Hono auto-instrumentation that
  creates a server span for every HTTP request, extracts the
  incoming W3C `traceparent`, and records response status +
  exceptions.
- **W3C + B3 propagation** — `parseTraceParent`, `formatTraceParent`,
  `extractB3Context` for the occasional legacy Zipkin service.

The OpenTelemetry **API** package is the only required
dependency (~7kb). The **SDK** packages are optional peer
dependencies — install them only when you call `forRoot()`.

---

## 1. Quick start

```bash
bun add @opentelemetry/api
bun add @opentelemetry/sdk-node \
         @opentelemetry/exporter-trace-otlp-http \
         @opentelemetry/resources \
         @opentelemetry/semantic-conventions
```

```ts
// app.module.ts
import { Module } from 'nexus';
import { TracingModule } from 'nexus/tracing';

@Module({
  imports: [
    TracingModule.forRoot({
      serviceName: 'my-app',
      exporter: 'otlp-http',
      endpoint: 'http://otel-collector:4318',
      sampleRatio: 0.1,        // keep 10% of traces
      environment: 'production',
    }),
  ],
})
export class AppModule {}
```

That's it. Every HTTP request is now traced, every method
decorated with `@Trace()` is wrapped in a child span, and the
spans are batched and shipped to the configured OTLP endpoint.

---

## 2. The `@Trace()` decorator

```ts
import { Trace } from 'nexus/tracing';

class UserService {
  @Trace()                        // span name = "UserService.findById"
  findById(id: string) { ... }

  @Trace('user.lookup')           // explicit span name
  async lookup(name: string) { ... }

  @Trace({
    name: 'user.cache.get',
    attributes: { 'cache.hit': false },
  })
  async getFromCache(key: string) { ... }
}
```

- **Sync methods stay sync.** The decorator detects `AsyncFunction`
  and uses `withSpan` / `withSpanSync` accordingly.
- **No-op when tracing is not configured.** If you didn't call
  `TracingModule.forRoot()`, the decorator is a transparent
  pass-through — zero overhead.
- **Works with classes that have a constructor that takes args.**
  The decorator preserves `this`.

---

## 3. Manual spans — `withSpan()` and `withSpanSync()`

For code that isn't a class method (top-level utilities, queue
handlers, cron tasks, etc.):

```ts
import { withSpan } from 'nexus/tracing';

await withSpan('nightly.cleanup', async (span) => {
  span.setAttribute('cleanup.target', 'sessions');
  span.addEvent('starting');
  await cleanupSessions();
  span.addEvent('done');
});
```

Or synchronously:

```ts
const result = service.withSpanSync('compute', (span) => {
  span.setAttribute('input.size', 42);
  return compute();
});
```

Both forms:

- Catch exceptions and rethrow them with the span marked
  `status=error` and the exception recorded.
- Return whatever the callback returns.

---

## 4. Context propagation

### Reading the current trace

```ts
import { getTracingService } from 'nexus/tracing';

const svc = ...; // TracingService instance
console.log(svc.getCurrentTraceId());  // undefined outside a request
```

In a request handler (or inside a `@Trace()` method), this returns
the active trace id.

### Extracting from incoming headers

```ts
const ctx = svc.extractContext(request.headers);
// Use this Context as the parent of a new span.
```

The default W3C `traceparent` header is read. B3 single-header
(`b3: <traceId>-<spanId>-1`) is also supported via
`extractB3Context()`.

### Injecting into outgoing headers

```ts
const headers = svc.injectContext({
  'content-type': 'application/json',
});
// headers.traceparent is set when there's an active span
const res = await fetch('https://other-service/path', { headers });
```

---

## 5. Hono auto-instrumentation

`TracingModule.forRoot()` installs a Hono middleware
automatically — every request gets a `SERVER` span with these
attributes:

| Attribute | Source |
| --- | --- |
| `http.method` | `c.req.method` |
| `http.route` | matched route path |
| `http.target` | `c.req.path` |
| `http.scheme` | URL protocol |
| `http.host` | URL host |
| `http.user_agent` | `User-Agent` header |
| `http.client_ip` | `X-Forwarded-For` / `X-Real-IP` |
| `http.status_code` | response status |

To use the middleware with a **custom Hono app** (not the
framework's HTTP server):

```ts
import { Hono } from 'hono';
import { tracingMiddleware, TracingService } from 'nexus/tracing';

const service = new TracingService();
const app = new Hono();
app.use('*', tracingMiddleware(service));
```

---

## 6. Configuration reference

```ts
interface TracingConfig {
  serviceName?: string;          // default: "nexus"
  serviceVersion?: string;       // default: "0.0.0"
  environment?: string;          // default: process.env.NODE_ENV
  exporter?: 'otlp-http' | 'otlp-grpc' | 'console' | 'memory';
  endpoint?: string;             // default: http://localhost:4318
  sampleRatio?: number;          // 0..1, default 1.0
  enableHttpInstrumentation?: boolean;  // default true
  enableDbInstrumentation?: boolean;    // default true (nexus/drizzle hook)
  resourceAttributes?: Record<string, string>;
  throwOnError?: boolean;        // default false
}
```

The `exporter` field controls the destination:

- `otlp-http` (default) — POST to `<endpoint>/v1/traces` (Jaeger,
  Tempo, Honeycomb, SigNoz, etc. all accept this).
- `otlp-grpc` — same but gRPC. Requires the
  `@opentelemetry/exporter-trace-otlp-grpc` package.
- `console` — pretty-prints spans to stdout (dev only).
- `memory` — keeps spans in-process (test only).

---

## 7. Bundling / peer dependencies

Because the OTel SDK packages can be large (~5MB combined), they
are **optional peer dependencies** of `nexusjs`. Apps that don't
use `nexus/tracing` don't pay the cost.

When you install only the API:

```bash
bun add @opentelemetry/api
```

…`TracingService` falls back to the default no-op tracer. The
service is fully functional — `withSpan()` works, `@Trace()`
works, the Hono middleware runs — but spans are no-ops. This is
intentional: dev-mode apps can keep tracing as no-op and flip it
on in prod by setting `OTEL_EXPORTER_OTLP_ENDPOINT` + adding the
SDK packages.

---

## 8. Verification

```ts
import { describe, it, expect } from 'vitest';
import { TracingService, withSpan } from 'nexus/tracing';

describe('tracing', () => {
  it('exposes a tracer', () => {
    const svc = new TracingService();
    expect(svc.tracer).toBeDefined();
  });

  it('runs withSpan', async () => {
    const svc = new TracingService();
    const r = await svc.withSpan('op', async (s) => {
      s.setAttribute('user.id', 'u1');
      return 42;
    });
    expect(r).toBe(42);
  });
});
```

---

## 9. See also

- [v0.3 NestJS gap analysis](../analysis/nestjs-comparison.md) —
  Tier 2 §4.4 (OpenTelemetry observability)
- [`./sse.md`](./sse.md) — companion Tier 2 module
- [`./request-scope.md`](./request-scope.md) — companion Tier 2
  module (request-scoped DI)
- [OpenTelemetry JavaScript docs](https://opentelemetry.io/docs/languages/js/)
- [W3C Trace Context spec](https://www.w3.org/TR/trace-context/)
