# Schedule 모듈 설계

> 최종 업데이트: v0.1
> English version: [`schedule.md`](./schedule.md)

## 1. 목표

인프로세스 스케줄러(Bun / Node) 또는 Cloudflare Cron Triggers
(Workers) 위에 NestJS 스타일의 `@Cron` 데코레이터 API를 제공한다. 사용자 코드는 동일하며 런타임만 다르다.

## 2. 왜 래핑하는가 (자체 작성 X)?

신뢰할 수 있는 스케줄러는 API가 제안하는 것보다 더 많은 부분이 있다.

| 관심사 | 자체 작성 시 위험 |
| ------- | ---------------------- |
| Cron 표현식 파싱 | 요일 off-by-one; `*`와 범위 처리 오류 |
| 다음 실행 시각 계산 | 윤년, 월 wrap, 시간대 수학 오류 |
| 드리프트 보정 | `setInterval`가 블록되면 작업이 쌓임 |
| 일시정지/재개 시맨틱 | `clearInterval`로 정확히 모델링하기 어려움 |
| 크로스 런타임 지원 | Workers에 `setInterval` 없음 |
| 가시성 | `nx route:list` 스타일 인스펙션이 임시방편이 됨 |

작은 **커스텀 cron 파서**(외부 의존성 없음)와 균일한 **`ScheduleRegistry` 인터페이스**를 제공하여 사용자 코드가 어느 백엔드도 직접 다루지 않도록 한다.

## 3. 아키텍처

```
┌──────────────────────────────────────────────────────────────┐
│                      사용자 코드                              │
│   @Cron('0 * * * *') onMethod() { /* ... */ }               │
│   schedule.addInterval(ms, fn)                               │
└──────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌──────────────────────────────────────────────────────────────┐
│              nexus/schedule  (별도 진입점)                    │
│                                                              │
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────┐ │
│  │ ScheduleService  │  │ @Cron            │  │ scanFor-     │ │
│  │ (DI facade)      │  │ @Interval        │  │ Schedulers() │ │
│  │                  │  │ @Timeout         │  │              │ │
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

파사드(`ScheduleService`)는 사용자 코드가 대화하는 유일한 대상이다. 백엔드는 교체 가능; `nx.config.ts`의 `backend: 'memory'`를 `'cloudflare'`로 변경해도 컨트롤러는 손대지 않는다.

## 4. 모듈 분리

`nexus/schedule`는 별도 진입점이다.

```json
"exports": {
  ".":         { ... },
  "./cli":     { ... },
  "./auth":    { ... },
  "./queue":   { ... },
  "./schedule":{ ... },
  "./events":  { ... }
}
```

빌드 스크립트는 `src/schedule/index.ts`를 `dist/schedule/` 아래 자체 아티팩트로 번들한다. 런타임 peer 의존성 없음 — cron 파서가 트리에 포함된다.

## 5. Cron 파서

`src/schedule/cron-parser.ts`가 구현:

- **5필드 crontab** — 분, 시, 일, 월, 요일
- **6필드 변형** — 앞에 초 추가
- **별칭** — `@yearly`, `@annually`, `@monthly`, `@weekly`,
  `@daily`, `@midnight`, `@hourly`
- **`@every Nd/Nh/Nm/Ns`** — 균일 간격
- **와일드카드** — `*`, `1-5`, `1,3,5`, `*/2`
- **이름** — `JAN-DEC`, `SUN-SAT` (대소문자 무시)

`next(from)`은 `from`부터 앞으로 가며, 매치하지 않는 월/일/시를 빠르게 건너뛴다. 일과 요일은 표준 crontab 규칙에 따라 OR: 둘 다 제한되면 **어느 한쪽**이라도 매치하면 그 날짜는 매치.

```ts
parseCron('0 9 * * 1-5').next(new Date('2026-06-15T08:00:00Z'));
// → 2026-06-15T09:00:00 (월요일)  또는 다음 평일 9시
```

`croner`나 `node-cron`을 가져오지 않고 트리에 파서를 포함시키는 이유:

- 번들 크기 작게 유지
- `better-auth`의 의존성과 버전 차이 없음
- 파서가 우리 시맨틱과 정확히 일치

## 6. 레지스트리 인터페이스

모든 백엔드가 구현:

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

Cloudflare별 필드(예: cron 트리거 이름)는 의도적으로 **생략** — `ScheduleConfig.cloudflare`로 간다.

## 7. 인프로세스 백엔드

`MemorySchedulesBackend`:

- **Cron 작업** — `Map`에 보관, `tickMs`마다(기본 1s) 스캔. 매치 시 `#runTask`로 디스패치.
- **Interval 작업** — `setInterval`. `maxDriftMs`(기본 60s)에서 드리프트 제한.
- **Timeout 작업** — `setTimeout`. 실행 후 자동 제거.
- **Pause** — `clearInterval`/`clearTimeout` + 상태 플래그.
- **Stop** — 모든 타이머 정리, 맵 비우기.

