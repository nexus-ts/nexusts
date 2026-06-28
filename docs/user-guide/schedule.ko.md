# Schedule · `@Cron` 데코레이터와 스케줄 작업

> English version: [`schedule.md`](./schedule.md)

NexusTS는 `@nestjs/schedule`를 본뜬 `@nexusts/schedule` 모듈을 제공한다.

- `@Cron(expression)` 데코레이터 — cron 스케줄로 메서드 실행.
- `@Interval(milliseconds)` — N ms마다 실행.
- `@Timeout(milliseconds)` — N ms 후 한 번 실행.
- **Cron 파서** — 표준 5필드 crontab + 초 포함 6필드 + 별칭
  (`@daily`, `@hourly`, ...) + `@every <duration>`.
- **두 백엔드** — 인프로세스 (Bun)와 Cloudflare Cron Triggers.

schedule 모듈은 **`@nexusts/core`와 분리**되어 있으며 자체 번들 진입점으로 제공된다.

---

## 1. 빠른 시작

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
import { Injectable } from '@nexusts/core';
import { Cron, Interval } from '@nexusts/schedule';

@Injectable()
export class CleanupTask {
  @Cron('0 * * * *')                     // 매시
  async hourly() {
    await deleteStaleSessions();
  }

  @Interval(60_000)                     // 매분
  async heartbeat() {
    await pingHealthcheck();
  }
}
```

**자동 스캔이 내장되어 있다.** `ScheduleModule`은 부트 시 모든
provider 인스턴스에서 `@Cron` / `@Interval` / `@Timeout` 데코레이터를
자동으로 감지한다. `scanForSchedulers`나 `start()` 호출이 필요 없다:

```ts
// app/main.ts — 스케줄 관련 코드 전혀 없음
import { Application } from '@nexusts/core';
import { AppModule } from './app.module.js';

const app = new Application(AppModule, { logging: true });
await app.listen();
```

---

## 2. Cron 표현식

| 표현식 | 의미 |
| ---------- | ------- |
| `* * * * *` | 매분 |
| `0 * * * *` | 매시 (0분에) |
| `*/15 * * * *` | 15분마다 |
| `0 9 * * 1-5` | 평일 9시 |
| `0 0 1 * *` | 매월 1일 |
| `30 14 1 4 *` | 4월 1일 14:30 |
| `@yearly`, `@annually` | 0 0 1 1 * |
| `@monthly` | 0 0 1 ** |
| `@weekly` | 0 0 ** 0 |
| `@daily`, `@midnight` | 0 0 ** * |
| `@hourly` | 0 **** |
| `@every 1h30m` | 90분마다 |
| `@every 30s` | 30초마다 |

필드 이름도 지원된다: `JAN-DEC` (월), `SUN-SAT` (요일),
대소문자 구분 없음. 범위 (`1-5`), 리스트 (`1,3,5`), 단계 (`*/2`) 모두 지원.

더 세밀한 제어를 위해 6필드 변형(초 포함) 사용:
`0 0 9 * * MON` = 월요일 9:00:00.

---

## 3. 데코레이터

### `@Cron(expression, options?)`

```ts
@Cron('0 9 * * 1-5', { timezone: 'UTC' })
async weekdayMorning() {
  // ...
}
```

옵션:

| 키 | 기본값 | 의미 |
| --- | ------- | ------- |
| `name` | 메서드 이름 | `ScheduleService.list()`의 표시 이름 |
| `timezone` | 호스트 로컬 | 스케줄의 IANA TZ |
| `runOnInit` | `false` | 등록 시 즉시 실행 |

### `@Interval(milliseconds, name?)`

```ts
@Interval(60_000)
async tick() { /* ... */ }
```

### `@Timeout(milliseconds, name?)`

```ts
@Timeout(5_000)
async startup() { /* 등록 후 5초 뒤 실행 */ }
```

---

## 4. 프로그래매틱 API

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

    // 인스펙션
    console.log(this.schedule.list());   // 모든 작업
    console.log(this.schedule.get('hourly'));   // 이름 또는 id로

    // 변경
    this.schedule.pause('hourly');
    this.schedule.resume('hourly');
    this.schedule.delete('hourly');
  }
}
```

