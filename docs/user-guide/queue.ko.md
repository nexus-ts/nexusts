# Queue · BullMQ, Cloudflare Queues

> English version: [`queue.md`](./queue.md)

NexusTS는 `@nexusts/queue` 모듈 아래 두 가지 프로덕션 준비 백엔드를 래핑한다.

- **BullMQ** — Redis 기반, 장기 실행 Bun 서버용.
- **Cloudflare Queues** — Workers 네이티브, 엣지 친화적.
- **In-memory** — 테스트 및 단일 인스턴스 개발용.

두 백엔드는 공통 `QueueBackend` 인터페이스를 공유하므로, 애플리케이션 코드는 `QueueService`와만 통신하고 특정 백엔드를 직접 다루지 않는다.

queue 모듈은 **`@nexusts/core`와 분리**되어 있으며 자체 번들 진입점으로 추가된다.

---

## 1. 설치

```bash
bun add @nexusts/queue bullmq ioredis
# 백엔드에 따라 필요한 것만 설치:
#   bun add bullmq ioredis     # BullMQ 백엔드용
#   추가 의존성 없음            # Cloudflare 백엔드용 (Workers 런타임 제공)
#   추가 의존성 없음            # 인메모리 백엔드용 (테스트)
```

---

## 2. 빠른 시작

```ts
// app/app.module.ts
import { Module } from '@nexusts/core';
import { QueueModule } from '@nexusts/queue';

@Module({
  imports: [
    QueueModule.forRoot({
      backend: 'bullmq',
      bullmq: {
        connection: process.env.REDIS_URL ?? 'redis://localhost:6379',
        prefix: 'nexusts',
      },
      defaults: { attempts: 3, backoff: { type: 'exponential', delayMs: 1000 } },
    }),
  ],
})
export class AppModule {}
```

컨트롤러나 서비스에서 enqueue:

```ts
import { Inject } from '@nexusts/core';
import { QueueService } from '@nexusts/queue';
import { Controller, Post, Body } from '@nexusts/core';

@Controller('/signup')
class SignupController {
  @Inject(QueueService.TOKEN) declare queue: QueueService;

  @Post('/')
  async signup(ctx: Context) {
    const body = await ctx.req.json() as { email: string };
    await this.queue.add('send-welcome-email', { email: body.email });
    return { status: 'queued' };
  }
}
```

워커 등록:

```ts
import { Inject, Injectable } from '@nexusts/core';
import { QueueService, OnQueueReady } from '@nexusts/queue';

@Injectable()
class EmailWorker {
  @Inject(QueueService.TOKEN) declare queue: QueueService;

  @OnQueueReady()
  async register() {
    await this.queue.process('send-welcome-email', async (data, ctx) => {
      ctx.prefix; // → "[queue:send-welcome-email]"
      // ... 이메일 전송
      return { status: 'completed' };
    });
  }
}
```

연결:

```ts
@Module({
  providers: [EmailWorker],
})
class WorkerModule {}
```

---

## 3. 두 백엔드

### BullMQ

프로덕션 준비, Redis 기반. 용도:

- 장기 실행 Bun 서버.
- 지연 실행, 재시도, rate limiting이 필요한 작업.
- Redis 클러스터를 공유하는 다중 인스턴스 배포.

```ts
QueueModule.forRoot({
  backend: 'bullmq',
  bullmq: {
    connection: 'redis://localhost:6379',
    // 또는: { host: '...', port: 6379, password: '...' }
    prefix: 'nexusts',
  },
  defaults: {
    attempts: 5,
    backoff: { type: 'exponential', delayMs: 1000 },
    removeOnComplete: 100,
    removeOnFail: 1000,
  },
});
```

### Cloudflare Queues

Workers 네이티브. 용도:

- 엣지 배포 (Cloudflare Workers).
- 인프라가 없는 앱 (관리할 Redis 없음).
- 다른 Workers 기능과의 긴밀한 통합 (Durable Objects, Cron Triggers).

```ts
QueueModule.forRoot({
  backend: 'cloudflare',
  cloudflare: {
    bindingName: 'MY_QUEUE',
    queueName: 'my-queue',
  },
});
```

Worker 진입점이 Queue 바인딩을 필요로 한다.

```toml
# wrangler.toml
[[queues.producers]]
binding = "MY_QUEUE"
queue = "my-queue"

[[queues.consumers]]
queue = "my-queue"
max_batch_size = 10
max_retries = 3
```

```ts
// app/worker.ts
import { Application } from '@nexusts/core';
import { QueueService, QueueModule } from '@nexusts/queue';

const AppModule = QueueModule.forRoot({
  backend: 'cloudflare',
  cloudflare: { bindingName: 'MY_QUEUE' },
});

const app = new Application(AppModule);
app.container.resolve(QueueService);

export default {
  fetch: app.fetch,

  // `queue` 핸들러는 등록된 워커에 각 메시지를 디스패치한다.
  async queue(batch, env, ctx) {
    const svc = app.container.resolve(QueueService);
    const backend = svc.getCloudflareBackend();
    if (backend) backend.bind(env);
    // 메시지 디스패치 구동.
    for (const message of batch.messages) {
      message.ack();
    }
  },
};
```

### 인메모리 (테스트)

Redis나 Workers 런타임 없이 — `vitest`와 Redis 설정 전 `bunx nx dev` 용:

```ts
QueueModule.forRoot({ backend: 'memory' });
```

인메모리 백엔드는 100ms마다 틱하며 테스트에서 완전히 await 가능하다.

