# Resilience · `@kabyeon/nexusjs/resilience`

> English version: [`resilience.md`](./resilience.md)

세 가지 고전 분산 시스템 프리미티브 — 재시도 + 백오프, 서킷
브레이커, 벌크헤드 (동시성 제한) — 를 단일 데코레이터 친화적 API로
제공한다.

## 한눈에

```bash
# (peer-dep 없음 — 순수 TypeScript)
```

```ts
import {
  ResilienceModule, ResilienceService, retry,
  CircuitBreaker, Bulkhead, CircuitOpenError, BulkheadFullError,
} from "@kabyeon/nexusjs/resilience";

@Module({
  imports: [ResilienceModule.forRoot()],
  controllers: [AppController],
})
class AppModule {}

class AppController {
  constructor(@Inject(ResilienceService.TOKEN) private r: ResilienceService) {}

  // 인라인 재시도 — 데코레이터 없이.
  @Get("/user/:id")
  async getUser(c: any) {
    return this.r.retry(
      () => userApi.fetch(c.req.param("id")),
      { attempts: 3, backoff: "exponential-jitter" },
    );
  }
}
```

`ResilienceService` (DI singleton) 가 레지스트리다. 회로와 벌크헤드는
`getOrCreate(name, config)`로 필요 시 생성되며 앱 전체에 공유된다
— 같은 "stripe" 회로는 Stripe를 호출하는 모든 코드 경로를
커버한다.

## 아키텍처

```
┌────────────────────────────────────────────────────────────┐
│  ResilienceModule.forRoot({ retry, circuit, bulkhead })    │
│                                                             │
│  ┌─────────────────┐    기본 설정 (호출별 override 가능)     │
│  │ ResilienceSvc  │◀───── retry / circuit / bulkhead config   │
│  │  .getOrCreate  │                                          │
│  │  Circuit(name)  │   rolling window, threshold, half-open  │
│  │  Bulkhead(name) │   maxConcurrent, maxQueued, FIFO        │
│  │  retry(fn,cfg) │   constant/linear/exp/exp-jitter 백오프│
│  └─────────────────┘                                          │
│                                                             │
│  세 가지 조합 패턴:                                          │
│   1. 인라인 — r.retry(() => ...), cb.execute(() => ...)    │
│   2. 메소드 데코레이터 — @Retry / @CircuitBreaker /         │
│      @Bulkhead / @Resilient                                 │
│   3. 공유 명명 레지스트리 — 모든 코드 경로가 같은           │
│      `r.getOrCreateCircuit("stripe")` 사용                   │
└────────────────────────────────────────────────────────────┘
```

## 언제 무엇을 쓰나

| 프리미티브 | 사용 시기 | 사용하지 말 시기 |
|-----------|------------|-------------------|
| **재시도** | 의존성이 **잠깐 깜빡일 것으로 예상** (네트워크 blip, rate limit). | 실패가 영구적일 때 (다운스트림 다운). |
| **서킷 브레이커** | 의존성이 **장기간 실패할 것으로 예상** (outage, 배포). | 단일 호출, 후속 호출 없음. |
| **벌크헤드** | 의존성이 **느리고 용량 제한적** (외부 API, DB pool). | 의존성이 로컬이고 빠를 때. |

이들은 조합된다. 고전적인 "바깥 → 안" 패턴:

```
Bulkhead (동시성 캡)
  └─> Circuit Breaker (outage 시 fail-fast)
        └─> Retry (일시적 blip 처리)
```

`@Resilient({ retry, circuit, bulkhead })` 가 그 순서대로 세 가지를 모두 적용한다.

## Retry

```ts
import { retry } from "@kabyeon/nexusjs/resilience";

const user = await retry(
  () => fetch("https://api.example.com/users/42").then(r => r.json()),
  {
    attempts: 3,                  // 총 시도 횟수 (첫 호출 포함)
    initialDelay: 100,            // 첫 백오프
    maxDelay: 30_000,             // 상한
    backoff: "exponential-jitter", // 전략
    retryOn: (err) => isTransient(err), // 필터
    onRetry: (err, attempt, delay) => log.warn({ err, attempt, delay }),
    timeout: 60_000,              // 전체 budget
  },
);
```

`retry`에 전달되는 함수는 `AbortSignal`을 받는다. I/O 호출에서 이를
honor해서 overall `timeout`이 실제로 발화되게 하라:

```ts
await retry((signal) => {
  return fetch(url, { signal }).then(r => r.json());
}, { attempts: 5, initialDelay: 200, timeout: 30_000 });
```

### 백오프 전략

| 전략 | 공식 | 사용 시기 |
|----------|---------|-------------|
| `constant` | `initialDelay` | 스로틀링, 실제 재시도 아님 |
| `linear` | `initialDelay * attempt` | 짧은 깜빡임 |
| `exponential` | `initialDelay * multiplier^(attempt-1)` | 클래식 지수 |
| `exponential-jitter` | `Math.random() * exponential` | thundering herd 방지 |

