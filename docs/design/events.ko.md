# 이벤트 모듈 — 디자인

> English version: [`events.md`](./events.md)

이 문서는 `@nexusts/events`의 아키텍처를 설명한다: 인-프로세스
이미터, 와일드카드 매칭, 우선순위 정렬 dispatch, 가드, one-shot
리스너, `@OnEvent` 데코레이터 통합.

## 목표

1. **인-프로세스 이벤트 버스.** 외부 의존성 없음 (Redis, 메시지 브로커
   없음). 이벤트는 같은 프로세스 내에서 동기적으로 dispatch.
2. **와일드카드 패턴.** `*` (단일 세그먼트)와 `**` (다중 세그먼트)로 유연한
   구독 — 예: `user.*`는 `user.created`와 `user.deleted`에 매치.
3. **우선순위와 가드.** 더 낮은 우선순위 리스너가 먼저 실행. 가드
   (`if` predicate)는 unsubscribe/re-subscribe 없이 조건부 스킵을 허용.
4. **One-shot 리스너.** 첫 매치 후 자동 제거.
5. **`@OnEvent` 데코레이터.** 서비스 메서드의 선언적 구독, 부트 시 스캔.
6. **기본 회복력.** 던지는 리스너가 다른 리스너를 중단시키지 않음.
   에러는 `EmitResult.errors`에 수집되어 검사 가능.

## 아키텍처

```
┌────────────────────────────────────────────────────────┐
│                    사용자 코드                            │
│                                                        │
│  events.emit('user.created', { userId, email })        │
│                                                        │
│  @OnEvent('user.*')                                    │
│  async onEvent(payload) { ... }                        │
└────────────────────────────────────────────────────────┘
                        │
                        ▼
┌────────────────────────────────────────────────────────┐
│              EventService (facade)                      │
│                                                        │
│  on() / emit() / off()를 이미터에 위임                  │
│  DI에서 EventsConfig 읽음                                │
└────────────────────────────────────────────────────────┘
                        │
                        ▼
┌────────────────────────────────────────────────────────┐
│              NexusEventEmitter                          │
│                                                        │
│  InternalListener[]                                    │
│    ├── id: string                (고유, 안정)           │
│    ├── pattern: string           ('user.created')      │
│    ├── regex: RegExp | null      (컴파일된 패턴)       │
│    ├── priority: number          (낮음 = 먼저)          │
│    ├── guard: (payload) => bool  (옵션 스킵)          │
│    ├── once: boolean             (자동 제거)            │
│    ├── listener: (payload) => void                     │
│    └── createdAt: number         (FIFO 타이브레이커)   │
│                                                        │
│  정렬: priority ASC → createdAt ASC                    │
│  Dispatch: 각 리스너를 순서대로 await                   │
│  에러: 수집, 전파 안 함 (설정 가능)                     │
└────────────────────────────────────────────────────────┘
```

## 와일드카드 매칭

`compilePattern()` 함수가 이벤트 이름 패턴을 정규 표현식으로 컴파일:

| 패턴 | 매치 | 매치 안 함 |
|------|------|----------|
| `user.created` | `user.created` | `user.deleted` |
| `user.*` | `user.created`, `user.deleted` | `user.profile.updated` |
| `user.**` | `user.created`, `user.profile.updated` | `order.created` |
| `**` | 모두 | — |
| `user.*.updated` | `user.profile.updated` | `user.created` |

구현:

1. `**`와 `*`를 sentinel placeholder (regex escape를 견디는 ASCII 제어
   문자)로 교체.
2. 다른 regex 메타문자 모두 escape.
3. Sentinel을 실제 regex fragment로 교체 (`**` → `.*`, `*` → `[^.]+`).
4. 정확한 매칭을 위해 `^...$`로 감쌈.

와일드카드 없는 패턴은 `null`로 컴파일 (정확한 매칭 fast path).

## 우선순위와 정렬

- **Priority**: 낮은 값이 먼저 실행. 기본값: `5`. `EventsConfig.defaultPriority`
  또는 리스너별 `ListenerOptions.priority`로 설정 가능.
- **타이브레이커**: 두 리스너가 같은 priority면 먼저 등록된 것
  (`createdAt`)이 먼저 (FIFO).
- **재정렬**: 매 `on()` 호출이 `#listeners` 배열의 stable sort를
  트리거. 정렬은 cheap (O(n log n), 보통 n < 100).

## 가드

리스너는 `if(payload): boolean` predicate를 등록 가능:

