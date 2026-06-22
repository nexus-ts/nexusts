# Resilience 모듈 — 디자인

> English version: [`resilience.md`](./resilience.md)

이 문서는 `@kabyeon/nexusjs/resilience`의 아키텍처를 설명한다:
왜 세 가지 프리미티브를 한 모듈에, 서킷 브레이커 상태 머신의 동작
방식, 데코레이터가 metadata-only인 이유, 프레임워크 통합 형태.

## 목표

1. **한 모듈, 세 가지 프리미티브.** Retry, circuit breaker, bulkhead는
   개념적으로 한 가지 feature ("resilience")다. 같은 DI singleton,
   같은 config defaults, 같은 메소드별 조합 패턴을 공유한다.
   사용자가 세 패키지를 import할 필요 없어야 한다.
2. **새로운 런타임 의존성 없음.** Resilience는 순수 TypeScript.
   `cockatiel`도, `opossum`도, `cockatoo`도 없다. 각 프리미티브는
   ~150 LOC 정도로 작아 유지보수가 쉽다.
3. **데코레이터와 인라인 모두 조합 가능.** `@Retry` 등이 편리;
   `svc.retry(() => ...)`와 `svc.getOrCreateCircuit("stripe")`는 명시적.
   둘 다 동작하고 state를 공유해야 한다.
4. **앱 전체에서 state 공유.** "stripe" 회로는 모든 곳에서 같은
   회로여야 한다 — 그렇지 않으면 한 flake 경로가 다른 경로를 보호하지
   못한다. DI singleton + name 기반 레지스트리가 이를 자동으로 만든다.

## 왜 세 가지 프리미티브를 한 모듈에

각 프리미티브는 다른 문제를 풀는다:

- **Retry** 는 **일시적** 실패를 다룬다 (네트워크 blip, rate limit,
  leader election).
- **Circuit Breaker** 는 **지속적** 실패를 다룬다 (outage, 배포,
  overload). 폭풍 중에 재시도하지 말고 — back off하고 upstream이
  회복되게 둔다.
- **Bulkhead** 는 **용량 경합** 을 다룬다 (느린 upstream, 공유 connection
  pool). 한 느린 의존성이 앱 나머지를 굶기지 않게 in-flight 호출 수를
  제한한다.

전형적인 "외부 호출" 스택:

```
Bulkhead (≤ 10 concurrent)
  └─> Circuit Breaker (outage 시 fail-fast)
        └─> Retry (일시적 blip 처리)
```

한 모듈에 세 가지를 모두 넣는 의미:

- 한 DI singleton (`ResilienceService`)에 한 `defaults` 테이블.
- 세 가지를 모두 결합하는 한 데코레이터 (`@Resilient`).
- user guide에 한 항목, design doc에 한 섹션.

## Retry 구현

`retry()`는 세 가지 중 가장 단순하다. 알고리즘:

```ts
for (let attempt = 1; attempt <= cfg.attempts; attempt++) {
  try {
    return await fn(ac.signal);
  } catch (err) {
    lastErr = err;
    if (attempt >= attempts) break;
    if (!retryOn(err, attempt)) break;
    const delay = computeBackoff(attempt, cfg);
    onRetry?.(err, attempt, delay);
    await sleep(delay, ac.signal);
  }
}
throw lastErr;
```

세 가지 설계 선택:

1. **함수 시그니처가 `AbortSignal`을 받는다.** 사용자가 signal을
   I/O 호출에 전달한다 (예: `fetch(url, { signal })`). 이것이
   `overallTimeout`이 실제로 발화할 수 있는 유일한 방법 — signal을
   무시하는 third-party promise는 취소할 수 없다.

2. **기본 백오프는 `exponential-jitter`.** 순수 exponential은
   thundering herd를 일으킨다: 1000 클라이언트가 같은 의존성을
   hit하면 1000 모두 동시에 재시도. Jitter (`[0, base)` 랜덤) 가
   재시도를 분산시킨다.

3. **`retryOn`은 함수, 단순한 에러 클래스 리스트가 아니다.** 사용자가
   5xx에서는 재시도하지만 4xx에서는 안 하거나, 요청 body가 idempotent
   일 때만 재시도하고 싶을 수 있다. 함수가 생성자 리스트보다 유연하다.

### 백오프 전략

```ts
function computeBackoff(attempt, cfg) {
  switch (cfg.backoff) {
    case "constant":         return cfg.initialDelay;
    case "linear":           return cfg.initialDelay * attempt;
    case "exponential":      return cfg.initialDelay * Math.pow(cfg.multiplier, attempt - 1);
    case "exponential-jitter": return Math.random() * cfg.initialDelay * Math.pow(cfg.multiplier, attempt - 1);
  }
  return Math.min(raw, cfg.maxDelay);
}
```

`Math.random()` jitter는 in-process 백오프에 충분하다 — 암호학적
랜덤이 필요하지 않다. 진짜 분포가 필요하면 `crypto.getRandomValues()`.

