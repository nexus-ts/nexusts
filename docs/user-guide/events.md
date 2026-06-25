# Event System

> 한국어 버전: [`events.ko.md`](./events.ko.md)

NexusTS ships an event system under `@nexusts/events` that mirrors
`@nestjs/event-emitter` and AdonisJS's emitter.

- `events.emit(name, payload)` to dispatch
- `@OnEvent(pattern)` to subscribe
- **Wildcards** — `*` (single segment) and `**` (multi-segment)
- **Priorities** — lower runs first
- **Guards** — `if(payload) → boolean` for conditional handlers
- **One-shot listeners** — auto-removed after the first match
- **Error collection** — one failing listener does not stop the rest

The events module is **separate from `@nexusts/core`** and ships as its
own bundle entry point.

---

## 1. Quick start

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
    await sendEmail(payload.email, 'Welcome!');
  }

  @OnEvent('user.*', { priority: 1 })    // runs first
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

## 2. Wildcards

| Pattern | Matches | Doesn't match |
| ------- | ------- | -------------- |
| `user.created` | `user.created` | `user.updated` |
| `user.*` | `user.created`, `user.deleted` | `user.profile.updated`, `user` |
| `**` | every event name | — |
| `order.*.paid` | `order.usd.paid`, `order.eur.paid` | `order.paid` |

Wildcards compile to a regex internally (`*` → `[^.]+`, `**` → `.*`),
so dispatch is O(n) over listeners — fast enough for typical app
sizes.

---

## 3. Priorities

Lower numbers run first. Defaults to 5. Equal-priority listeners run
in registration order (FIFO).

```ts
@OnEvent('order.shipped', { priority: 1 })   // runs first
async logShipment() {}

@OnEvent('order.shipped', { priority: 10 })  // runs last
async sendShippingEmail() {}
```

Use priorities for:

- Logging / metrics (always first)
- Side-effects like emails (last, after validation/cache)
- Anything between

---

## 4. Guards

A listener can register an `if(payload) → boolean | Promise<boolean>`
predicate. When the predicate returns false, the listener is skipped
without firing.

```ts
@OnEvent('order.paid', {
  if: (payload) => payload.amount > 100,
})
async notifyFinance(payload: { amount: number; currency: string }) {
  // Only fires for high-value orders.
}
```

Guards that throw are treated as "skip". Useful for "schema not yet
loaded" or "feature flag off" patterns.

---

## 5. One-shot listeners

Mark a listener with `{ once: true }` and it's removed after its
first match.

```ts
@OnEvent('app.ready', { once: true })
async bootstrap() {
  // Runs exactly once.
}
```

The decorator sets the option automatically; you don't need to pass it
manually unless you want to.

---

## 6. Programmatic API

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

`emit()` returns an `EmitResult` you can inspect:

```ts
const result = await events.emit('user.created', payload);
console.log(result.matched);   // # of listeners matched
console.log(result.completed); // # that succeeded
console.log(result.failed);    // # that threw
console.log(result.errors);    // [{ listenerId, listenerName, error }]
```

By default a failing listener does **not** stop dispatch — errors are
collected. Set `throwOnError: true` in `EventsModule.forRoot({ ... })`
to make `emit()` reject instead.

---

## 7. Synchronous dispatch

`emitSync` runs listeners synchronously when possible. Async listeners
are fired-and-forgotten:

```ts
const r = events.emitSync('app.tick', payload);
```

Useful for hot paths where you don't want to await. Production code
should prefer `emit`.

---

## 8. Error semantics

| Configuration | Listener throws | Behavior |
| ------------- | --------------- | -------- |
| `throwOnError: false` (default) | yes | logged in `EmitResult.errors`, dispatch continues |
| `throwOnError: true` | yes | `emit()` rejects with the first error |

When `throwOnError: true` and a listener rejects, the rest of the
dispatch is **still attempted** — the error is thrown only after the
remaining listeners run.

---

## 9. Configuration

```ts
EventsModule.forRoot({
  maxListenersPerPattern: 10,    // default
  throwOnError: false,            // default
  defaultPriority: 5,             // default
});
```

`maxListenersPerPattern` is a safety net against listener leaks —
exceeding it throws at registration time.

---

## 10. CLI: `nx make:listener`

```bash
nx make:listener UserEvents
nx make:listener OrderEvents
```

Generates `app/events/listeners/<name>.listener.ts` with a skeleton
class ready to receive `@OnEvent` handlers.

---

## 11. Integration with other modules

The events system pairs naturally with:

- **better-auth** — listen for `user.created`, send welcome email.
- **BullMQ / queue** — emit `job.completed` from a worker.
- **Schedule** — emit `cron.fired` from a scheduled task.

```ts
@Injectable()
class EmailWorker {
  @Inject(QueueService.TOKEN) declare queue: QueueService;

  @OnQueueReady()
  async register() {
    await this.queue.process('send-welcome-email', async (data) => {
      // ... send the email
      await this.events.emit('email.sent', { to: data.email });
    });
  }
}
```

---

## 12. Testing

```ts
const em = new NexusEventEmitter();
const got: string[] = [];
em.on('user.created', (p) => void got.push((p as any).email));
await em.emit('user.created', { email: 'a@b.c' });
expect(got).toEqual(['a@b.c']);
```

For DI integration tests, use the in-memory configuration (default):

```ts
@Module({ imports: [EventsModule.forRoot()] })
class TestModule {}

const app = new Application(TestModule);
const events = app.container.resolve(EventService);
```

---

## 13. See also

- [`../design/events.md`](../design/events.md) — architecture, decisions
- [`@nestjs/event-emitter`](https://docs.nestjs.com/techniques/events) — inspiration
- [AdonisJS events](https://docs.adonisjs.com/guides/events) — inspiration
- [`./queue.md`](./queue.md) — queue + events integration
- [`./schedule.md`](./schedule.md) — scheduled task + events integration