틱 인터벌은 `unref()`되어 테스트에서 프로세스를 활성 상태로 유지하지 않는다.

## 8. Cloudflare 백엔드

`CloudflareSchedulesBackend`:

- **Cron 작업** — 로컬에 등록 (`nx route:list` 인스펙션용). 실제 실행은 플랫폼의 Cron Triggers(`wrangler.toml: [[triggers.crons]]`)에서 발생.
- **Interval / timeout** — **등록 시 throw**. Workers에 `setInterval`/`setTimeout` 없음. 짧은 간격에는 `@every <duration>`을, 일회용은 요청 핸들러에서 실행해야 함.
- **`scheduledHandler()`** — Worker의 `scheduled()` export. 트리거의 `event.cron`과 일치하는 등록된 작업으로 디스패치.

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

## 9. 데코레이터 API

`@Cron(expr, options)`, `@Interval(ms)`, `@Timeout(ms)`가 `reflect-metadata`로 클래스 메타데이터에 쓴다. `scanForSchedulers`가 메타데이터를 읽고 메서드를 호출:

```ts
@Injectable()
class CleanupTask {
  @Cron('0 * * * *')
  async hourly() {}
}

const task = new CleanupTask();
const ids = await scanForSchedulers(task, schedule);
```

`Application.start()`에 자동 연결하지 않는 이유는 워커가 사용자가 수동으로 resolve해야 하는 자식 컨테이너에 있을 수 있기 때문. 미래 릴리스에서 추가될 예정.

## 10. DI 통합

```
ApplicationContainer
  └── ConfiguredScheduleModule (ScheduleModule.forRoot(config))
        ├── ScheduleService
        ├── ScheduleService.TOKEN (useExisting)
        └── 'SCHEDULE_CONFIG' (useValue)
```

`AuthModule` 및 `QueueModule`과 같은 패턴. 서비스는 두 토큰 모두에 등록되어 어느 쪽으로든 주입 가능.

## 11. CLI 통합

`nx make:schedule <Name>`가 다음을 생성:

- `src/schedule/tasks/<name>.task.ts` — 예시 `@Cron` / `@Interval` / `@Timeout` 핸들러가 포함된 `@Injectable` 스켈레톤.

템플릿은 핸들러를 베스트 프랙티스 주석(TS 힌트, 보일러플레이트)으로 감싸 사용자가 어디에 코드를 넣을지 알게 한다.

## 12. 테스트

- **단위 테스트** cron 파서 (별칭, 이름, 범위, next()).
- **단위 테스트** 메모리 백엔드 (등록, 틱, pause/resume, 에러 처리).
- **통합 테스트** `ScheduleService` DI (두 토큰).
- **통합 테스트** `@Cron` / `@Interval` / `@Timeout` via `scanForSchedulers`.

Cloudflare 동작은 Cloudflare SDK 레벨에서 테스트 — 우리가 래핑하는 것을 다시 테스트하지 않음.

## 13. 알려진 이슈

### Cron 시간대

현재 호스트의 로컬 시간대. `options.timezone` 매개변수를 통한 IANA TZ 지원은 파싱되지만 아직 적용되지 않음 — 파서가 로컬 시간 `Date` 메서드를 사용. v0.2에서 적절한 TZ 수학을 위해 `Intl.DateTimeFormat`으로 전환 예정.

### Interval 드리프트

`setInterval`는 근사치(Bun에서 ~10ms, Node에서 더 큼). 장기 실행 핸들러가 다음 틱을 뒤처지게 할 수 있다. `maxDriftMs`(기본 60s)가 작업이 실행될 수 있는 한도를 제한; 초과 시 놓친 슬롯을 쫓지 않고 `now + 60s`로 다음 실행을 재예약.

### Cloudflare intervals

이미 다룸. 사용자 가이드에 문서화.

## 14. 향후 작업

- **IANA 시간대** — 파서에서 적절한 지원.
- **분산 락** — 다중 인스턴스 배포를 위해 한 인스턴스만 cron 작업을 실행. Redis SETNX 또는 Durable Object 사용.
- **Snooze / reschedule** — 작업의 다음 실행 시각을 이동하는 런타임 API (예: "5분 후 실행").
- **History** — 작업 실행 이력을 DB에 저장 (마지막 실행, 마지막 에러, 소요 시간) 디버깅용.
- **Webhooks** — 작업이 N회 연속 실패 시 구성된 URL로 POST.

## 15. 참고

- [`schedule.md`](../user-guide/schedule.md) — 사용자 가이드
- [`@nestjs/schedule`](https://docs.nestjs.com/scheduling)
- [`queue.md`](../user-guide/queue.md) — 같은 패턴의 자매 설계 문서
- [`events.md`](../user-guide/events.md) — 스케줄 작업에서 이벤트 발생
