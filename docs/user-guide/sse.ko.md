# @nexusts/sse — Server-Sent Events

> English version: [`sse.md`](./sse.md)
> **v0.4**에서 추가됨 (NestJS / AdonisJS 분석의 Tier 2 격차).

`@nexusts/sse`는 서버에서 클라이언트로의 단방향 스트리밍을 위한 Hono
`streamSSE()`의 얇고 타입 안전한 래퍼다. AI 채팅 응답, 빌드 진행률,
라이브 로그, 알림, 대시보드에 유용.

```
@Get('/events')
events(@Req() c: any) {
  return sse(c, (stream) => {
    const t = setInterval(() => {
      stream.send({ event: 'tick', data: Date.now() });
    }, 1000);
    stream.onClose(() => clearInterval(t));
  });
}
```

---

## 1. 왜 SSE인가?

SSE는 서버에서 브라우저로 단방향 이벤트를 푸시하는 가장 간단한 방법이다.
WebSockets 서버도, long-poll 트릭도, 특별한 프로토콜도 필요 없다.
브라우저 내장 `EventSource`가 자동 재연결과 함께 소비한다.

| 필요 | 사용 |
| --- | --- |
| 단방향 서버 → 클라이언트, 순서 보장, 저빈도 | `@nexusts/sse` |
| 양방향, 저지연, 바이너리 | WebSockets |
| 짧은 요청 → 응답 스트리밍 | Hono `c.stream()` 직접 |

---

## 2. `sse()` 헬퍼

```ts
import { sse, getLastEventId } from '@nexusts/sse';

@Get('/events')
events(@Req() c: any) {
  return sse(c, (stream) => {
    stream.send({ data: 'hello' });
    // ... 모든 async 로직
  });
}
```

헬퍼는:

1. 응답 헤더 설정 (`Content-Type: text/event-stream`,
   `Cache-Control: no-cache` 등)
2. 컨트롤러에 타입 안전한 `SseStream` 전달
3. 프레임워크가 그대로 통과시키는 `Response` 반환

콜백은 **동기 또는 비동기** 모두 가능. 클라이언트가 연결을 끊으면
`onClose` 콜백이 실행되고 underlying Hono 스트림이 닫힌다.

---

## 3. `SseStream` 인터페이스

```ts
interface SseStreamController {
  send<T = unknown>(event: SseEvent<T> | string): void;
  close(): void | Promise<void>;
  readonly closed: boolean;
  onClose(cb: () => void): void;
  sleep(ms: number): Promise<void>;
}

interface SseEvent<T = unknown> {
  id?: string | number;     // event id — Last-Event-ID에 사용
  event?: string;           // event 이름 (예: 'tick', 'update')
  data: T;                  // payload (string 또는 JSON-serializable)
  retry?: number;           // 재연결 힌트 (ms)
}
```

### 자동 직렬화

객체 payload는 `JSON.stringify`로 자동 직렬화된다. 문자열은 그대로
전송된다. 숫자/불리언 등은 문자열로 변환된다.

```ts
stream.send({ data: 'hello' });                  // data: hello\n\n
stream.send({ event: 'tick', data: { n: 1 } });  // event: tick\ndata: {"n":1}\n\n
```

### `close()`는 pending 쓰기를 대기

클래스는 모든 `writeSSE` promise를 추적한다. `close()`는 underlying
Hono 스트림을 닫기 전에 모든 pending 쓰기가 완료되기를 기다린다.
따라서 **`close()` 전에 호출된 모든 `send()`는 클라이언트에 도달하는 것이
보장된다**. 이는 몇 개 이벤트를 emit하고 닫는 단명한 스트림에 중요하다.

### `onClose()` 정리

```ts
const t = setInterval(() => stream.send({ data: Date.now() }), 1000);
stream.onClose(() => {
  clearInterval(t);
  console.log('client disconnected');
});
```

다음 상황에서 실행:

- 명시적 `stream.close()`
- 클라이언트 연결 끊김 (Hono의 `onAbort` 콜백)

---

