# Event System · 이벤트 시스템

> English version: [`events.md`](./events.md)

NexusTS는 `@nexusts/events` 모듈 아래 `@nestjs/event-emitter`와 AdonisJS의 emitter를 본떠 만든 이벤트 시스템을 제공한다.

- `events.emit(name, payload)` — 디스패치
- `@OnEvent(pattern)` — 구독
- **와일드카드** — `*` (단일 세그먼트) 및 `**` (다중 세그먼트)
- **우선순위** — 낮을수록 먼저 실행
- **가드** — `if(payload) → boolean`로 조건부 핸들링
- **일회용 리스너** — 첫 매칭 후 자동 제거
- **에러 수집** — 한 리스너 실패가 나머지를 중단시키지 않음

events 모듈은 **`@nexusts/core`와 분리**되어 있으며 자체 번들 진입점으로 제공된다.

---

## 1. 빠른 시작

```ts
// app/app.module.ts
import { Module } from '@nexusts/core';
import { EventsModule } from '@nexusts/events';

@Module({
  imports: [EventsModule.forRoot()],
})
export class AppModule {}
```

```ts
// app/events/listeners/email.listeners.ts
import { Inject, Injectable } from '@nexusts/core';
import { EventService, OnEvent } from '@nexusts/events';

@Injectable()
export class EmailListeners {
  @Inject(EventService.TOKEN) declare events: EventService;

  @OnEvent('user.created')
  async onUserCreated(payload: { userId: string; email: string }) {
    await sendEmail(payload.email, '환영합니다!');
  }

  @OnEvent('user.*', { priority: 1 })    // 가장 먼저 실행
  async logAllUserEvents(payload: unknown) {
    console.log('[user-event]', payload);
  }
}
```

```ts
// app/main.ts
import { Application } from '@nexusts/core';
import { EventService, scanForListeners } from '@nexusts/events';
import { AppModule } from './app.module.js';
import { EmailListeners } from './events/listeners/email.listeners.js';

const app = new Application(AppModule);
const events = app.container.resolve(EventService);

scanForListeners(new EmailListeners(), events);

await events.emit('user.created', { userId: '1', email: 'a@b.c' });
```

---

## 2. 와일드카드

| 패턴 | 매칭 | 매칭 안됨 |
| ------- | ------- | -------------- |
| `user.created` | `user.created` | `user.updated` |
| `user.*` | `user.created`, `user.deleted` | `user.profile.updated`, `user` |
| `**` | 모든 이벤트 이름 | — |
| `order.*.paid` | `order.usd.paid`, `order.eur.paid` | `order.paid` |

와일드카드는 내부적으로 regex로 컴파일된다(`*` → `[^.]+`, `**` → `.*`).
따라서 디스패치는 리스너 수에 대해 O(n) — 일반적인 앱 규모에서 충분히 빠르다.

---

## 3. 우선순위

낮은 숫자가 먼저 실행된다. 기본값은 5. 같은 우선순위면 등록 순서대로 실행(FIFO).

```ts
@OnEvent('order.shipped', { priority: 1 })   // 가장 먼저
async logShipment() {}

@OnEvent('order.shipped', { priority: 10 })  // 가장 마지막
async sendShippingEmail() {}
```

우선순위를 사용하는 경우:

- 로깅 / 메트릭 (항상 먼저)
- 이메일 같은 부수 효과 (마지막, 검증/캐시 후)
- 그 사이의 모든 것

---

## 4. 가드

리스너는 `if(payload) → boolean | Promise<boolean>` 술어를 등록할 수 있다. 술어가 false를 반환하면 리스너는 실행되지 않고 건너뛴다.

```ts
@OnEvent('order.paid', {
  if: (payload) => payload.amount > 100,
})
async notifyFinance(payload: { amount: number; currency: string }) {
  // 고액 주문에만 실행된다.
}
```

던져진 가드는 "skip"으로 처리된다. "스키마가 아직 로드되지 않음" 또는 "기능 플래그 꺼짐" 패턴에 유용하다.

---

## 5. 일회용 리스너

`{ once: true }`로 리스너를 표시하면 첫 매칭 후 자동 제거된다.

```ts
@OnEvent('app.ready', { once: true })
async bootstrap() {
  // 정확히 한 번만 실행된다.
}
```