`addCron`/`addInterval`/`addTimeout`은 할당된 id를 반환한다.

---

## 5. Cloudflare 백엔드

```ts
ScheduleModule.forRoot({ backend: 'cloudflare' });
```

`CloudflareSchedulesBackend`는 **등록 전용**이다: 작업은 인스펙션을 위해 로컬에 저장되지만, 실제 실행은 플랫폼 레벨에서 Cron Triggers로 발생한다.

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

핸들러는 트리거의 cron과 표현식이 일치하는 등록된 작업으로 디스패치한다. **Workers는 `setInterval` / `setTimeout`을 지원하지 않는다** — 짧은 간격의 cron (예: `@every 30s`)을 사용하거나 요청 핸들러에서 작업을 실행한다.

---

## 6. 라이프사이클

스케줄러는 `Application.bootstrap()` 중에 자동으로 시작된다.
별도의 `start()` 호출이 필요 없다. 각 등록된 작업은
`setInterval`(interval/timeout)을 받거나 다음 cron 매치에서
디스패치된다. `stop()`으로 정리한다:

```ts
// 수동 제어 (자동 시작을 원하지 않는 경우)
const schedule = app.container.resolve(ScheduleService);
await schedule.stop();
```

구독할 수 있는 이벤트:

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

## 7. 설정

```ts
ScheduleModule.forRoot({
  backend: 'memory',             // 또는 'cloudflare'
  defaultTimezone: 'UTC',
  memory: {
    tickMs: 1000,                // 기본값
    maxDriftMs: 60_000,          // 이만큼 뒤처지면 작업 건너뜀
  },
});
```

장기 실행 서버에서는 `tickMs`를 ~1000ms(기본값)로 설정하여 분 단위 정밀도의 작업을 처리하거나, 덜 빈번한 스케줄에서는 더 높게 설정한다.

---

## 8. CLI: `nx make:schedule`

```bash
nx make:schedule HourlyCleanup
nx make:schedule DailyDigest
```

`@Cron` / `@Interval` / `@Timeout` 핸들러를 받을 준비가 된 스켈레톤 클래스와 함께 `app/schedule/tasks/<name>.task.ts`를 생성한다.
데코레이터는 부트 시 자동 감지되므로 별도의 수동 등록이 필요 없다.

---

## 9. 이벤트와의 통합

스케줄된 작업은 실행될 때 이벤트를 발생시킬 수 있다.

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

## 10. 테스트

```ts
const backend = new MemorySchedulesBackend({ tickMs: 50 });
let fired = 0;
backend.addInterval('tick', 30, () => void fired++);
backend.start();
await new Promise((r) => setTimeout(r, 120));
await backend.stop();
expect(fired).toBeGreaterThanOrEqual(2);
```

DI 통합 테스트의 경우 기본 메모리 백엔드를 사용한다.

```ts
@Module({ imports: [ScheduleModule.forRoot()] })
class TestModule {}

const app = new Application(TestModule);
const schedule = app.container.resolve(ScheduleService);
```

---

## 11. 알려진 이슈

- **`setInterval` 드리프트** — Bun의 `setInterval`은 ~10ms 정확도; 분 단위 정밀도 스케줄은 약간 드리프트할 수 있다. `maxDriftMs` 설정이 작업이 뒤처질 수 있는 한도를 제한한다.
- **Cron 시간대** — 현재 호스트의 로컬 시간대. 적절한 IANA TZ 지원은 v0.2에서 예정.
- **Cloudflare intervals** — Workers는 `setInterval`을 지원하지 않는다. 대신 `@every <duration>`을 사용하라 (cron 표현식으로 변환됨).

---

## 12. 참고

- [`../design/schedule.md`](../design/schedule.md) — 아키텍처
- [`@nestjs/schedule`](https://docs.nestjs.com/scheduling) — 영감
- [`./events.md`](./events.md) — 스케줄 작업에서 이벤트 발생
- [`./cli.md`](./cli.md) — `nx make:schedule` 레퍼런스
