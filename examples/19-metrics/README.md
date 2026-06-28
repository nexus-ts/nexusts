# 19 · Metrics

Prometheus-compatible counters, gauges, and histograms with `@nexusts/metrics`.

## What it shows

- `MetricsModule.forRoot({ defaultLabels: [...] })`
- `Counter`, `Gauge`, `Histogram` injection
- `MetricsController` exposes `/metrics` in OpenMetrics format
- `@Timed()`, `@Counted()` decorators for method-level metrics

## How to run

```bash
cd examples/19-metrics
bun main.ts
```

```bash
# Hit an endpoint a few times
for i in 1 2 3; do curl http://localhost:3000/orders; done

# Scrape metrics
curl http://localhost:3000/metrics
```

## Code

```ts
import "reflect-metadata";
import { Application, Module, Controller, Get, Inject, Injectable } from "@nexusts/core";
import { Counter, MetricsModule, MetricsService } from "@nexusts/metrics";

@Injectable()
class OrderService {
  ordersCounter = new Counter({
    name: "orders_total",
    help: "Total orders placed",
  });

  async placeOrder() {
    this.ordersCounter.inc({ status: "ok" });
  }
}

@Injectable()
@Controller("/orders")
class OrderController {
  @Inject(MetricsService) declare private metrics: MetricsService;

  @Get("/")
  place() {
    this.metrics.counter({ name: "page_hits", help: "Page hits" }).inc({ path: "/orders" });
    return { ok: true, ts: Date.now() };
  }
}

@Module({
  imports: [MetricsModule.forRoot()],
  controllers: [OrderController],
})
class AppModule {}

const app = new Application(AppModule);
await app.listen(3000);
```

Visit `http://localhost:3000/metrics` for OpenMetrics output.

## Metric types

| Type | Use |
|------|-----|
| `Counter` | Monotonically increasing (requests, errors) |
| `Gauge` | Value can go up/down (queue size, temperature) |
| `Histogram` | Distribution of values (latency, size) |
| `Summary` | Pre-aggregated percentiles |

## Decorator pattern

```ts
import { Timed, Counted } from "@nexusts/metrics";

@Injectable()
class UserService {
  @Timed("user_lookup_duration_seconds")
  async findOne(id: string) { ... }

  @Counted("user_logins_total")
  async login(user: string) { ... }
}
```