---

## 4. Job 라이프사이클

```
add(name, data)
  │
  ▼
[ queue ] ─────────►  process(name, handler)
                       │
                       ▼
              ┌──────────────────┐
              │ handler(data,ctx)│
              └──────────────────┘
                       │
                       ▼
        ┌──────────────┴──────────────┐
        │                             │
   { status: 'completed' }      { status: 'failed' }
        │                             │
        ▼                             ▼
    큐에서 제거              재시도 (`attempts`까지)
                                      │
                                      ▼
                              { status: 'failed', willRetry: false }
                                      │
                                      ▼
                                 dead-lettered
```

핸들러는 다음을 반환할 수 있다:

```ts
{ status: 'completed', returnvalue?: T }     // 성공
{ status: 'failed', error: Error, willRetry: boolean }  // 실패
{ status: 'retry', reason?: string, delaySeconds?: number }  // 명시적 재시도
```

평범한 throw된 에러는 설정된 재시도 정책으로 실패 처리된다.

---

## 5. `@OnQueueReady` 라이프사이클 훅

워커가 부팅 시 자체 등록:

```ts
@Injectable()
class EmailWorker {
  @Inject(QueueService.TOKEN) declare queue: QueueService;

  @OnQueueReady()
  async register() {
    await this.queue.process('send-welcome-email', this.handle);
  }

  handle = async (data) => { ... };
}
```

`invokeQueueReadyHooks(instance)`는 인스턴스의 모든 `@OnQueueReady` 메서드를 실행한다. 부트스트랩 헬퍼와 페어링:

```ts
// app/main.ts
const app = new Application(AppModule);
await app.container.resolve(QueueService).start();

// 워커 인스턴스들의 모든 @OnQueueReady 훅 실행.
for (const worker of [...app.container.list()]) {
  await invokeQueueReadyHooks(/* 인스턴스 가져오기 */);
}
```

향후 릴리스에서는 `Application` 라이프사이클을 통해 자동으로 처리된다.

---

## 6. 이벤트

```ts
const unsub = queue.on((event) => {
  switch (event.kind) {
    case 'job:added':     // job이 디스패치되기 전
    case 'job:active':    // 워커가 픽업함
    case 'job:completed': // 성공
    case 'job:failed':    // 에러 (willRetry는 재시도 여부)
    case 'worker:started': // process() 성공
    case 'worker:stopped': // close() 호출됨
  }
});
```

로깅, 메트릭, NexusTS 이벤트 시스템 연결에 유용 (v0.2).

---

## 7. 동시성, rate limiting, locking

```ts
await queue.process('resize-image', this.handle, {
  concurrency: 5,            // 동시에 5개 진행
  limiter: {                  // 토큰 버킷 rate limit
    max: 10,
    durationMs: 1000,         // 초당 10개
  },
  lockDurationMs: 30000,      // 재큐 전에 최대 30초 lock 유지
});
```

Cloudflare Queues는 자체 동시성/배칭 설정을 `wrangler.toml`(`max_batch_size`, `max_retries`)에 가지며, 프로세스별 옵션보다 우선한다.

---

## 8. 지연 작업

```ts
await queue.add('reminder', { userId: 42 }, { delaySeconds: 60 * 60 });
```

Cloudflare는 최대 24시간까지 지원(`delaySeconds ≤ 86400`). BullMQ는 고정 상한이 없다.

---

## 9. Idempotency

`jobId`를 전달하여 중복 제거:

```ts
await queue.add(
  'charge-customer',
  { customerId, amount },
  { jobId: `charge:${customerId}:${requestId}` },
);
```

같은 `jobId`가 두 번 enqueue되면 두 번째 `add()`는 no-op (BullMQ). Cloudflare에는 해당 기능이 없으므로 워커 측에서 중복 제거한다.

---

## 10. CLI: `nx make:queue`

워커 + enqueue 헬퍼 생성:

```bash
nx make:queue send-welcome-email
nx make:queue process-image --backend cloudflare
nx make:queue notify --no-job
```

생성 파일:

- `app/queue/workers/<name>.worker.ts` — `@OnQueueReady` 핸들러 클래스
- `app/queue/jobs/<name>.job.ts` — 호출자를 위한 `enqueue*` 헬퍼

플래그:

| 플래그 | 효과 |
| ---- | ------ |
| `--backend` | 백엔드 오버라이드 (`bullmq` / `cloudflare` / `memory`) |
| `--no-job` | enqueue 헬퍼 건너뜀 |
| `--no-worker` | 워커 클래스 건너뜀 |

---

## 11. 테스트

테스트에서 인메모리 백엔드 사용:

```ts
const AppQueueModule = QueueModule.forRoot({ backend: 'memory' });

@Module({ imports: [AppQueueModule] })
class TestModule {}

const app = new Application(TestModule);
const queue = app.container.resolve(QueueService);
await queue.start();

let received: unknown;
await queue.process('send-email', async (data) => {
  received = data;
  return { status: 'completed' };
});
await queue.add('send-email', { to: 'x@y.z' });

await new Promise((r) => setTimeout(r, 200));
expect(received).toEqual({ to: 'x@y.z' });

await queue.stop();
```

---

## 12. 참고

- [`../design/queue.md`](../design/queue.md) — 아키텍처, 결정
- [BullMQ 문서](https://docs.bullmq.io/)
- [Cloudflare Queues 문서](https://developers.cloudflare.com/queues/)
- [`./cli.md`](./cli.md) — `nx make:queue` 레퍼런스