기본값: `multiplier = 2`, `maxDelay = 30_000` 인 `exponential-jitter`.

## Circuit Breaker

```ts
const cb = svc.getOrCreateCircuit("stripe", {
  threshold: 0.5,        // 50% 이상 실패율 시 open
  minCalls: 5,           // threshold 적용 전 최소 호출 수
  timeout: 30_000,       // 30s 대기 후 half-open 시험
  halfOpenAfter: 1,      // half-open에서 1번 시험
  window: 60_000,        // 실패율 rolling window
  isFailure: (err) => err.status >= 500, // 4xx는 실패로 카운트 안 함
  onStateChange: (from, to, name) => metrics.gauge(`circuit.${name}.state`, to),
});

try {
  const charge = await cb.execute(() => stripe.charge(amount));
} catch (e) {
  if (e instanceof CircuitOpenError) {
    // Stripe가 현재 다운된 것으로 간주됨. 재시도하지 말고 back off.
    return { ok: false, reason: "service_degraded" };
  }
  throw e;
}
```

상태 머신:

```
  closed  ── 실패율 ≥ threshold (minCalls 이상) ─▶  open
     ▲                                                       │
     │                                                       │ `timeout` ms 후
     │                                                       ▼
  closed ◀── 성공 ── half-open ── 실패 ──▶  open
     │          (halfOpenAfter 만큼의 시험)
     └──────── 성공 ──▶  closed
```

`open`은 즉시 `CircuitOpenError`로 reject. `timeout` ms 후의 다음 호출이
half-open 시험을 트리거; 성공하면 회로는 close.

## Bulkhead

```ts
const stripeBulkhead = svc.getOrCreateBulkhead("stripe", {
  maxConcurrent: 5,     // 동시 5 호출까지
  maxQueued: 100,       // 최대 100 대기
  rejectOnFull: false,  // 대기열에서 대기 (기본)
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

벌크헤드는 fair — 호출자는 FIFO 순서로 해제된다. `rejectOnFull: true`이면
대기열이 가득 찰 때 `BulkheadFullError`로 즉시 실패.

## `@Resilient` 데코레이터 (alpha)

retry + circuit + bulkhead를 한 번에 메소드에 감싸는 통합 데코레이터.
현재 metadata로만 제공됨 — decorator 레벨에서의 즉시 wrapping은 v0.8에서
다른 Bun stage-3-decorator 개선과 함께 예정.

```ts
@Resilient({
  retry: { attempts: 3, backoff: "exponential-jitter" },
  circuit: { threshold: 0.5, timeout: 30_000 },
  bulkhead: { maxConcurrent: 5 },
})
async callExternal() { ... }
```

의미: retry가 안쪽, circuit이 retry를, bulkhead가 circuit을 감쌈. 순서가
중요하다 — bulkhead가 바깥쪽이라는 것은 `rejectOnFull`이 회로가 open 되기
전에 발화한다는 의미.

## Service 레지스트리

`ResilienceService`는 DI singleton. 표준 접근 패턴은 `TOKEN`을
주입하고 `getOrCreateCircuit` / `getOrCreateBulkhead`를 호출하는 것.
여러 컨트롤러가 `getOrCreateCircuit("stripe")`를 호출하면 *같은* 회로를
받는다 — 한 경로의 flake가 다른 모든 경로를 보호한다.

```ts
class OrderService {
  constructor(@Inject(ResilienceService.TOKEN) private r: ResilienceService) {}
  async charge(order: Order) {
    const cb = this.r.getOrCreateCircuit("stripe", { threshold: 0.5 });
    return cb.execute(() => stripe.charge(order));
  }
}

class SubscriptionService {
  // 같은 회로, 같은 state — Stripe outage 하나가 OrderService와
  // SubscriptionService 모두의 회로를 open한다.
  constructor(@Inject(ResilienceService.TOKEN) private r: ResilienceService) {}
  async renew(sub: Subscription) {
    const cb = this.r.getOrCreateCircuit("stripe");
    return cb.execute(() => stripe.updateSubscription(sub));
  }
}
```

## 이번 릴리스에 포함되지 않은 것

- **Bulkhead 큐 추적.** 큐가 길 때 현재는 `BulkheadFullError`만 본다.
  미래 버전에서 `bulkhead.queue.waiting` Prometheus-style 메트릭을
  emit할 것이다.
- **Half-open chaos testing.** `forceOpen(name)` / `forceClose(name)`
  admin API가 v0.8에 예정.
- **Per-route HTTP 통합.** `@WithResilience({ retry, circuit })`
  Hono 미들웨어 변형이 로드맵에 있다.

## 참고

- [`../design/resilience.md`](../design/resilience.md) — 아키텍처 심층 문서.
- [`../../user-guide/testing-examples.md`](./testing-examples.md) —
  smoke-test runner; resilience는 example 33에서 사용됨.
- [AWS Architecture Blog — "Timeouts, retries, and backoff with jitter"](https://aws.amazon.com/builders-library/timeouts-retries-and-backoff-with-jitter/).
