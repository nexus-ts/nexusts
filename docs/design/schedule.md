# Schedule Module Design

> 한국어 버전: [`schedule.ko.md`](./schedule.ko.md)

## 1. Goal

Provide a NestJS-style `@Cron` decorator API on top of either an
in-process scheduler (Bun / Node) or Cloudflare's Cron Triggers
(Workers). User code is the same; only the runtime matters.

## 2. Why wrap (vs roll your own)?

A reliable scheduler has more parts than the API suggests:

| Concern | Risk if rolled by hand |
| ------- | ---------------------- |
| Cron expression parsing | Off-by-one on day-of-week; wrong handling of `*` vs ranges |
| Next-run calculation | Wrong leap-year, month wraparound, timezone math |
| Drift correction | Tasks pile up if `setInterval` blocks |
| Pause / resume semantics | Hard to model correctly with `clearInterval` |
| Cross-runtime support | `setInterval` doesn't exist on Workers |
| Visibility | `nx route:list`-style introspection becomes ad-hoc |

We ship a **small custom cron parser** (no external dep) plus a
**uniform `ScheduleRegistry` interface** so user code never touches
either backend directly.

## 3. Architecture

```
┌──────────────────────────────────────────────────────────────┐
│                      User code                                │
│   @Cron('0 * * * *') onMethod() { /* ... */ }               │
│   schedule.addInterval(ms, fn)                               │
└──────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌──────────────────────────────────────────────────────────────┐
│              nexus/schedule  (separate entry point)          │
│                                                              │
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────┐ │
│  │ ScheduleService  │  │ @Cron            │  │ scanFor-     │ │
│  │ (DI facade)      │  │ @Interval        │  │ Schedulers() │ │
│  │                 │  │ @Timeout         │  │              │ │
│  └──────────────────┘  └──────────────────┘  └──────────────┘ │
│                              │                               │
│                              ▼                               │
│                    ┌──────────────────────┐                   │
│                    │   ScheduleRegistry   │                   │
│                    │   (interface)        │                   │
│                    └──────────────────────┘                   │
│                              │                               │
│        ┌─────────────────────┼─────────────────────┐         │
│        ▼                     ▼                     ▼         │
│  ┌──────────┐          ┌──────────┐          ┌──────────┐    │
│  │  Memory  │          │Cloudflare│          │  (more)  │    │
│  │ (Bun/    │          │ Workers  │          │          │    │
│  │  Node)   │          │          │          │          │    │
│  └──────────┘          └──────────┘          └──────────┘    │
└──────────────────────────────────────────────────────────────┘
```

The facade (`ScheduleService`) is the only thing user code talks to.
Backends are swappable; changing `backend: 'memory'` to
`'cloudflare'` in `nx.config.ts` doesn't touch controllers.

## 4. Module separation

`nexus/schedule` is a separate entry point:

```json
"exports": {
  ".":         { ... },
  "./cli":     { ... },
  "./auth":    { ... },
  "./queue":   { ... },
  "./schedule":{ ... },   // new
  "./events":  { ... }
}
```

Build script bundles `src/schedule/index.ts` as its own artifact
under `dist/schedule/`. No runtime peer deps — the cron parser is
in-tree.

## 5. The cron parser

`src/schedule/cron-parser.ts` implements:

- **5-field crontab** — minute, hour, day-of-month, month, day-of-week
- **6-field variant** — adds seconds at the front
- **Aliases** — `@yearly`, `@annually`, `@monthly`, `@weekly`,
  `@daily`, `@midnight`, `@hourly`
- **`@every Nd/Nh/Nm/Ns`** — uniform interval
- **Wildcards** — `*`, `1-5`, `1,3,5`, `*/2`
- **Names** — `JAN-DEC`, `SUN-SAT` (case-insensitive)

`next(from)` walks forward from `from`, fast-forwarding past
non-matching months / days / hours when it can. Day-of-month and
day-of-week are OR'd per the standard crontab rule: when both are
restricted, a date matches if **either** field matches.

```ts
parseCron('0 9 * * 1-5').next(new Date('2026-06-15T08:00:00Z'));
// → 2026-06-15T09:00:00 (Monday)  or  next weekday 9am
```

We ship the parser in-tree rather than pulling in `croner` or
`node-cron` so:

- Bundle size stays small.
- No version-skew between `better-auth`'s deps and ours.
- The parser matches our semantics exactly.

## 6. The registry interface

Every backend implements:

```ts
interface ScheduleRegistry {
  addCron(name, expression, handler, options?): string;
  addInterval(name, ms, handler): string;
  addTimeout(name, ms, handler): string;
  delete(idOrName): boolean;
  list(): ScheduledTask[];
  get(idOrName): ScheduledTask | undefined;
  pause(idOrName): boolean;
  resume(idOrName): boolean;
  stop(): Promise<void>;
  on(listener): () => void;
}
```

