# nexus/sse — Server-Sent Events

> 한국어 버전: [`sse.ko.md`](./sse.ko.md)
> Added in **v0.4** (Tier 2 gap from the NestJS / AdonisJS analyses).

`nexus/sse` is a thin, type-safe wrapper around Hono's `streamSSE()`
for one-way streaming from server to client. Useful for AI chat
responses, build progress, live logs, notifications, dashboards.

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

## 1. Why SSE?

SSE is the simplest way to push events from a server to a browser
over plain HTTP/1.1. No WebSockets server, no long-poll tricks, no
special protocol. The browser's built-in `EventSource` consumes it
with auto-reconnect.

| Need | Reach for |
| --- | --- |
| One-way server → client, ordered, low-frequency | `nexus/sse` |
| Bidirectional, low-latency, binary | WebSockets |
| Short request → response streaming | Hono `c.stream()` directly |

---

## 2. The `sse()` helper

```ts
import { sse, getLastEventId } from 'nexus/sse';

@Get('/events')
events(@Req() c: any) {
  return sse(c, (stream) => {
    stream.send({ data: 'hello' });
    // ... any async logic
  });
}
```

The helper:

1. Sets the response headers (`Content-Type: text/event-stream`,
   `Cache-Control: no-cache`, etc.)
2. Hands the controller a typed `SseStream`
3. Returns a `Response` that the framework passes through

The callback may be **sync or async**. When the client disconnects,
`onClose` callbacks fire and the underlying Hono stream closes.

---

## 3. The `SseStream` interface

```ts
interface SseStreamController {
  send<T = unknown>(event: SseEvent<T> | string): void;
  close(): void | Promise<void>;
  readonly closed: boolean;
  onClose(cb: () => void): void;
  sleep(ms: number): Promise<void>;
}

interface SseEvent<T = unknown> {
  id?: string | number;     // event id — used for Last-Event-ID
  event?: string;           // event name (e.g. 'tick', 'update')
  data: T;                  // payload (string or JSON-serializable)
  retry?: number;           // reconnect hint in ms
}
```

### Auto-serialization

Object payloads are auto-serialized via `JSON.stringify`. Strings
are sent verbatim. Numbers/booleans/etc. are converted to strings.

```ts
stream.send({ data: 'hello' });                  // data: hello\n\n
stream.send({ event: 'tick', data: { n: 1 } });  // event: tick\ndata: {"n":1}\n\n
```

### `close()` waits for pending writes

The class tracks every `writeSSE` promise. `close()` awaits all
pending writes before closing the underlying Hono stream, so
**every `send()` made before `close()` is guaranteed to reach the
client**. This is critical for short-lived streams that emit
a few events and then close.

### `onClose()` for cleanup

```ts
const t = setInterval(() => stream.send({ data: Date.now() }), 1000);
stream.onClose(() => {
  clearInterval(t);
  console.log('client disconnected');
});
```

Fires on either:

- Explicit `stream.close()`
- Client disconnect (Hono's `onAbort` callback)

---

## 4. Reconnection with `Last-Event-ID`

The browser's `EventSource` reconnects automatically and sends a
`Last-Event-ID` header with the last id it received. Use
`getLastEventId(c)` to read it and replay missed events.

```ts
@Get('/events')
events(@Req() c: any) {
  const lastId = getLastEventId(c);
  return sse(c, async (stream) => {
    // 1. Replay missed events.
    if (lastId !== null) {
      for (const ev of store.eventsSince(lastId)) {
        stream.send({ id: ev.id, data: ev.payload });
      }
    }
    // 2. Continue with the live stream.
    const t = setInterval(() => {
      const id = nextId();
      store.add({ id, payload: Date.now() });
      stream.send({ id, data: Date.now() });
    }, 1000);
    stream.onClose(() => clearInterval(t));
  });
}
```

The wire format with `id`:

```
id: 1
data: 1700000000000

id: 2
data: 1700000001000
```

---

## 5. Common patterns

### One-shot notification

```ts
@Get('/exports/:id')
export(@Param('id') id: string, @Req() c: any) {
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

### Heartbeat / keep-alive

Long-lived connections may be killed by intermediate proxies
(Nginx, Cloudflare, etc.) if no data is sent for a while. Send a
comment line periodically:

```ts
const t = setInterval(() => stream.send({ data: 'ping' }), 30_000);
stream.onClose(() => clearInterval(t));
```

`EventSource` ignores `data:` lines that start with whitespace or
empty `data:`, so a no-op ping is safe.

### Custom event name

```ts
stream.send({ event: 'user.created', data: { id: 42, email: 'a@b.com' } });
```

On the client:

```ts
const source = new EventSource('/events');
source.addEventListener('user.created', (ev) => {
  console.log(JSON.parse(ev.data));
});
```

---

## 6. Client usage

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

## 7. Tier comparison

| Framework | SSE story | v0.4 |
| --- | --- | --- |
| NestJS | `@nestjs/platform-sse` (uses RxJS observables) | ✅ closed — `nexus/sse` |
| AdonisJS | DIY (Hono `streamSSE` example in docs) | ✅ closed — `nexus/sse` |

Per the v0.3 gap analyses (NestJS §3.3, AdonisJS §4.4), this was
a Tier 2 gap. `nexus/sse` ships it as a 1st-party module.

---

## 8. See also

- [`./openapi.md`](./openapi.md) — the companion OpenAPI 3.1 + Scalar UI module
- [`./cross-cutting-features.md`](./cross-cutting-features.md) — drive, mail, cache, etc.
- [`../analysis/nestjs-comparison.md`](../analysis/nestjs-comparison.md) — Tier 2 gap list
- [Hono `streamSSE` documentation](https://hono.dev/docs/helpers/streaming#server-sent-events) — the underlying primitive
- [MDN: Server-Sent Events](https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events) — the wire protocol
- [HTML spec: Server-Sent Events](https://html.spec.whatwg.org/multipage/server-sent-events.html)
