# Schedule · `@Cron` decorator and scheduled tasks

> 한국어 버전: [`schedule.ko.md`](./schedule.ko.md)

NexusTS ships a schedule module under `@nexusts/schedule`

- `@Cron(expression)` decorator — runs a method on a cron schedule.
- `@Interval(milliseconds)` — runs every N ms.
- `@Timeout(milliseconds)` — runs once after N ms.
- **Cron parser** — standard 5-field crontab + 6-field with seconds +
  aliases (`@daily`, `@hourly`, ...) + `@every <duration>`.
- **Two backends** — in-process (Bun / Node) and Cloudflare Cron
  Triggers.

The schedule module is **separate from `@nexusts/core`** and ships as
its own bundle entry point.

---

## 1. Quick start

```ts
// app/app.module.ts
import { Module } from '@nexusts/core';
import { ScheduleModule } from '@nexusts/schedule';

@Module({
  imports: [ScheduleModule.forRoot({ backend: 'memory' })],
})
export class AppModule {}
```

```ts
// app/schedule/tasks/cleanup.task.ts
import { Inject, Injectable } from '@nexusts/core';
import { Cron, Interval, ScheduleService } from '@nexusts/schedule';

@Injectable()
export class CleanupTask {
  @Inject(ScheduleService.TOKEN) declare schedule: ScheduleService;

  @Cron('0 * * * *')                     // every hour
  async hourly() {
    await deleteStaleSessions();
  }

  @Interval(60_000)                     // every minute
  async heartbeat() {
    await pingHealthcheck();
  }
}
```

**Auto-scanning is built-in.** `ScheduleModule` automatically detects
all `@Cron` / `@Interval` / `@Timeout` decorators on every resolved
provider at boot time. No manual `scanForSchedulers` or `start()`
call needed:

```ts
// app/main.ts — no schedule boilerplate needed
import { Application } from '@nexusts/core';
import { AppModule } from './app.module.js';

const app = new Application(AppModule, {
  logging: true,
});
await app.listen();
```

---

## 2. Cron expressions

| Expression | Meaning |
| ---------- | ------- |
| `* * * * *` | every minute |
| `0 * * * *` | every hour (at minute 0) |
| `*/15 * * * *` | every 15 minutes |
| `0 9 * * 1-5` | 9am on weekdays |
| `0 0 1 * *` | 1st of every month |
| `30 14 1 4 *` | Apr 1st at 14:30 |
| `@yearly`, `@annually` | 0 0 1 1 * |
| `@monthly` | 0 0 1 ** |
| `@weekly` | 0 0 ** 0 |
| `@daily`, `@midnight` | 0 0 ** * |
| `@hourly` | 0 **** |
| `@every 1h30m` | every 90 minutes |
| `@every 30s` | every 30 seconds |

Field names are accepted: `JAN-DEC` (months), `SUN-SAT` (weekdays),
case-insensitive. Ranges (`1-5`), lists (`1,3,5`), and steps
(`*/2`) are all supported.

Use the 6-field variant (with seconds) for finer granularity:
`0 0 9 * * MON` = Monday at 9:00:00.

---

## 3. The decorators

### `@Cron(expression, options?)`

```ts
@Cron('0 9 * * 1-5', { timezone: 'UTC' })
async weekdayMorning() {
  // ...
}
```

Options:

| Key | Default | Meaning |
| --- | ------- | ------- |
| `name` | method name | Display name in `ScheduleService.list()` |
| `timezone` | host local | IANA TZ for the schedule |
| `runOnInit` | `false` | Run immediately on register |

### `@Interval(milliseconds, name?)`

```ts
@Interval(60_000)
async tick() { /* ... */ }
```

### `@Timeout(milliseconds, name?)`

```ts
@Timeout(5_000)
async startup() { /* runs 5s after register */ }
```

---

## 4. Programmatic API

```ts
class MyService {
  @Inject(ScheduleService.TOKEN) declare schedule: ScheduleService;

  async init() {
    // Cron
    this.schedule.addCron('0 * * * *', () => console.log('hourly'));

    // Interval
    this.schedule.addInterval(60_000, () => console.log('every minute'));

    // Timeout
    this.schedule.addTimeout(5_000, () => console.log('5s after boot'));

    // Introspection
    console.log(this.schedule.list());   // all tasks
    console.log(this.schedule.get('hourly'));   // by name or id

    // Mutation
    this.schedule.pause('hourly');
    this.schedule.resume('hourly');
    this.schedule.delete('hourly');
  }
}
```

