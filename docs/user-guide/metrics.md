# Metrics · `@nexusts/metrics` (Tier 2 v0.4)

> Tier 2 gap from the v0.3 gap analyses, closed in **v0.4**.

`@nexusts/metrics` is a Prometheus-compatible metrics collection library
for the Bun-native stack. It implements the four standard metric
types (counter, gauge, histogram, summary), label support, and
the Prometheus / OpenMetrics text exposition formats.

**Zero external dependencies.** ~5kb gzipped.

---

## 1. Quick start

```ts
import { Module } from '@nexusts/core';
import { MetricsModule } from '@nexusts/metrics';

@Module({
  imports: [
    MetricsModule.forRoot({
      enableDefaultMetrics: true,
      path: '/metrics',
      globalLabels: { service: 'my-app' },
    }),
  ],
})
class AppModule {}
```

That single call:

1. Registers Bun process metrics (CPU, memory, GC, event-loop lag)
   with auto-collected values.
2. Mounts `GET /metrics` with content negotiation (Prometheus 0.0.4 by
   default, OpenMetrics 1.0.0 when the client requests it).
3. Applies `service: "my-app"` as a global label on every metric.

```bash
$ curl http://localhost:3000/metrics
# HELP process_resident_memory_bytes Resident memory size in bytes.
# TYPE process_resident_memory_bytes gauge
process_resident_memory_bytes{service="my-app"} 12345678

# HELP bun_heap_size_used_bytes Bun heap size used in bytes.
# TYPE nodejs_heap_size_used_bytes gauge
nodejs_heap_size_used_bytes{service="my-app"} 4567890
...
```

---

## 2. Defining your own metrics

The service is the source of truth — register metrics, then record
samples as the app runs.

```ts
@Injectable()
class UserService {
  constructor(private metrics: MetricsService) {
    this.requests = this.metrics.counter({
      name: 'user_requests_total',
      help: 'Total user-related requests',
      labelNames: ['method', 'status'],
    });
    this.duration = this.metrics.histogram({
      name: 'user_request_duration_seconds',
      help: 'User request duration',
      labelNames: ['method'],
      buckets: [0.005, 0.01, 0.05, 0.1, 0.5, 1, 5],
    });
  }

  async findById(id: string) {
    this.requests.inc({ method: 'GET', status: '200' });
    const end = this.duration.startTimer({ method: 'GET' });
    try {
      return await this.db.findById(id);
    } finally {
      end();
    }
  }
}
```

### The four metric types

| Type | Use for | Methods |
| --- | --- | --- |
| **Counter** | Request counts, error counts, bytes sent | `inc()`, `incBy(n)` |
| **Gauge** | Active connections, memory, queue size | `set(v)`, `inc(n)`, `dec(n)`, `setToCurrentTime()` |
| **Histogram** | Request duration, payload size | `observe(v)`, `time(fn)` |
| **Summary** | Percentiles of a value over a window | `observe(v)`, `time(fn)` |

Counter is monotonically increasing. Gauge can go up or down.
Histogram and Summary both record distributions — Histogram
exposes bucket counts (cumulative), Summary exposes client-side
quantiles.

### Default buckets

`Histogram` uses the Prometheus default buckets when none are
provided:

```
0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10
```

### Default percentiles

`Summary` defaults to `[0.5, 0.9, 0.99]`.

---

## 3. Decorators — `@Counted()` and `@Timed()`

For ergonomics, two method decorators are provided:

```ts
import { Counted, Timed } from '@nexusts/metrics';

class UserController {
  @Counted('http_requests_total', { labels: () => ({ method: 'GET' }) })
  @Timed('http_request_duration_seconds', { labels: () => ({ method: 'GET' }) })
  async list(req: Request) {
    return this.db.findAll();
  }
}
```

Both decorators:

- **Read the active `MetricsService` from the global registry.** The
  decorator is a transparent pass-through if no service is set.
- **Detect `AsyncFunction` and use the appropriate helper.** Sync
  methods stay sync; async methods stay async.
