# Resilience · `@nexusts/resilience`

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
  ResilienceModule, ResilienceAdminModule, ResilienceService, retry,
  CircuitBreaker, Bulkhead, CircuitOpenError, BulkheadFullError,
} from "@nexusts/resilience";

@Module({
  imports: [ResilienceModule.forRoot()],
  controllers: [AppController],
})
class AppModule {}

class AppController {
  @Inject(ResilienceService.TOKEN) declare r: ResilienceService;

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
import { retry } from "@nexusts/resilience";

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

## `@Resilient` 데코레이터

retry + circuit + bulkhead를 한 번에 메소드에 감싸는 통합 데코레이터.
`ResilienceModule.forRoot()`가 임포트되면 컨트롤러 마운트 시 자동으로 래핑됩니다.

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

## Eager 자동 래핑

`ResilienceModule.forRoot()`를 임포트하면 프레임워크가 컨트롤러를 마운트할
때 `@Retry` / `@CircuitBreaker` / `@Bulkhead` / `@Resilient`가 붙은 메서드를
**자동으로** 래핑합니다. 별도의 `svc.retry(...)` / `cb.execute(...)` 호출이
필요 없습니다.

```ts
import { Retry, CircuitBreaker, Bulkhead, Resilient } from "@nexusts/resilience";

@Controller("/payments")
class PaymentController {
  @Post("/charge")
  @Resilient({
    retry:    { attempts: 3, backoff: "exponential-jitter" },
    circuit:  { threshold: 0.5, timeout: 30_000 },
    bulkhead: { maxConcurrent: 5 },
  })
  async charge(ctx: Context) {
    const body = await ctx.req.json() as ChargeDto;
    // ← 자동으로 bulkhead → circuit → retry 순으로 래핑됨
    return stripe.charge(body);
  }

  @Get("/history")
  @Retry({ attempts: 2, initialDelay: 200 })
  async history() {
    return db.query("SELECT ...");
  }

  @Get("/health")
  @CircuitBreaker({ threshold: 0.5 })
  async health() {
    return externalApi.ping();
  }
}
```

### 동작 원리

1. `ResilienceModule.forRoot()` 호출 시 core 라우터에 컨트롤러-메서드 훅을 등록합니다.
2. 각 컨트롤러가 마운트될 때 훅이 메서드별로 resilience 메타데이터를 확인합니다.
3. 메타데이터가 있으면 `makeResilientWrapper`로 래핑한 함수로 교체합니다.
4. 래핑된 메서드는 요청마다 `ResilienceService`를 통해 retry / circuit / bulkhead를
   적용합니다.

### 래핑 순서 (바깥 → 안)

```
bulkhead → circuit → retry → 원래 메서드
```

`rejectOnFull`이 circuit이 open되기 전에 발화하고, retry는 회로를 통과한
호출에만 적용됩니다.

### 주의사항

- `ResilienceModule.forRoot()`를 임포트하지 않으면 데코레이터는 메타데이터만
  저장하고 래핑이 적용되지 않습니다.
- `@Retry` / `@CircuitBreaker` / `@Bulkhead`는 독립적으로 사용하거나
  `@Resilient`로 한꺼번에 사용할 수 있습니다.
- 회로 이름은 메서드 이름에서 자동으로 가져옵니다 (예: `charge`, `history`).

## Service 레지스트리

`ResilienceService`는 DI singleton. 표준 접근 패턴은 `TOKEN`을
주입하고 `getOrCreateCircuit` / `getOrCreateBulkhead`를 호출하는 것.
여러 컨트롤러가 `getOrCreateCircuit("stripe")`를 호출하면 *같은* 회로를
받는다 — 한 경로의 flake가 다른 모든 경로를 보호한다.

```ts
class OrderService {
  @Inject(ResilienceService.TOKEN) declare r: ResilienceService;
  async charge(order: Order) {
    const cb = this.r.getOrCreateCircuit("stripe", { threshold: 0.5 });
    return cb.execute(() => stripe.charge(order));
  }
}

class SubscriptionService {
  // 같은 회로, 같은 state — Stripe outage 하나가 OrderService와
  // SubscriptionService 모두의 회로를 open한다.
  @Inject(ResilienceService.TOKEN) declare r: ResilienceService;
  async renew(sub: Subscription) {
    const cb = this.r.getOrCreateCircuit("stripe");
    return cb.execute(() => stripe.updateSubscription(sub));
  }
}
```

## Admin API

실행 중인 회로와 벌크헤드를 검사하고 수동으로 제어합니다.

### 전체 회로 목록

```ts
const circuits = svc.listCircuits();
// → [
//     { name: "stripe",  state: "open",   metrics: { failures: 8, totalCalls: 10, ... } },
//     { name: "github", state: "closed", metrics: { failures: 0, totalCalls: 42, ... } },
//   ]
```

각 항목에는 `CircuitMetrics` 스냅샷이 포함됩니다:

| 필드 | 타입 | 설명 |
|------|------|------|
| `name` | `string` | 회로 이름 |
| `state` | `"closed"` \| `"open"` \| `"half-open"` | 현재 상태 |
| `totalCalls` | `number` | 롤링 윈도우 내 호출 수 |
| `failures` | `number` | 실패한 호출 수 |
| `successes` | `number` | 성공한 호출 수 |
| `failureRatio` | `number` | `failures / totalCalls` (0..1) |
| `openedAt` | `number` | 마지막 open 시각 (0 = 없음) |
| `msUntilHalfOpen` | `number` | open → half-open 전환까지 ms |

### 전체 벌크헤드 목록

```ts
const bulkheads = svc.listBulkheads();
// → [
//     { name: "stripe", inFlight: 2, queued: 0, maxConcurrent: 5 },
//   ]
```

### 수동 회로 제어

```ts
const cb = svc.getOrCreateCircuit("stripe", { threshold: 0.5 });

// 메트릭 스냅샷
const m = cb.metrics();
console.log(`State: ${m.state}, failures: ${m.failures}/${m.totalCalls}`);

// 강제 open (알려진 장애 발생 시)
cb.forceOpen();

// 강제 close (업스트림 복구 확인 후)
cb.forceClose();

// 초기 closed 상태로 리셋 (히스토리 삭제)
cb.reset();
```

## HTTP Admin 엔드포인트

`ResilienceAdminModule`을 임포트하면 회로 차단기와 벌크헤드를 HTTP로
검사·제어할 수 있습니다. 프로덕션 환경에서는 이 모듈을 별도 인증 미들웨어로
보호하세요.

```ts
import { ResilienceModule, ResilienceAdminModule } from "@nexusts/resilience";

@Module({
  imports: [
    ResilienceModule.forRoot({ threshold: 0.5 }),
    ResilienceAdminModule.forRoot({ prefix: "/resilience" }),
  ],
})
class AppModule {}
```

### 엔드포인트 목록

| 메서드 | 경로 | 설명 |
|--------|------|------|
| `GET` | `{prefix}/circuits` | 등록된 모든 회로와 현재 메트릭 반환 |
| `GET` | `{prefix}/bulkheads` | 등록된 모든 벌크헤드와 현재 통계 반환 |
| `POST` | `{prefix}/circuits/:name/force-open` | 회로를 강제 open (요청 즉시 차단) |
| `POST` | `{prefix}/circuits/:name/force-close` | 회로를 강제 close (요청 통과) |
| `POST` | `{prefix}/circuits/:name/reset` | 회로를 초기 closed 상태로 리셋 (히스토리 삭제) |

`prefix`의 기본값은 `"/resilience"`입니다.

### 예시

```bash
# 모든 회로 상태 확인
curl http://localhost:3000/resilience/circuits
# [
#   { "name": "stripe", "state": "open", "metrics": { "failures": 8, ... } },
#   { "name": "github", "state": "closed", "metrics": { "failures": 0, ... } }
# ]

# stripe 회로 강제 close (복구 확인 후)
curl -X POST http://localhost:3000/resilience/circuits/stripe/force-close
# { "name": "stripe", "state": "closed" }

# stripe 회로 리셋 (히스토리 삭제)
curl -X POST http://localhost:3000/resilience/circuits/stripe/reset
# { "name": "stripe", "state": "closed" }
```

존재하지 않는 회로 이름을 지정하면 `404`를 반환합니다.

```json
{ "error": "Circuit \"unknown\" not found" }
```

## Cross-pod 서킷 브레이커 (v0.8)

기본 `CircuitBreaker`는 단일 프로세스 내 메모리 상태만 관리한다. 멀티 인스턴스(pod) 환경에서는 pod A가 서킷을 열어도 pod B가 여전히 실패 요청을 시도할 수 있다.

`ResilienceStore`를 통해 서킷 상태를 pod 간에 공유할 수 있다.

### MemoryResilienceStore (기본값, 단일 pod)

```ts
ResilienceModule.forRoot({
  retry: { attempts: 3 },
  circuit: { threshold: 0.5 },
  // store: 'memory' — 기본값, 명시 생략 가능
})
```

### RedisResilienceStore (멀티 pod 권장)

```ts
import { createRedisClient }     from '@nexusts/redis';
import { RedisResilienceStore }  from '@nexusts/resilience';

const redisClient = await createRedisClient({ url: process.env.REDIS_URL });
const store = new RedisResilienceStore(redisClient, { keyPrefix: 'myapp:cb:' });

ResilienceModule.forRoot({
  circuit:         { threshold: 0.5, timeout: 30_000 },
  store,           // RedisResilienceStore 인스턴스 직접 전달
  syncIntervalMs:  5_000,  // 5초마다 원격 상태 폴링 (기본값)
})
```

### DrizzleResilienceStore (DB 기반)

```ts
import { DrizzleResilienceStore } from '@nexusts/resilience';

const store = new DrizzleResilienceStore(drizzleService);
// nexus_circuit_state 테이블을 자동 생성함 (IF NOT EXISTS)

ResilienceModule.forRoot({ circuit: { threshold: 0.5 }, store })
```

### 동작 방식

| 우선순위 | 동작 |
| -------- | ---- |
| 상태 전이 시 | `transition()` 직후 스토어에 스냅샷 저장 (fire-and-forget) |
| `execute()` 호출 시 | `syncIntervalMs` 경과 후 스토어에서 스냅샷 읽기 |
| 충돌 해결 | `updatedAt` 타임스탬프 기준 — 더 최신이면 덮어씀 |
| 스토어 오류 | 로컬 상태로 폴백 — 절대 예외 전파 안 함 |

`syncIntervalMs = 0`으로 설정하면 매 `execute()` 마다 폴링한다(테스트 용도).

### 커스텀 백엔드

`ResilienceStore` 인터페이스를 구현해 임의의 백엔드를 연결할 수 있다:

```ts
import type { ResilienceStore, CircuitSnapshot } from '@nexusts/resilience';

class EtcdResilienceStore implements ResilienceStore {
  async getSnapshot(name: string): Promise<CircuitSnapshot | null> { ... }
  async saveSnapshot(name: string, snap: CircuitSnapshot): Promise<void> { ... }
}
```

---

## 이번 릴리스에 포함되지 않은 것

- **Bulkhead 큐 추적.** 큐가 길 때 현재는 `BulkheadFullError`만 본다.
  미래 버전에서 `bulkhead.queue.waiting` Prometheus-style 메트릭을
  emit할 것이다.
- **Per-route HTTP 통합.** `@WithResilience({ retry, circuit })`
  Hono 미들웨어 변형이 로드맵에 있다.

## 참고

- [`../design/resilience.md`](../design/resilience.md) — 아키텍처 심층 문서.
- [`../../user-guide/testing-examples.md`](./testing-examples.md) —
  smoke-test runner; resilience는 example 33에서 사용됨.
- [AWS Architecture Blog — "Timeouts, retries, and backoff with jitter"](https://aws.amazon.com/builders-library/timeouts-retries-and-backoff-with-jitter/).