```ts
events.on('order.shipped', handler, {
  if: (payload) => payload.region === 'EU',
});
```

가드가 `false`를 반환 (또는 throw)하면 해당 dispatch에서 리스너가 스킵.
가드는 어떤 리스너가 실행되기 전에 **병렬로** 평가되므로, 느린 가드가
다른 리스너를 차단하지 않음 (`throwOnError` 설정 시 제외).

## One-shot 리스너

`once()`는 첫 성공 또는 실패 실행 후 제거되는 리스너를 등록:

```ts
events.once('app.bootstrap', () => {
  console.log('부트 완료 — 한 번만 실행됨');
});
```

Dispatch 후 매치된 `once` 리스너가 수집되어 `#listeners` 배열에서
일괄 제거됨.

## 에러 처리

기본 동작: **에러는 수집되며 전파되지 않음**.

```ts
const result = await events.emit('user.created', payload);
// result.failed → throw한 리스너 수
// result.errors  → [{ listenerId, listenerName, error }]
```

`EventsConfig.throwOnError: true`일 때, throw하는 첫 리스너가 `emit()`을
즉시 reject. 나머지 리스너는 호출 안 됨.

이는 Node.js의 `EventEmitter` 패턴을 미러링 — 'uncaught' 리스너 에러가
프로세스를 죽이는 대신 `error` 이벤트를 발생.

## `@OnEvent` 데코레이터

```ts
@Injectable()
class EmailListeners {
  @Inject(EventService.TOKEN) declare private events: EventService;

  @OnEvent('user.created')
  async handleUserCreated(payload: { userId: string; email: string }) {
    await this.sendWelcome(payload.email);
  }
}
```

데코레이터는 생성자에 `"nexus:events:OnEvent"` 키 아래 메타데이터를 저장.
`scanForListeners(instance, events)`가 이 메타데이터를 읽고 각 데코레이트된
메서드에 대해 `events.on(pattern, boundListener, options)`를 호출.

**타이밍**: `scanForListeners`는 모든 서비스가 초기화된 후, 앱이 serving을
시작하기 전에 호출되어야 함. 프레임워크의 DI 컨테이너는 `EventsModule`이
import될 때 자동으로 이를 수행.

`@OnEvent` 데코레이터는 `events.on()`과 같은 옵션을 지원:

```ts
@OnEvent('order.shipped', { priority: 1, once: true })
async handleOnce(payload: any) { ... }
```

## DI 통합

```
ApplicationContainer
  └── ConfiguredEventsModule
        ├── EventService
        ├── EventService.TOKEN (Symbol alias)
        └── "EVENTS_CONFIG" (useValue: config)
```

`EventService`는 `NexusEventEmitter`의 얇은 래퍼로, DI에서 `EVENTS_CONFIG`를
읽음. 이미터는 생성자에서 한 번 생성되며 config 기본값은
`{ maxListenersPerPattern: 10 }`.

## 이미터 내부 이벤트

이미터는 자체 동작에 대한 진단 이벤트를 발생:

| 이벤트 | 발생 시점 |
|--------|---------|
| `listener:registered` | 리스너 추가됨 |
| `listener:removed` | 리스너 제거됨 |
| `listener:fired` | 리스너 성공 완료 |
| `listener:failed` | 리스너 throw |
| `listener:skipped` | 리스너 스킵 (가드, once, 패턴) |

이는 `tracing`과 `metrics` 모듈에서 관측 가능성으로 소비되며, 사용자
코드에 직접 노출되지는 않음.

## Future work

- **분산 이벤트** — Redis pub/sub에 bridge하여 이벤트가 프로세스 경계를
  넘어가게 (opt-in, 같은 API).
- **이벤트 소싱** — emitted 이벤트를 저장하는 영속화 레이어 (replay, audit,
  CQRS용).
- **Async dispatch** — `emitAsync()`가 `Promise<EmitResult>`를 반환하지만
  caller를 차단하지 않음 (result tracking과 fire-and-forget).
- **Debounce / throttle** — 리스너 레벨 rate limiting.

## 참고

- [`../user-guide/events.ko.md`](../user-guide/events.ko.md) — 사용자 가이드
- [`../design/tracing.ko.md`](../design/tracing.ko.md) — tracing 모듈 (이미터 이벤트 소비)
- [`../design/metrics.ko.md`](../design/metrics.ko.md) — metrics 모듈 (이미터 이벤트 소비)