- **Auto-register the metric** with the right `labelNames` the
  first time the method is called.

---

## 4. The `/metrics` endpoint

```http
GET /metrics HTTP/1.1
Host: localhost:3000
Accept: text/plain
```

Returns Prometheus 0.0.4 text format:

```text
# HELP user_requests_total Total user-related requests
# TYPE user_requests_total counter
user_requests_total{method="GET",status="200",service="my-app"} 42
user_requests_total{method="POST",status="201",service="my-app"} 3

# HELP user_request_duration_seconds User request duration
# TYPE user_request_duration_seconds histogram
user_request_duration_seconds_bucket{method="GET",le="0.005",service="my-app"} 10
user_request_duration_seconds_bucket{method="GET",le="0.01",service="my-app"} 25
user_request_duration_seconds_bucket{method="GET",le="+Inf",service="my-app"} 42
user_request_duration_seconds_sum{method="GET",service="my-app"} 1.234
user_request_duration_seconds_count{method="GET",service="my-app"} 42
```

For OpenMetrics, send `Accept: application/openmetrics-text`:

```http
GET /metrics HTTP/1.1
Accept: application/openmetrics-text
```

---

## 5. Content negotiation

The controller picks the format from the `Accept` header:

| Accept header | Format | Content-Type |
| --- | --- | --- |
| (anything) | Prometheus 0.0.4 | `text/plain; version=0.0.4; charset=utf-8` |
| `application/openmetrics-text` | OpenMetrics 1.0.0 | `application/openmetrics-text; version=1.0.0; charset=utf-8` |

The response body is the same; only the `Content-Type` header
and the trailing newline convention differ.

---

## 6. Default Bun process metrics

When `enableDefaultMetrics: true` (the default), the following
gauges are registered with a `collect()` callback that runs at
scrape time:

| Metric | Description |
| --- | --- |
| `process_start_time_seconds` | Start time of the process since unix epoch |
| `process_resident_memory_bytes` | RSS in bytes |
| `process_cpu_user_seconds_total` | User CPU time |
| `process_cpu_system_seconds_total` | System CPU time |
| `nodejs_heap_size_used_bytes` | V8 heap used |
| `nodejs_heap_size_total_bytes` | V8 heap total |
| `nodejs_external_memory_bytes` | External memory |
| `nodejs_eventloop_lag_seconds` | Event loop lag (sampled) |
| `nodejs_active_handles_total` | Active handles |
| `nodejs_active_requests_total` | Active requests |

---

## 7. Manual controller mount

If you don't want the controller auto-mounted:

```ts
MetricsModule.forRoot({
  mountController: false,
});

// Then mount it yourself:
const svc = new MetricsService();
MetricsController.mount(app, svc, '/admin/metrics');
```

Or use a fully manual setup with no `forRoot()`:

```ts
const svc = new MetricsService();
svc.counter({ name: 'manual_hits_total' }).inc();
app.get('/metrics', MetricsController.handler(svc));
```

---

## 8. Configuration reference

```ts
interface MetricsConfig {
  defaultBuckets?: number[];          // Histogram defaults
  defaultPercentiles?: number[];      // Summary defaults
  path?: string;                      // default: "/metrics"
  enableDefaultMetrics?: boolean;     // default: true
  mountController?: boolean;          // default: true
  globalLabels?: Record<string, string>;
}
```

---

## 9. See also

- [v0.3 NestJS gap analysis](../analysis/nestjs-comparison.md) —
  Tier 2 §4.5 (Prometheus / OpenMetrics)
- [`./tracing.md`](./tracing.md) — companion Tier 2 module
- [`./sse.md`](./sse.md) — companion Tier 2 module
- [`./request-scope.md`](./request-scope.md) — companion Tier 2 module
- [Prometheus exposition format spec](https://github.com/prometheus/docs/blob/main/content/docs/instrumenting/exposition_formats.md)
- [OpenMetrics spec](https://github.com/prometheus/OpenMetrics/blob/main/specification/OpenMetrics.md)