`addCron`/`addInterval`/`addTimeout` return the assigned id.

---

## 5. The Cloudflare backend

```ts
ScheduleModule.forRoot({ backend: 'cloudflare' });
```

The `CloudflareSchedulesBackend` is **registration-only**: tasks are
stored locally for introspection, but the actual firing happens at
the platform level via Cron Triggers.

```toml
# wrangler.toml
[[triggers.crons]]
cron = "*/15 * * * *"
```

```ts
// app/worker.ts
const app = new Application(AppModule);
const schedule = app.container.resolve(ScheduleService);
const cf = schedule.getCloudflareBackend();
if (cf) cf.bind();

export default {
  fetch: app.fetch,
  scheduled: cf?.scheduledHandler(),
};
```

The handler dispatches to the registered task whose expression matches
the trigger's cron. **Workers don't support `setInterval` /
`setTimeout`** — use cron with short intervals (e.g. `@every 30s`)
or run the work from a request handler.

---

## 6. Lifecycle

The scheduler starts automatically during `Application.bootstrap()`.
No manual `start()` call is needed. Each registered task gets a
`setInterval` (interval/timeout) or is dispatched on the next cron
match. `stop()` clears everything:

```ts
// Manual control (if auto-start is not desired)
const schedule = app.container.resolve(ScheduleService);
await schedule.stop();
```

Events you can subscribe to:

```ts
schedule.on((event) => {
  switch (event.kind) {
    case 'task:registered':
    case 'task:invoked':
    case 'task:completed':
    case 'task:failed':
    case 'task:paused':
    case 'task:resumed':
    case 'task:deleted':
  }
});
```

---

## 7. Configuration

```ts
ScheduleModule.forRoot({
  backend: 'memory',             // or 'cloudflare'
  defaultTimezone: 'UTC',
  memory: {
    tickMs: 1000,                // default
    maxDriftMs: 60_000,          // skip tasks that fall behind by more
  },
});
```

For long-running servers, set `tickMs` to ~1000ms (default) for
minute-precision tasks, or higher for less frequent schedules.

---

## 8. CLI: `nx make:schedule`

```bash
nx make:schedule HourlyCleanup
nx make:schedule DailyDigest
```

Generates `app/schedule/tasks/<name>.task.ts` with a skeleton class
ready for `@Cron` / `@Interval` / `@Timeout` handlers. The decorators
are auto-detected at boot — no manual registration needed.

---

## 9. Integration with events

A scheduled task can emit an event when it fires:

```ts
@Injectable()
class CleanupTask {
  constructor(
    @Inject(ScheduleService.TOKEN) private schedule: ScheduleService,
    @Inject(EventService.TOKEN) private events: EventService,
  ) {}

  @Cron('@daily')
  async daily() {
    const cleaned = await runCleanup();
    await this.events.emit('cleanup.completed', { count: cleaned });
  }
}
```

---

## 10. Testing

```ts
const backend = new MemorySchedulesBackend({ tickMs: 50 });
let fired = 0;
backend.addInterval('tick', 30, () => void fired++);
backend.start();
await new Promise((r) => setTimeout(r, 120));
await backend.stop();
expect(fired).toBeGreaterThanOrEqual(2);
```

For DI integration tests, use the default memory backend:

```ts
@Module({ imports: [ScheduleModule.forRoot()] })
class TestModule {}

const app = new Application(TestModule);
const schedule = app.container.resolve(ScheduleService);
```

---

## 11. Known issues

- **`setInterval` drift** — Bun's `setInterval` is accurate to
  ~10ms; minute-precision schedules can drift slightly. The
  `maxDriftMs` config caps how far a task is allowed to fall behind.
- **Cron timezone** — currently the host's local timezone. Proper
  IANA TZ support is planned for v0.2.
- **Cloudflare intervals** — Workers don't support `setInterval`. Use
  `@every <duration>` instead (translates to a cron expression).

---

## 12. See also

- [`../design/schedule.md`](../design/schedule.md) — architecture
- [`@nestjs/schedule`](https://docs.nestjs.com/scheduling) — inspiration
- [`./events.md`](./events.md) — emitting events from scheduled tasks
- [`./cli.md`](./cli.md) — `nx make:schedule` reference