## Circuit Breaker 상태 머신

```
  closed  ── 실패율 ≥ threshold (minCalls 이상) ─▶  open
     ▲                                                       │
     │                                                       │ `timeout` ms 후
     │                                                       ▼
  closed ◀── 성공 ── half-open ── 실패 ──▶  open
     │          (halfOpenAfter 만큼의 시험)
     └──────── 성공 ──▶  closed
```

### 왜 "rolling window" 인가, "last N calls" 가 아닌가

두 가지 흔한 설계:

- **Counter** (`failures ≥ N`): 단순하지만 load 변화를 반영 안 함.
  10 호출 중 1 실패가 카운터 스타일 브레이커를 트리거; 10000 호출
  중 1 실패도 마찬가지. 너무 거침.
- **Last N calls** (예: last 10): load에 적응하지만 window가
  추론하기 어려움. last 10에서 50% 실패율과 last 1000에서 50%
  실패율은 매우 다름.

프레임워크는 **rolling time window** (`window` ms)를 사용한다. `window` ms
이전의 호출은 count에서 제외. 이게 load에 적응하면서 ("긴 window
= 더 많은 호출 고려") "last N"의 불연속성이 없다.

### 왜 두 상태가 아니라 세 상태인가

두 상태 (open / closed) 는 매우 단순한 경우에 동작. 세 상태는 probe를
추가한다: 회로가 한 동안 open 이었다면, breaker가 의존성이 회복됐는지
보기 위해 한 호출을 통과시킨다. 이건 프로덕션에 필수 — half-open
없이는 회로를 닫기 위해 외부 신호를 기다려야 한다.

`halfOpenAfter` 파라미터가 "한 호출 통과" 노브. 1로 설정하는 게 가장
보수적; 5는 더 공격적 (병렬 probe).

### 왜 `onStateChange` / `onCall` 이 config 가 아니라 instance 에 settable 인가

회로가 생성된 후 등록 시점에 사용자가 wire 할 수 있어야 하므로.
`getOrCreateCircuit` 팩토리는 라이브 `CircuitBreaker` 인스턴스를
반환하고, 호출자가 hook을 attach 할 수 있다.

```ts
const cb = svc.getOrCreateCircuit("stripe");
cb._onStateChange = (from, to) => metrics.gauge("stripe.circuit", to);
cb._onCall = (name, ok, latency) => histogram.record(latency, { ok });
```

이건 private-API 영역 (underscore 접두사). public hook setter로
노출할 수도 있지만 v0.7에서는 underscore로 충분 — 대부분의 사용자는
config 필드로 노출된 `onStateChange` 옵션을 통해 메트릭을 원한다.

## Bulkhead 설계

Bulkhead는 FIFO 큐를 가진 동시성 제한기. `bulkhead.ts` 구현:

- `inFlight: number` — 현재 in-flight 수.
- `queue: SlotToken[]` — waiters의 FIFO. 각 토큰은 `acquire()` 와
  `cancel()` 을 가짐.
- `drain()` — 슬롯이 열릴 때마다 호출. 다음 waiter 를 shift,
  `acquired = true` 마크, `acquire()` promise를 resolve. `enqueue()`
  안의 async wrapper가 사용자 함수를 호출하고, 함수가 리턴할 때까지
  슬롯을 보유하다가 `drain()` 다시 호출.

```ts
async execute(fn) {
  if (this.inFlight < this.config.maxConcurrent) {
    this.inFlight += 1;
    try { return await fn(); }
    finally { this.inFlight -= 1; this.drain(); }
  }
  if (this.queue.length >= this.config.maxQueued) {
    throw new BulkheadFullError(this.name);
  }
  // …enqueue, 슬롯 대기, 실행, 해제…
}
```

핵심 트릭: 슬롯이 열릴 때 `drain()` 안에서 caller의 함수를 `await`하지
않는다 — 토큰을 resolve하고, caller의 async wrapper가 토큰을 await 한
다음 함수를 실행하고, `drain()` 다시 호출. 이렇게 하면 `drain()` 자체가
동기로 유지되어 deadlock이 방지된다.

### 왜 FIFO지 LIFO 가 아닌가

FIFO가 가장 공평하다. LIFO (최신 우선) 는 큐가 길 때 오래된 caller를
굶긴다. LIFO는 가끔 단명시 connection에 사용되지만 (그래서 connection
pool이 빠르게 빠짐) generic bulkhead에는 FIFO가 올바른 기본값.

## 데코레이터 API: metadata-only

`@Retry` / `@CircuitBreaker` / `@Bulkhead` / `@Resilient` 데코레이터는
**metadata-only** 다. 옵션을 `reflect-metadata`에 쓰고 그게 끝:

```ts
function makeMethodDecorator<TConfig>(key, extract) {
  return (config: TConfig): MethodDecorator => {
    return (_target, propertyKey) => {
      Reflect.defineMetadata(key, extract(config), _target, propertyKey);
    };
  };
}
```

`descriptor.value`를 건드리지 않는다. Bun 1.3의 기본 stage-3 decorator
모드에서 descriptor가 전달되지 않기 때문 (데코레이터가 `(target, key)` 만
받고 호출됨). 건드릴 경우 crash하거나 (Bun의 transpiler가 메소드를
최적화하는 경우) 잘못 wrap.

`applyResilience()` 함수가 metadata를 읽고 메소드를 wrap. 사용자가
원하면 자신의 프레임워크 hook에서 호출 가능:

```ts
import { applyResilience } from "@kabyeon/nexusjs/resilience";

class MyController {
  @Retry({ attempts: 3 })
  // …

  // 또는 수동 wrap:
  constructor() {
    this.myMethod = applyResilience(
      MyController.prototype, "myMethod",
      this.myMethod.bind(this),
      svc,
    ).value as Function;
  }
}
```

미래 버전에서는 모든 controller에서 자동으로 `applyResilience`를
호출하는 framework-side hook을 추가할 것이다. 현재는 인라인 패턴
(`svc.retry(() => ...)`)이 권장된다 — route handler에서 resilience
레이어가 보이게 만든다.

### `setResilienceService` 글로벌

데코레이터는 call time에 `ResilienceService` 인스턴스에 접근해야
하지만, 데코레이터는 DI 컨테이너가 빌드되기 전에 적용된다. 우리는
module-level singleton으로 해결:

```ts
let _resilienceService: ResilienceService | null = null;
export function setResilienceService(svc) { _resilienceService = svc; }
```

`ResilienceModule.forRoot()`가 팩토리에서 `setResilienceService(svc)`를
호출. 즉시 decorator 경로 (`decorators/index.ts`)가 call time에
`_resilienceService` 를 읽음.

이건 "service locator" 패턴으로, 일반적으로 DI에서 안티패턴이다.
우리가 쓰는 이유는 대안 (모든 데코레이터에 service 전달) 이 비현실적
이기 때문. 패턴은 docs에 명시되어 있다.

## Service 레지스트리

`ResilienceService`는 named circuits 와 bulkheads의 레지스트리:

```ts
private circuits = new Map<string, CircuitBreaker>();
private bulkheads = new Map<string, Bulkhead>();

getOrCreateCircuit(name, config) {
  let cb = this.circuits.get(name);
  if (!cb) {
    cb = new CircuitBreaker(name, { ...this.defaults.circuit, ...config });
    this.circuits.set(name, cb);
  }
  return cb;
}
```

맵 lookup은 O(1)이고 `getOrCreate` 패턴은 JavaScript 단일 스레드 이벤트
루프에서 thread-safe. 락 필요 없음.

맵은 **요청 간에 영속되지 않음** — 모든 서버 재시작은 빈 레지스트리로
시작. 멀티 pod 배포에서는 breaker가 공유되지 않지만, per-pod threshold가
여전히 개별 pod-level 폭풍을 보호. (Cross-pod 회로는 v0.8+ 로드맵
— 공유 store 필요.)

## 포함하지 않은 것들

- **Token-bucket rate limiting.** 이건 `@kabyeon/nexusjs/limiter`.
  resilience에 합치는 것도 고려했지만, rate limiting은 모양이
  다르고 (요청 budget, 실패 감지가 아님) 다른 storage backend
  (Redis, Drizzle) 가 있다.
- **Health checks.** 이건 `@kabyeon/nexusjs/health`.
- **Adaptive retry.** 일부 라이브러리 (Cockatiel) 는
  "upstream latency에 비례한 backoff"를 지원. 우리는 안 한다 —
  복잡하고 단순한 `exponential-jitter`가 95% 사용 사례에 충분.

## Future work

- **Cross-pod 회로.** backing store (Redis, Drizzle) 로 state 공유.
  `CircuitBreaker` API는 동일하게 유지.
- **Adaptive thresholds.** 정적 config 값이 아닌 upstream의 관찰된
  성공률에 따라 `threshold` 조정.
- **Bulkhead 큐 추적.** `bulkhead.queue.waiting`,
  `bulkhead.queue.max_wait_ms` Prometheus-style 메트릭 emit.
- **Per-route HTTP 미들웨어.** Hono route에 붙는
  `@WithResilience({ retry, circuit })`, 메소드 레벨 데코레이터와
  별개.

## 참고

- [`../user-guide/resilience.md`](../user-guide/resilience.md) —
  사용자 가이드.
- [`../analysis/nestjs-comparison.md`](../analysis/nestjs-comparison.md)
  — resilience 격차 (이제 해소됨).
- [AWS Architecture Blog — "Timeouts, retries, and backoff with jitter"](https://aws.amazon.com/builders-library/timeouts-retries-and-backoff-with-jitter/).
