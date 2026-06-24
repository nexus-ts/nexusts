# @nexusts/schedule

> **NexusTS** — Bun-native fullstack framework

## Description

Cron scheduling (`@Cron` / `@Interval` / `@Timeout`).

In-tree cron parser (no `cron` / `node-cron` peer dep). Decorator-based
with auto-scanning — no manual registration needed.

## Install

```bash
bun add @nexusts/schedule
```

## Quick start

```ts
// app.module.ts
import { Module } from '@nexusts/core';
import { ScheduleModule } from '@nexusts/schedule';

@Module({
  imports: [ScheduleModule.forRoot({ backend: 'memory' })],
})
export class AppModule {}
```

```ts
// app/tasks/cleanup.task.ts
import { Injectable } from '@nexusts/core';
import { Cron } from '@nexusts/schedule';

@Injectable()
export class CleanupTask {
  @Cron('0 * * * *')      // every hour — auto-detected at boot
  async hourly() {
    // cleanup logic
  }
}
```

No manual `scanForSchedulers()` or `start()` call needed.
`ScheduleModule` auto-scans every resolved provider during
`Application.bootstrap()`.

## API

| Export | Purpose |
|--------|---------|
| `ScheduleModule` | `forRoot(config)` — configure and import |
| `ScheduleService` | Programmatic `addCron` / `addInterval` / `addTimeout` |
| `@Cron(expr, opts?)` | Schedule a method on a cron expression |
| `@Interval(ms, name?)` | Run a method every N ms |
| `@Timeout(ms, name?)` | Run a method once after N ms |
| `CronExpr` | Parse and test cron expressions |
| `MemorySchedulesBackend` | In-process backend (Bun / Node) |
| `CloudflareSchedulesBackend` | Workers Cron Triggers backend |

## Peer dependencies

None. In-tree cron parser; no `cron` or `node-cron` needed.

## License

MIT — see the root [LICENSE](../../LICENSE).