## 4. `Last-Event-ID`로 재연결

브라우저의 `EventSource`는 자동 재연결하며 마지막으로 받은 id를
`Last-Event-ID` 헤더로 보낸다. `getLastEventId(c)`로 읽고 놓친 이벤트를
replay한다.

```ts
@Get('/events')
events(@Req() c: any) {
  const lastId = getLastEventId(c);
  return sse(c, async (stream) => {
    // 1. 놓친 이벤트 replay
    if (lastId !== null) {
      for (const ev of store.eventsSince(lastId)) {
        stream.send({ id: ev.id, data: ev.payload });
      }
    }
    // 2. 라이브 스트림 계속
    const t = setInterval(() => {
      const id = nextId();
      store.add({ id, payload: Date.now() });
      stream.send({ id, data: Date.now() });
    }, 1000);
    stream.onClose(() => clearInterval(t));
  });
}
```

`id`가 포함된 wire 형식:

```
id: 1
data: 1700000000000

id: 2
data: 1700000001000
```

---

## 5. 일반적인 패턴

### 일회성 알림

```ts
@Get('/exports/:id')
export(ctx: Context) {
    const id = ctx.req.param('id');
  return sse(c, (stream) => {
    const t = setInterval(() => {
      const progress = jobStore.getProgress(id);
      stream.send({ event: 'progress', data: { progress } });
      if (progress >= 100) {
        stream.send({ event: 'done', data: { url: `/files/${id}` } });
        stream.close();
        clearInterval(t);
      }
    }, 500);
  });
}
```

### 하트비트 / keep-alive

장시간 연결은 중간 프록시(Nginx, Cloudflare 등)에 의해 데이터가
오래 안 오면 끊길 수 있다. 주기적으로 주석 라인을 보내라:

```ts
const t = setInterval(() => stream.send({ data: 'ping' }), 30_000);
stream.onClose(() => clearInterval(t));
```

`EventSource`는 공백으로 시작하거나 빈 `data:` 라인을 무시하므로
no-op ping은 안전하다.

### 커스텀 event 이름

```ts
stream.send({ event: 'user.created', data: { id: 42, email: 'a@b.com' } });
```

클라이언트에서:

```ts
const source = new EventSource('/events');
source.addEventListener('user.created', (ev) => {
  console.log(JSON.parse(ev.data));
});
```

---

## 6. 클라이언트 사용법

```js
// Vanilla JS
const source = new EventSource('/events');
source.addEventListener('tick', (ev) => {
  console.log('tick:', ev.data);
});
source.onerror = (e) => console.error('sse error', e);

// React (with hooks)
useEffect(() => {
  const source = new EventSource('/api/events');
  source.addEventListener('tick', (e) => setData(JSON.parse(e.data)));
  return () => source.close();
}, []);
```

---

## 7. Tier 비교

| 프레임워크 | SSE | v0.4 |
| --- | --- | --- |
| NestJS | `@nestjs/platform-sse` (RxJS observable 사용) | ✅ 해소 — `@nexusts/sse` |
| AdonisJS | DIY (문서의 Hono `streamSSE` 예제) | ✅ 해소 — `@nexusts/sse` |

v0.3 격차 분석(NestJS §3.3, AdonisJS §4.4)에 따르면, 이것이 Tier 2
격차였다. `@nexusts/sse`는 이를 1급 모듈로 출시한다.

---

## 8. 참고

- [`./openapi.md`](./openapi.md) — 동반 OpenAPI 3.1 + Scalar UI 모듈
- [`./cross-cutting-features.md`](./cross-cutting-features.md) — drive, mail, cache 등
- [`../analysis/nestjs-comparison.md`](../analysis/nestjs-comparison.md) — Tier 2 격차 목록
- [Hono `streamSSE` 문서](https://hono.dev/docs/helpers/streaming#server-sent-events) — underlying primitive
- [MDN: Server-Sent Events](https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events) — wire protocol
- [HTML spec: Server-Sent Events](https://html.spec.whatwg.org/multipage/server-sent-events.html)