데코레이터가 옵션을 자동으로 설정한다. 원하지 않는 한 수동으로 전달할 필요 없다.

---

## 6. 프로그래매틱 API

```ts
class WebhookController {
  @Inject(EventService.TOKEN) declare events: EventService;

  @Post('/incoming')
  async incoming(ctx: Context) {
    const body = await ctx.req.json() as any;
    await this.events.emit('webhook.received', {
      source: body.source,
      timestamp: Date.now(),
    });
    return { ok: true };
  }
}
```

`emit()`은 검사할 수 있는 `EmitResult`를 반환한다.

```ts
const result = await events.emit('user.created', payload);
console.log(result.matched);   // 매칭된 리스너 수
console.log(result.completed); // 성공한 리스너 수
console.log(result.failed);    // 던진 리스너 수
console.log(result.errors);    // [{ listenerId, listenerName, error }]
```

기본적으로 실패한 리스너는 디스패치를 **중단하지 않는다** — 에러는 수집된다. `EventsModule.forRoot({ throwOnError: true })`로 `emit()`이 대신 reject하도록 설정할 수 있다.

---

## 7. 동기 디스패치

`emitSync`는 가능한 경우 리스너를 동기적으로 실행한다. 비동기 리스너는 fire-and-forget:

```ts
const r = events.emitSync('app.tick', payload);
```

await하지 않는 핫패스에 유용하다. 프로덕션 코드는 `emit`을 선호해야 한다.

---

## 8. 에러 시맨틱

| 설정 | 리스너 던짐 | 동작 |
| ------------- | --------------- | -------- |
| `throwOnError: false` (기본값) | 예 | `EmitResult.errors`에 기록, 디스패치 계속 |
| `throwOnError: true` | 예 | `emit()`이 첫 에러로 reject |

`throwOnError: true`이고 리스너가 reject해도 나머지 디스패치는 **여전히 시도된다** — 에러는 나머지 리스너가 실행된 후에만 던져진다.

---

## 9. 설정

```ts
EventsModule.forRoot({
  maxListenersPerPattern: 10,    // 기본값
  throwOnError: false,            // 기본값
  defaultPriority: 5,             // 기본값
});
```

`maxListenersPerPattern`은 리스너 누수에 대한 안전망이다 — 초과 시 등록 시점에 던진다.

---

## 10. CLI: `nx make:listener`

```bash
nx make:listener UserEvents
nx make:listener OrderEvents
```

`app/events/listeners/<name>.listener.ts`를 `@OnEvent` 핸들러를 받을 준비가 된 스켈레톤 클래스와 함께 생성한다.

---

## 11. 다른 모듈과의 통합

이벤트 시스템은 다음과 자연스럽게 페어링된다.

- **better-auth** — `user.created`를 듣고 환영 이메일 발송.
- **BullMQ / queue** — 워커에서 `job.completed` emit.
- **Schedule** — 스케줄된 작업에서 `cron.fired` emit.

```ts
@Injectable()
class EmailWorker {
  @Inject(QueueService.TOKEN) declare queue: QueueService;

  @OnQueueReady()
  async register() {
    await this.queue.process('send-welcome-email', async (data) => {
      // ... 이메일 발송
      await this.events.emit('email.sent', { to: data.email });
    });
  }
}
```

---

## 12. 테스트

```ts
const em = new NexusEventEmitter();
const got: string[] = [];
em.on('user.created', (p) => void got.push((p as any).email));
await em.emit('user.created', { email: 'a@b.c' });
expect(got).toEqual(['a@b.c']);
```

DI 통합 테스트의 경우, 인메모리 설정(기본값)을 사용한다.

```ts
@Module({ imports: [EventsModule.forRoot()] })
class TestModule {}

const app = new Application(TestModule);
const events = app.container.resolve(EventService);
```

---

## 13. 참고

- [`../design/events.md`](../design/events.md) — 아키텍처, 결정
- [`@nestjs/event-emitter`](https://docs.nestjs.com/techniques/events) — 영감
- [AdonisJS 이벤트](https://docs.adonisjs.com/guides/events) — 영감
- [`./queue.md`](./queue.md) — 큐 + 이벤트 통합
- [`./schedule.md`](./schedule.md) — 스케줄 작업 + 이벤트 통합
