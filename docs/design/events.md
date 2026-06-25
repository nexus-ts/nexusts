# Events Module — design

> 한국어 버전: [`events.ko.md`](./events.ko.md)

This document explains the architecture of `@nexusts/events`:
the in-process emitter, wildcard matching, priority-ordered dispatch,
guards, one-shot listeners, and the `@OnEvent` decorator integration.

## Goals

1. **In-process event bus.** No external dependency (no Redis, no
   message broker). Events are dispatched synchronously within the
   same process.
2. **Wildcard patterns.** `*` (single segment) and `**` (multi-segment)
   for flexible subscription — e.g., `user.*` matches `user.created`
   and `user.deleted`.
3. **Priorities and guards.** Lower-priority listeners run first.
   Guards (`if` predicate) allow conditional skipping without
   unsubscribe/re-subscribe.
4. **One-shot listeners.** Auto-removed after the first match.
5. **`@OnEvent` decorator.** Declarative subscription on service
   methods, scanned at boot time.
6. **Resilient by default.** A throwing listener does not stop other
   listeners. Errors are collected in `EmitResult.errors` for
   inspection.

## Architecture

```
┌────────────────────────────────────────────────────────┐
│                    User code                            │
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
│  Delegates on() / emit() / off() to the emitter        │
│  Reads EventsConfig from DI                            │
└────────────────────────────────────────────────────────┘
                        │
                        ▼
┌────────────────────────────────────────────────────────┐
│              NexusEventEmitter                          │
│                                                        │
│  InternalListener[]                                    │
│    ├── id: string                (unique, stable)      │
│    ├── pattern: string           ('user.created')      │
│    ├── regex: RegExp | null      (compiled pattern)    │
│    ├── priority: number          (lower = first)       │
│    ├── guard: (payload) => bool  (optional skip)       │
│    ├── once: boolean             (auto-remove)         │
│    ├── listener: (payload) => void                     │
│    └── createdAt: number         (FIFO tie-breaker)    │
│                                                        │
│  Sort: priority ASC → createdAt ASC                    │
│  Dispatch: await each listener in order                │
│  Errors: collected, not propagated (configurable)      │
└────────────────────────────────────────────────────────┘
```

## Wildcard matching

The `compilePattern()` function compiles event name patterns to
regular expressions:

| Pattern | Matches | Does not match |
|---------|---------|----------------|
| `user.created` | `user.created` | `user.deleted` |
| `user.*` | `user.created`, `user.deleted` | `user.profile.updated` |
| `user.**` | `user.created`, `user.profile.updated` | `order.created` |
| `**` | everything | — |
| `user.*.updated` | `user.profile.updated` | `user.created` |

Implementation:

1. Replace `**` and `*` with sentinel placeholders (ASCII control
   characters that survive regex escaping).
2. Escape all other regex metacharacters.
3. Replace sentinels with the actual regex fragments
   (`**` → `.*`, `*` → `[^.]+`).
4. Wrap in `^...$` for exact matching.

Patterns without wildcards compile to `null` (exact-match fast path).

## Priority and ordering

- **Priority**: lower values run first. Default: `5`. Configurable
  globally via `EventsConfig.defaultPriority` or per-listener via
  `ListenerOptions.priority`.
- **Tie-breaker**: when two listeners have the same priority, the one
  registered first (`createdAt`) runs first (FIFO).
- **Re-sorting**: every `on()` call triggers a stable sort of the
  `#listeners` array. The sort is cheap (O(n log n) for n listeners,
  typically < 100).

## Guards

A listener can register an `if(payload): boolean` predicate:

```ts
events.on('order.shipped', handler, {
  if: (payload) => payload.region === 'EU',
});
```

When the guard returns `false` (or throws), the listener is skipped
for that dispatch. Guards are resolved **in parallel** before any
listener fires, so a slow guard does not block other listeners
(unless `throwOnError` is set).

## One-shot listeners

`once()` registers a listener that is removed after its first
successful or failed run:

```ts
events.once('app.bootstrap', () => {
  console.log('Bootstrapped — this runs once');
});
```

After dispatch, matched `once` listeners are collected and removed
from the `#listeners` array in bulk.

## Error handling

Default behavior: **errors are collected, not propagated**.

```ts
const result = await events.emit('user.created', payload);
// result.failed → number of listeners that threw
// result.errors  → [{ listenerId, listenerName, error }]
```

When `EventsConfig.throwOnError: true`, the first listener that throws
causes `emit()` to reject immediately. Remaining listeners are not
called.

This mirrors the `EventEmitter` pattern from Node.js, where an
'uncaught' listener error emits an `error` event rather than crashing
the process.

## `@OnEvent` decorator

```ts
@Injectable()
class EmailListeners {
  @Inject(EventService.TOKEN) declare events: EventService;

  @OnEvent('user.created')
  async handleUserCreated(payload: { userId: string; email: string }) {
    await this.sendWelcome(payload.email);
  }
}
```

The decorator stores metadata under `"nexus:events:OnEvent"` on the
constructor. `scanForListeners(instance, events)` reads this metadata
and calls `events.on(pattern, boundListener, options)` for each
decorated method.

**Timing**: `scanForListeners` should be called after all services are
initialized but before the app starts serving. The framework's DI
container does this automatically when `EventsModule` is imported.

The `@OnEvent` decorator supports the same options as `events.on()`:

```ts
@OnEvent('order.shipped', { priority: 1, once: true })
async handleOnce(payload: any) { ... }
```

## DI integration

```
ApplicationContainer
  └── ConfiguredEventsModule
        ├── EventService
        ├── EventService.TOKEN (Symbol alias)
        └── "EVENTS_CONFIG" (useValue: config)
```

`EventService` is a thin wrapper around `NexusEventEmitter` that reads
`EVENTS_CONFIG` from DI. The emitter is created once in the constructor
and the config defaults to `{ maxListenersPerPattern: 10 }`.

## Emitter-internal events

The emitter emits diagnostic events about its own operation:

| Event | Fired when |
|-------|-----------|
| `listener:registered` | A listener is added |
| `listener:removed` | A listener is removed |
| `listener:fired` | A listener completes successfully |
| `listener:failed` | A listener throws |
| `listener:skipped` | A listener is skipped (guard, once, pattern) |

These are consumed by the `tracing` and `metrics` modules for
observability, never by user code directly.

## Future work

- **Distributed events** — bridge to Redis pub/sub so events cross
  process boundaries (opt-in, same API).
- **Event sourcing** — persistence layer that stores emitted events
  (for replay, audit, or CQRS).
- **Async dispatch** — `emitAsync()` that returns a `Promise<EmitResult>`
  but does not block the caller (fire-and-forget with result tracking).
- **Debounce / throttle** — listener-level rate limiting.

## See also

- [`../user-guide/events.md`](../user-guide/events.md) — user guide
- [`../design/tracing.md`](../design/tracing.md) — tracing module (consumes emitter events)
- [`../design/metrics.md`](../design/metrics.md) — metrics module (consumes emitter events)
