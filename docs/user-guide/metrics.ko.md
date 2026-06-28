# 메트릭 · `@nexusts/metrics` (Tier 2 v0.4)

> English: [`metrics.md`](./metrics.md)
> v0.3 격차 분석의 Tier 2 격차, **v0.4**에서 해소.

`@nexusts/metrics`는 Bun 네이티브 스택을 위한 Prometheus 호환 메트릭 수집 라이브러리. 네 가지 표준 메트릭 타입 (counter, gauge, histogram, summary), 라벨 지원, Prometheus / OpenMetrics 텍스트 익스포지션 포맷을 구현.

**외부 의존성 0.** gzipped ~5kb.

---

## 1. 빠른 시작

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

이 한 번의 호출로:

1. Bun 프로세스 메트릭 (CPU, 메모리, GC, event loop lag)을 자동 수집
2. `GET /metrics`를 content negotiation과 함께 마운트 (기본 Prometheus 0.0.4, 클라이언트가 요청 시 OpenMetrics 1.0.0)
3. 모든 메트릭에 `service: "my-app"`을 global label로 적용

```bash
$ curl http://localhost:3000/metrics
# HELP process_resident_memory_bytes Resident memory size in bytes.
# TYPE process_resident_memory_bytes gauge
process_resident_memory_bytes{service="my-app"} 12345678

# HELP bun_heap_size_used_bytes Bun heap size used in bytes.
# TYPE bun_heap_size_used_bytes gauge
bun_heap_size_used_bytes{service="my-app"} 4567890
...
```

---

## 2. 자체 메트릭 정의

서비스가 source of truth — 메트릭을 등록하고 앱 실행 중 샘플을 기록.

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

### 네 가지 메트릭 타입

| 타입 | 용도 | 메소드 |
| --- | --- | --- |
| **Counter** | 요청 수, 에러 수, 송신 바이트 | `inc()`, `incBy(n)` |
| **Gauge** | 활성 연결, 메모리, 큐 크기 | `set(v)`, `inc(n)`, `dec(n)`, `setToCurrentTime()` |
| **Histogram** | 요청 지속시간, 페이로드 크기 | `observe(v)`, `time(fn)` |
| **Summary** | 윈도우 내 값의 백분위 | `observe(v)`, `time(fn)` |

Counter는 단조 증가. Gauge는 증감 모두 가능. Histogram과 Summary는 분포를 기록 — Histogram은 버킷 카운트(누적)를 노출하고 Summary는 클라이언트 사이드 quantile을 노출.

### 기본 버킷

`Histogram`은 미지정 시 Prometheus 기본 버킷 사용:

```
0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10
```

### 기본 백분위

`Summary`는 기본값 `[0.5, 0.9, 0.99]`.

---

## 3. 데코레이터 — `@Counted()` 및 `@Timed()`

관용적 사용을 위해 두 가지 메서드 데코레이터 제공:

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

두 데코레이터 모두:

- **글로벌 레지스트리에서 활성 `MetricsService`를 읽음.** 서비스 미설정 시 투명한 pass-through.
- **`AsyncFunction`을 감지해 적절한 헬퍼 사용.** sync 메서드는 sync로, async는 async로 유지.
- **메서드 첫 호출 시 메트릭을 올바른 `labelNames`로 자동 등록.**

---

## 4. `/metrics` 엔드포인트

```http
GET /metrics HTTP/1.1
Host: localhost:3000
Accept: text/plain
```

Prometheus 0.0.4 텍스트 포맷 반환:

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

OpenMetrics는 `Accept: application/openmetrics-text`로 요청:

```http
GET /metrics HTTP/1.1
Accept: application/openmetrics-text
```

---

## 5. Content negotiation

컨트롤러는 `Accept` 헤더로 포맷 결정:

| Accept 헤더 | 포맷 | Content-Type |
| --- | --- | --- |
| (기타) | Prometheus 0.0.4 | `text/plain; version=0.0.4; charset=utf-8` |
| `application/openmetrics-text` | OpenMetrics 1.0.0 | `application/openmetrics-text; version=1.0.0; charset=utf-8` |

응답 본문은 동일; 차이는 `Content-Type` 헤더와 trailing newline 컨벤션뿐.

---

## 6. 기본 Bun 프로세스 메트릭

`enableDefaultMetrics: true` (기본)일 때, 다음 gauge가 scrape 시점에 실행되는 `collect()` 콜백과 함께 등록됨:

| 메트릭 | 설명 |
| --- | --- |
| `process_start_time_seconds` | unix epoch 이후 프로세스 시작 시간 |
| `process_resident_memory_bytes` | RSS (bytes) |
| `process_cpu_user_seconds_total` | user CPU 시간 |
| `process_cpu_system_seconds_total` | system CPU 시간 |
| `bun_heap_size_used_bytes` | V8 heap 사용 |
| `nodejs_heap_size_total_bytes` | V8 heap 총합 |
| `nodejs_external_memory_bytes` | 외부 메모리 |
| `nodejs_eventloop_lag_seconds` | event loop lag (샘플링) |
| `nodejs_active_handles_total` | 활성 handle |
| `nodejs_active_requests_total` | 활성 request |

---

## 7. 수동 컨트롤러 마운트

컨트롤러 자동 마운트를 원하지 않을 때:

```ts
MetricsModule.forRoot({
  mountController: false,
});

// 직접 마운트:
const svc = new MetricsService();
MetricsController.mount(app, svc, '/admin/metrics');
```

`forRoot()` 없이 완전 수동 설정:

```ts
const svc = new MetricsService();
svc.counter({ name: 'manual_hits_total' }).inc();
app.get('/metrics', MetricsController.handler(svc));
```

---

## 8. 설정 레퍼런스

```ts
interface MetricsConfig {
  defaultBuckets?: number[];          // Histogram 기본값
  defaultPercentiles?: number[];      // Summary 기본값
  path?: string;                      // default: "/metrics"
  enableDefaultMetrics?: boolean;     // default: true
  mountController?: boolean;          // default: true
  globalLabels?: Record<string, string>;
}
```

---

## 9. 참고

- [v0.3 NestJS 격차 분석](../analysis/nestjs-comparison.md) — Tier 2 §4.5
- [`./tracing.md`](./tracing.md) — 동반 Tier 2 모듈
- [`./sse.md`](./sse.md) — 동반 Tier 2 모듈
- [`./request-scope.md`](./request-scope.md) — 동반 Tier 2 모듈
- [Prometheus exposition format spec](https://github.com/prometheus/docs/blob/main/content/docs/instrumenting/exposition_formats.md)
- [OpenMetrics spec](https://github.com/prometheus/OpenMetrics/blob/main/specification/OpenMetrics.md)