We deliberately **omit** Cloudflare-specific fields (e.g. the cron
trigger name) — those go in `ScheduleConfig.cloudflare`.

## 7. The in-process backend

`MemorySchedulesBackend`:

- **Cron tasks** — held in a `Map`, scanned every `tickMs` (default
  1s). On match, dispatched via `#runTask`.
- **Interval tasks** — `setInterval`. Drift clamped at
  `maxDriftMs` (default 60s).
- **Timeout tasks** — `setTimeout`. Auto-removed after firing.
- **Pause** — `clearInterval`/`clearTimeout` + status flag.
- **Stop** — clear every timer, empty the maps.

The tick interval is `unref()`-ed so it doesn't keep the process alive
in tests.

## 8. The Cloudflare backend

`CloudflareSchedulesBackend`:

- **Cron tasks** — registered locally (for `nx route:list`-style
  introspection). The actual firing happens via the platform's
  Cron Triggers (`wrangler.toml: [[triggers.crons]]`).
- **Interval / timeout** — **throw at registration time**. Workers
  has no `setInterval` / `setTimeout`. Users should use
  `@every <duration>` for short intervals and run one-shots from a
  request handler.
- **`scheduledHandler()`** — the Worker's `scheduled()` export.
  Dispatches to the registered task whose expression matches the
  trigger's `event.cron`.

```ts
const app = new Application(AppModule);
const schedule = app.container.resolve(ScheduleService);
const cf = schedule.getCloudflareBackend();
if (cf) cf.bind();

export default {
  fetch: app.fetch,
  scheduled: cf?.scheduledHandler(),
};
```

## 9. The decorator API

`@Cron(expr, options)`, `@Interval(ms)`, `@Timeout(ms)` write
metadata to the class via `reflect-metadata`. `scanForSchedulers`
reads that metadata and calls the methods:

```ts
@Injectable()
class CleanupTask {
  @Cron('0 * * * *')
  async hourly() {}
}

const task = new CleanupTask();
const ids = await scanForSchedulers(task, schedule);
```

We don't auto-wire this into `Application.start()` because the
worker might live in a child container the user has to resolve
manually. Future releases will.

## 10. DI integration

```
ApplicationContainer
  └── ConfiguredScheduleModule (ScheduleModule.forRoot(config))
        ├── ScheduleService
        ├── ScheduleService.TOKEN (useExisting)
        └── 'SCHEDULE_CONFIG' (useValue)
```

Same pattern as `AuthModule` and `QueueModule`. The service is
registered under both tokens so users can inject with either.

## 11. CLI integration

`nx make:schedule <Name>` generates:

- `src/schedule/tasks/<name>.task.ts` — `@Injectable` skeleton with
  example `@Cron` / `@Interval` / `@Timeout` handlers.

The template wraps handlers in best-practice comments (TS hints,
boilerplate) so the user knows where to put their code.

## 12. Testing

- **Unit tests** for the cron parser (aliases, names, ranges, next()).
- **Unit tests** for the memory backend (registration, tick,
  pause/resume, error handling).
- **Integration tests** for `ScheduleService` DI under both tokens.
- **Integration tests** for `@Cron` / `@Interval` / `@Timeout` via
  `scanForSchedulers`.

Cloudflare behavior is tested at the Cloudflare SDK level — we
don't re-test what we wrap.

## 13. Known issues

### Cron timezone

Currently the host's local timezone. IANA TZ support via the
`options.timezone` parameter is parsed but not yet applied — the
parser uses local-time `Date` methods. v0.2 will switch to
`Intl.DateTimeFormat` for proper TZ math.

### Interval drift

`setInterval` is approximate (~10ms in Bun, more on Node). Long-
running handlers can let the next tick fall behind. `maxDriftMs`
(default 60s) caps how far we let a task run; once exceeded, we
reschedule the next run for `now + 60s` instead of chasing the
missed slot.

### Cloudflare no intervals

Already covered. Documented in the user guide.

## 14. Future work

- **IANA timezone** — proper support in the parser.
- **Distributed locks** — for multi-instance deployments, only one
  instance should run a cron task at a time. Use Redis SETNX or a
  Durable Object.
- **Snooze / reschedule** — runtime APIs to shift a task's next-run
  time (e.g. "run in 5 minutes").
- **History** — persist task execution history (last run, last
  error, duration) to a DB for debugging.
- **Webhooks** — when a task fails N times in a row, POST to a
  configured URL.

## 15. See also

- [`schedule.md`](../user-guide/schedule.md) — user guide
- [`@nestjs/schedule`](https://docs.nestjs.com/scheduling)
- [`queue.md`](../user-guide/queue.md) — sibling design doc (same pattern)
- [`events.md`](../user-guide/events.md) — emit from scheduled tasks
