# Changelog

All notable changes to NexusTS are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

> 영문으로 작성된 문서가 필요하면 [`CHANGELOG.md`](./CHANGELOG.md)를 참고하세요.

---

## [Unreleased]

### 추가

- (없음)

### 수정

- (없음)

---

## [0.8.4] — 2026-06-24

### 추가

- **Inertia 스캐폴드 템플릿**: `nx init`/`nx new` 명령이 Inertia
  React/Vue 페이지 컴포넌트(`resources/js/Pages/Welcome.tsx` 또는
  `Welcome.vue`)와 클라이언트 진입점(`resources/js/app.tsx`/`app.ts`),
  SSR 어댑터 설정을 자동 생성합니다.
- **`InertiaConfig.scripts`**: HTML shell에 클라이언트 `<script>` 태그를
  주입하는 새 설정 옵션. 스캐폴드가 `scripts: ['/static/app.js']`로
  자동 설정합니다.

### 수정

- **Inertia v3 프로토콜 호환**: 초기 페이지 데이터를 v2 방식
  `<div id="app" data-page="...">` 대신
  `<script data-page="app" type="application/json">`로 내장합니다.
- **Inertia SSR 어댑터 설정**: `container.resolve()` (모듈 provider가
  자식 컨테이너에 있어 실패) 대신 모듈 provider에서 직접
  `new Inertia()`를 생성하도록 수정.
- **`--no-interaction` 플래그**: `parseArgs`가 `flags.interaction = false`로
  저장하지만 `flagBool`이 `flags["no-interaction"]`을 확인하여 작동하지
  않던 문제 수정.
- **CLI 입력 검증**: 플래그 값이 허용된 옵션 목록에 없으면 비대화형
  모드에서 오류와 함께 종료, 대화형 모드에서 재입력.
- **`mergePackageJson()`**: Inertia 뷰 엔진으로 전환 시
  `build:frontend` 스크립트와 `dev` 스크립트를 자동 추가.

### 변경

- **CLI 스캐폴드 리팩토링**: `init.ts`/`new.ts`의 템플릿 생성 로직을
  `packages/cli/src/core/scaffold.ts`로 추출, ~400줄 중복 제거.
- **Inertia 의존성**: `@inertiajs/react` → `^3.0.0`,
  `@inertiajs/vue3` → `^3.0.0`.
- **모든 분석 문서**: 기준 버전 v0.8.4로 업데이트.

---

## [0.8.3] — 2026-06-24

### 수정

- **CI 워크플로우**: 4개 모두 통과. typecheck exclude, lint 수정,
  benchmarks JSON 파싱/회귀 검사 수정, Node.js 22 설정 동기화.
- **3개 TS 오류 수정**: feature-flag, gRPC, resilience store.

---

## [0.8.2] — 2026-06-24

### 추가

- **gRPC 스트리밍** (`@GrpcServerStream`, `@GrpcClientStream`,
  `@GrpcBidiStream`): server/client/bidirectional streaming 지원.
  `examples/34-grpc-streaming` 예제.
- **멀티 런타임 CI**: Bun, Node.js 22, Drizzle dialect, CF Workers.
- **벤치마크 스위트**: `benchmarks/bench.ts` — NexusTS vs Hono.

### 수정

- **CI 워크플로우**: lint, Node.js 22 vitest 설정, BUN_BIN 경로,
  Workers smoke test, Drizzle dialect 테스트 제외.
- **전체 314개 테스트 통과** (18개 파일).

---

## [0.8.1] — 2026-06-24

### 추가

- **Cross-pod 서킷 브레이커 스토어** — `ResilienceStore` 인터페이스:
  - `RedisResilienceStore`: Redis로 pod 간 회로 상태 공유
  - `DrizzleResilienceStore`: Drizzle DB 기반 영구 저장
  - `MemoryResilienceStore`: 기본 in-process 스토어
  `syncIntervalMs` 설정 가능. 최신 업데이트 기준 충돌 해결.
  스토어 오류 시 로컬 상태로 폴백 (비치명적).

---

## [0.8.0] — 2026-06-24

### 추가

- **`ResilienceAdminModule`** — 회로 차단기/벌크헤드 HTTP Admin
  엔드포인트 5개 (목록 조회, force-open/close, reset).
- **Eager `applyResilience()`**: `@Retry`/`@CircuitBreaker`/
  `@Bulkhead`/`@Resilient` 데코레이터가 컨트롤러 마운트 시
  자동 래핑됨 — `svc.retry()` 수동 호출 불필요.
- **한글 publishing 문서**: `README.ko.md`, `local-publish.ko.md`,
  `npm-rate-limit.ko.md` 추가.

### 변경

- **저장소 이관**: `nexus-ts/nexusts`.
- 버전 0.7.x → 0.8.0.

---

## [0.7.9] — 2026-06-24

### 추가

- **GitHub 저장소 메타데이터**: 모든 32개 package.json에
  `repository`, `homepage`, `bugs` 필드 추가.

### 수정

- **Bun 데코레이터 진단**: stage-3 decorator 모드 충돌 시
  개선된 오류 메시지.
- **`@Arg` 시그니처 문서**: `@Arg("name", { type: "String!" })` →
  `@Arg("name", "String!")`로 수정.
- **영문 문서 동기화**: Bun 데코레이터 경고를 영문
  `controllers.md`에 추가.

---

## [0.7.8] — 2026-06-24

### 변경

- **저장소 이관**: `kabyeon/nexusts` → `nexus-ts/nexusts`.
  모든 URL, 문서, package.json, git remote 업데이트.

---

## [0.7.7] — 2026-06-24

### 추가

- **GraphQL code-first SDL 합성** (`autoSchema: true`):
  `@Resolver`/`@Query`/`@Mutation` 데코레이터에서 SDL 자동 생성.
  `@Arg` 타입 별칭 지원 (`string` → `String`, `int` → `Int` 등).
  `extend type` 병합, 리졸버 자동 인스턴스화.

### 수정

- **`create-nexusts` → `nx init`**: `mergePackageJson()`이
  `devDependencies`도 처리하도록 수정 — `drizzle-kit` 누락 해결.
- **`nx make:crud` 다음 단계**: `bun --hot app/main.ts` →
  `bun run dev`, `&` → `&&`.

### 변경

- **Publish 배치 중단 시간**: 10s → 5s로 단축.

---

## [0.7.6] — 2026-06-24

### 추가

- **Global `@Resolver` 클래스 레지스트리**: `@Resolver()` 데코레이터만
  붙이면 GraphQL 리졸버가 자동 등록됨 — 모듈 providers 배열에만 추가하면 됨.
- **`nx init` / `nx new` 개선**:
  - ORM이 drizzle일 때 `drizzle.config.ts` 자동 생성
  - `drizzle-kit ^0.31.0` devDependencies에 자동 추가
  - 선택한 dialect에 따라 DB 드라이버(`pg`, `mysql2`, `better-sqlite3`)
    자동 추가

### 수정

- **`nx init` / `nx new`**: `drizzle.config.ts` 누락으로 `db:generate`/
  `db:migrate` 실패 — 이제 처음부터 생성.
- **`nx db:generate` 도움말**: `make:migration`과의 차이점 명확화.

---

## [0.7.5] — 2026-06-24

### 추가

- **Circuit breaker admin API**: `ResilienceService.listCircuits()` /
  `listBulkheads()`, `CircuitBreaker.metrics()` / `forceOpen()` /
  `forceClose()` / `reset()`. 회로와 벌크헤드를 런타임에 검사하고
  수동 제어. `CircuitMetrics` 타입으로 모니터링 (상태, 실패율,
  half-open 전환까지 남은 ms 등).
- **`nx make:repository` 명령어** (별칭: `mr`, `make-repo`):
  `app/repositories/` 아래 `DrizzleRepository` 클래스 생성.

### 수정

- **`nx make:service`**: `snake` 컨텍스트 변수 누락으로 import와
  `eq()` 호출이 깨짐 (`eq(.id, id)` → `eq(user.id, id)`).
- **`nx db:seed`**: 모노레포 내부 상대경로(`./src/drizzle/...`)
  사용 → `@nexusts/drizzle`, `@nexusts/logger`로 변경.
- **`nx route:list`**: 컨트롤러 프리픽스 메타데이터 키 오류
  (`nexus:controller:prefix` → `nexus:controller`).
  `GET /:id` → `GET /posts/:id`로 수정.
- **`nx make:model` (bun-sqlite)**: `createdAt` 기본값이 리터럴
  문자열 `(datetime('now'))`로 저장되던 문제를
  `$defaultFn(() => new Date().toISOString())`으로 수정.
- **`SeedContext` 타입**: 시드 템플릿에서 참조만 하고 정의되지
  않았음. `@nexusts/cli` 코어에서 export.

---

## [0.7.4] — 2026-06-24

### 추가

- **Logger 사용자 가이드**: `docs/user-guide/logger.md` + `logger.ko.md` —
  Logger 모듈의 Pino, pretty-print, request-scoped logging, transport 설정
  가이드.
- **Logger: pino 직접 의존성으로 변경** — 사용자가 `bun add pino`를
  별도로 실행할 필요 없음. `@nexusts/logger` 설치만으로 바로 사용 가능.
  `pino-pretty`는 컬러 출력용 선택 사항으로 유지.
- **CLI REPL 개선**:
  - 배너에 `.help` 힌트 추가
  - 버전을 package.json에서 동적으로 읽도록 개선 (`v0.7.4`)
  - 버전 문자열 길이에 따라 자동 정렬 (어떤 버전이어도 표 깨짐 없음)
  - `.routes`에 핸들러 클래스.메소드 출력 (예: `HomeController.index`),
    `nx route:list`와 동일한 형식
  - `.services`가 더 이상 "(no services registered)" 표시하지 않음
    (`DIContainer`에 `listProviders()` 메서드 추가)
  - `.modules`가 모듈 클래스 이름을 표시 (`moduleClass` 필드 추가)

### 수정

- **CLI REPL preload 경로**: `../../drizzle/...` 상대경로를 npm 패키지명
  (`@nexusts/drizzle` 등)으로 변경. npm 설치 환경에서도 `logger`, `db`,
  `cfg`, `cache`, `events` 가 정상 주입됨.
- **Schedule 핫리로드**: `ScheduleService` 가 `module.hot.dispose()` 핸들러를
  등록하여 Bun `--hot` 리로드 시 모든 타이머를 정리 (크론 중복 실행 방지).
- **`.d.ts` 생성 수정**: 11개 패키지의 타입 선언 실패 해결:
  - `cache`, `limiter`, `session`: `../../drizzle/...` → `@nexusts/drizzle`
  - `cli/init.ts`: `PlanEntry.mode`에 `as const` 추가
  - `drizzle/drivers`: `loadMigrator` async 래퍼; `logger` 옵션 캐스트
  - `sse`: `HonoSSEApi.sleep()` 반환타입 `Promise<unknown>`
- **CI publish 워크플로우**: 대기시간 30s/10min → 3s/10s로 단순화

## [0.7.3] — 2026-06-23

### 추가

- **Exception Filters**: `@UseFilters()`, `HttpException`, `ExceptionFilter`
  인터페이스 — HTTP 에러를 캐치하여 응답 변환.
- **Interceptors**: `@UseInterceptors()`, `LoggingInterceptor`,
  `TimeoutInterceptor` — 파이프라인 인터셉션 (onion composition).
- **HTTP Guards**: `@UseGuards()`, `AuthGuard`, `RolesGuard`,
  `createHttpGuard()` — 선언적 요청 보호.
- **Lifecycle Hooks**: `OnModuleInit`, `OnApplicationInit`,
  `OnModuleDestroy`, `OnApplicationShutdown` — 정해진 순서로
  startup/shutdown 실행.
- **`@Global()` decorator**: 모듈을 전역 스코프로 표시 — import 없이
  모든 모듈에서 provider 사용 가능.
- **Router 통합 테스트**: `@Body("field")` 파라미터 추출, `@Param`/`@Query`/
  `@Headers`, guards, filters, 응답 직렬화, DI 배선 등 17개 테스트.
- **Application 생명주기 테스트**: 미들웨어 순서, bootstrap/shutdown,
  idempotency 등 10개 테스트.
- `@nexusts/drizzle`: `Entity` decorator + `generateMigrations()` /
  `pushSchema()` export + Zod 스키마 생성 헬퍼.
- **End-to-end 검증 앱** `../blog-app/` (sibling repo) 추가. 실제
  SQLite 데이터베이스에 실제 auth, CRUD, 마크다운 렌더링 검증.
  23개 endpoint 검증 스크립트 (`scripts/test-api.sh`) 포함.
- `@nexusts/crypto`: standalone 헬퍼 함수 export —
  `scryptHash()`, `scryptVerify()`, `hash()`, `verify()`.
- `@nexusts/drizzle`: `select<T>()` / `insert<T>(table)` / `update<T>(table)` /
  `delete<T>(table)` generic 지원 — `select(...).from(table).all()` 타입 추론.
- **Build pipeline**: `tsc --emitDeclarationOnly` 로 `.d.ts` emit.
- **새 user-guide**: `docs/user-guide/common-pitfalls.md` +
  `common-pitfalls.ko.md` — 10가지 자주 하는 실수와 해결책.
- **새 분석**: `docs/analysis/wasp-comparison.md` +
  `wasp-comparison.ko.md` — Wasp와 비교 분석.

### 수정

- **Core framework 버그 (blog-app 개발 중 발견)**:
  - `@Body("field")` 파라미터 추출 (router.ts)
  - `listen()` 중복 시작 (bootstrap에서 server.start() 제거)
  - 미들웨어 순서 (`ApplicationOptions.middleware[]` 라우트보다 먼저 등록)
  - `require()` → static import (server.ts)
- **CLI 템플릿**:
  - 모든 import 경로 수정 (`@nexusts/core` → `../core/index.js`)
  - `init.ts`/`new.ts`: package.json deps, DrizzleModule, StaticModule 조건부
  - `make:crud`: `findOne(id)` → `findOne(eq(...))`, `DrizzleService` 주입
  - `make-schedule.ts`: `scanForSchedulers` 제거
  - `drizzle-dialect.ts`: bun-sqlite text timestamps, `defaultTs`/`defaultTsUpdate`
- **Schedule 자동 스캔**: `ScheduleService.onApplicationInit()` 자동 시작;
  `Application.bootstrap()` 가 `setScheduleScanner` hook으로 provider 스캔.
- **Cron-parser next() 오프셋**: 5필드 표현식이 +1s가 아닌 +1m에서 시작;
  `* * * * *`가 매초 실행되던 버그 수정.
- `Inertia` published package에서 import 불가 — `package.json` `exports`에
  `./inertia` subpath 추가.

## [0.7.0] — 2026-06-22

### 추가

- `@nexusts/resilience` — 재시도 + circuit breaker +
  bulkhead를 단일 DI 싱글톤으로 제공. `retry()` 함수 (4가지
  백오프 전략: constant, linear, exponential, exponential-jitter).
  `CircuitBreaker` 클래스 (closed/open/half-open 상태 머신,
  롤링 실패 윈도우, threshold + `isFailure` predicate,
  `onStateChange` 훅). `Bulkhead` 클래스 (FIFO 동시성 제한기,
  `rejectOnFull` fail-fast). `ResilienceService`는
  `getOrCreateCircuit(name)` / `getOrCreateBulkhead(name)` 레지스트리
  제공 — "stripe"용 단일 circuit이 모든 코드 경로에서 공유됨.
  `@Retry` / `@CircuitBreaker` / `@Bulkhead` / `@Resilient` 메서드
  데코레이터 (metadata-only; legacy decorator tsconfig 사용자는
  `applyResilience()` 호출로 수동 래핑 가능).
- `examples/33-resilience-calls` — 3개 라우트, 프리미티브별 하나씩,
  plus `tests/resilience/resilience.test.ts` 테스트
  (20개 테스트: backoff, 상태 머신, FIFO 순서).
- `docs/user-guide/resilience.md` + `.ko.md` — 사용자 가이드.
- `docs/design/resilience.md` + `.ko.md` — 아키텍처 심층 분석.

### 참고

- 새 런타임 의존성 없음 — 순수 TypeScript.
- `@Retry` / `@CircuitBreaker` / `@Bulkhead` / `@Resilient`
  데코레이터는 v0.7.0에서 **metadata-only**입니다.

## [0.6.9] — 2026-06-22

### 추가

- `@nexusts/graphql` — SDL-first GraphQL 엔드포인트.
  `GraphQLService` + `GraphQLModule`. `POST /graphql`,
  `GET /graphql?query=...`, `GET /graphql/schema`, 번들 내
  GraphiQL 플레이그라운드 제공. `context()` 팩토리로
  리졸버에 per-request 상태 주입. `@Resolver` / `@Query` /
  `@Mutation` / `@Subscription` / `@Arg` 데코레이터 export.
- `examples/32-graphql-hello` — 최소 hello-world 예제 +
  `tests/graphql/graphql.test.ts` (15개 테스트).
- `docs/user-guide/graphql.md` + `.ko.md` — 사용자 가이드.
- `docs/design/graphql.md` + `.ko.md` — 아키텍처 심층 분석.

### 참고

- `graphql` (peer-dep)은 **번들링되지 않음**. `bun add graphql`로 설치.

## [0.6.8] — 2026-06-22

### 추가

- `examples/` 아래 27개 동작 예제 추가 — 모듈당 하나, 기본 MVC부터
  gRPC / tracing / request-scope까지. 각 예제는 자체 `README.md` 를
  가지며 `cd examples/NN-name && bun main.ts` 로 실행 가능.
- `tests/examples/smoke.test.ts` — 각 예제를 실제 Bun 서브프로세스로
  실행하고 "listening" 마커를 기다린 뒤 정상 종료를 확인하는 vitest
  슈트. 55개 테스트가 약 2초 안에 실행됨.
- `docs/user-guide/testing-examples.md` + `.ko.md` — smoke test runner
  가이드 (예제별 tsconfig stub, 순차 포트 할당, 환경 격리).

### 수정

- `01-basic-mvc`에 `@Module` 래퍼가 빠져있었음 — `Application(HelloController)`
  가 scanner에서 거부됨.
- `02-routing-styles`가 `app.container.resolve(AdonisStyle)` 를 호출했으나
  `app.container` 는 root 모듈 providers만 봄. `new AdonisStyle()` 로
  변경하고 코드 주석에 차이점 설명.
- `04-session-auth`에 `SessionModule` import와 `AuthController`의
  `@Controller("/")` decorator가 누락.
- `07-events`와 `08-scheduler`가 잘못된 모듈 이름을 사용
  (`EventService.forRoot()` / `ScheduleService.forRoot()` 대신
  실제 export인 `EventsModule` / `ScheduleModule` 으로).

---

## [0.6.6] — 2026-06-22

### 변경

- 패키지명 변경: `@nexusts/core` (npm publish)

### 추가

- `router.getRoutes()` — 등록된 라우트 노출 (OpenAPI 스펙 생성용)
- `nx db:generate` — 스키마 변경에서 마이그레이션 생성 (이름 옵션)
- 환경 인식 `.env` 로딩 (`.env.{NODE_ENV}` 자동 감지)
- 내장 `sessionMiddleware()` — `@Session()` 사용 시 커스텀 미들웨어 불필요
- Scaffold가 `.env`, `.env.local`, `.gitignore` 생성
- `PORT` 환경변수 읽기 (생성된 `main.ts`)
- 데이터베이스 설정 가이드 (`docs/user-guide/database.md` + `.ko.md`)

### 수정

- Drizzle model import 경로: `drizzle-orm/bun-sqlite` → `drizzle-orm/sqlite-core`
- `make:crud`가 올바른 로컬 import로 repository 파일 생성
- `DrizzleService`가 bun-sqlite에서 자동 open (수동 `open()` 호출 불필요)

---

## [0.6.5] — 2026-06-22

### 추가

- `nx db:generate` — 스키마 변경으로 마이그레이션 생성
- 환경별 `.env` 자동 로딩 (`.env`, `.env.local`, `.env.{NODE_ENV}`)
- 내장 `sessionMiddleware()` — `@Session()` 사용 시 커스텀 미들웨어 불필요
- 스캐폴드가 `.env`, `.env.local`, `.gitignore` 생성
- `main.ts`가 `PORT`를 env에서 읽도록 개선
- 데이터베이스 설정 가이드 (`docs/user-guide/database.md` + `.ko.md`)

### 수정

- Drizzle 모델 import 경로: `drizzle-orm/bun-sqlite` → `drizzle-orm/sqlite-core`
- `make:crud`가 repository 파일을 올바른 로컬 import로 생성
- DrizzleService가 bun-sqlite에서 자동 오픈 (수동 `open()` 호출 불필요)
- `nx db:migrate --status`가 퍼블리시된 패키지에서 정상 작동
- 세션 문서: `c.var.session` → `c.var.nexus.user`, 미들웨어 예제 추가

### 변경

- 기본 View engine: `inertia` → `rendu`
- CLI `view` 옵션에 `eta` 추가
- 스캐폴드에서 `StaticModule.forRoot()` 제거 (`main.ts`의 `mount()`만 유지)
- 뷰 엔진 문서 `setViewPaths('string')` API로 업데이트

---

## [0.6.4] — 2026-06-22

### 변경 · 기본 View engine을 Rendu로

`nx init`과 `nx new` CLI 프롬프트의 기본 View engine이 `inertia`에서
`rendu`로 변경되었습니다. `rendu`가 선택 목록의 첫 번째이자 기본값입니다.

### 추가 · CLI view engine 옵션에 `eta` 추가

이제 `nx init`과 `nx new`에서 Eta 템플릿 엔진(`.eta` 파일)을 선택
옵션으로 사용할 수 있습니다.

### 수정 · 정적 파일 경로 resolution

`StaticModule.mount()`가 이제 상대 경로의 선행 슬래시를 올바르게
제거합니다. 이전에는 `/static/test.html`이 `/test.html`이라는
상대 경로를 생성했고, safe-resolve guard가 절대 경로로 판단하여
404를 반환했습니다.

### 추가 · Application이 `nx.config.ts`에서 `viewPaths` 자동 로드

`Application` 생성자가 부트 시 `nx.config.ts`를 로드하는
`tryLoadNxConfig()`를 호출합니다. 파일에 `viewPaths` 문자열이
있으면 자동으로 적용되므로 `main.ts`에서 `app.setViewPaths()`를
명시적으로 호출할 필요가 없습니다.

### 제거 · 생성된 scaffold에서 `app.setViewPaths()` 제거

`main.ts`가 더 이상 `app.setViewPaths()`를 호출하거나
`@nexusts/view`를 import하지 않습니다. view 경로는 런타임에
`nx.config.ts`에서 읽어옵니다.

---

## [0.6.3] — 2026-06-26

### 변경 · 뷰 엔진을 `@nexusts/view` 패키지로 분리

뷰 엔진이 `src/core/view/`에서 자체 최상위 모듈(`src/view/`)로
이동하여 `@nexusts/view`로 사용 가능해졌습니다:

- 템플릿을 렌더링하지 않는 사용자는 더 이상 번들 비용을 부담하지 않습니다.
- 뷰 엔진은 이제 빌드의 별도 entry point입니다.
- `nexusts` 내부의 import는 상대 경로 + `@/view/*` alias로 계속 정상 작동합니다.

### 추가 · Eta 템플릿 엔진

EJS 스타일 문법을 선호하는 사용자를 위한 새로운 `EtaAdapter`가
추가되었습니다. Eta는 템플릿을 순수 JavaScript 함수로 컴파일하므로
모든 런타임(Bun, Node, Deno, Cloudflare Workers)에서 작동합니다.

- 파일 확장자 `.eta` → `EtaAdapter`
- 선택적 peer dep: `bun add eta`
- 자세한 내용은 `docs/user-guide/view-engines.ko.md` 참조

### 추가 · 파일 확장자별 자동 어댑터 선택

`renderView()`가 파일 확장자에 따라 템플릿 어댑터를 자동 선택:

| 확장자 | 어댑터 |
|-----------|---------------|
| `.html`   | `RenduAdapter` |
| `.rendu`  | `RenduAdapter` |
| `.edge`   | `EdgeAdapter`  |
| `.eta`    | `EtaAdapter`   |

인라인 템플릿(확장자 없음)은 Rendu를 기본값으로 사용합니다.

### 수정 · `nx init`이 `setViewPaths()` 호출을 포함하도록 개선

`nx init`으로 프로젝트를 scaffold할 때 생성되는 `app/main.ts`에
이제 `nx.config.ts`의 `viewPaths` 설정에 기반한 `setViewPaths()`
호출이 포함됩니다. 사용자가 수동으로 호출을 추가해야 했던 DX 격차를
해소했습니다.

### 테스트

- 총 687개 (683 통과, 4 기존 실패)
- +6: EtaAdapter 테스트 (5 통과, 1 "패키지 없음" 테스트 제거)

v0.6.2는 기존 `nx new <name>` 흐름에 두 개의 companion CLI 커맨드를
추가하고, npm에 실제로 push하는 데 필요한 publish 메타데이터를 보강.
API / 런타임 변경 없음.

### 추가 · `nx init [dir]`

이미 존재하는 프로젝트(예: `bun init` 이후, 또는 기존 앱)에 non-destructive하게
scaffold. `nx new <name>`의 companion:

- `nx new my-app`  →  새 디렉토리에 fresh project 생성
- `nx init`        →  cwd에 scaffold, 기존 파일은 skip

동작:

- `package.json` — merge; `nexusts` dep이 없을 때만 추가. 사용자의
  기존 deps (hono, zod 등) 보존.
- `tsconfig.json` — merge; `experimentalDecorators` +
  `emitDecoratorMetadata`가 없으면 추가; `src/**/*.ts`와
  `nx.config.ts`를 `include`에 없으면 추가.
- `nx.config.ts`, `app/*`, `README.md` — 파일이 있으면 skip,
  없으면 create.
- `--force` 플래그로 전부 덮어쓰기.

### 추가 · `nx config`

`nx.config.ts` (+ Drizzle 선택 시 `drizzle.config.ts`)의 idempotent
업데이트. 기존 파일 값을 읽고 flag override와 merge한 뒤 re-render.
주요 사용 사례:

```
nx config                                          # guided prompts
nx config --db postgres --db-url postgres://...     # db 변경
nx config --orm drizzle --db bun-sqlite            # Drizzle 추가
nx config --frontend vue                           # Inertia frontend 변경
nx config --view inertia --no-ssr                  # SSR 비활성화
```

Driver → drizzle dialect 매핑:

```
bun-sqlite / node-sqlite / libsql  →  sqlite
postgres                            →  postgresql
mysql                               →  mysql
```

ORM을 drizzle에서 다른 걸로 바꾸면 기존 `drizzle.config.ts`는
손대지 않음 (의도적일 수 있음).

### 수정 · publish 메타데이터

- `LICENSE` (MIT) repo root에 추가, `package.json` `files[]`에 등록.
- `repository`, `homepage`, `bugs` 필드를 `package.json`에 추가하여
  npm 페이지에 GitHub 링크 노출.
- `npm pack --dry-run`으로 publish tarball에 `LICENSE`, `README.md`,
  `dist/` (26개 모듈) 포함 확인.

### 문서

- `README.md`: roadmap과 license 섹션 재구성. Forms / Lazy props /
  SSR adapters / Form middleware 섹션이 Roadmap 안에 끼어 있던 것을
  Inertia 섹션 뒤로 이동. License는 runtime + optional peer deps와
  각 라이선스를 나열하는 third-party notices 블록으로 확장.
- `docs/user-guide/grpc.ko.md` 추가 (gRPC 가이드 한국어 번역).
- `docs/analysis/*` baseline 헤더 v0.5.0 → v0.6.1로 업데이트.
- `docs/design/architecture.md` v0.4 / 22 modules → v0.6.1 / 26 modules.
- `docs/api-reference.{md,ko.md}`: 새 `@nexusts/grpc` (v0.6) 섹션 추가;
  "See also"에 gRPC와 testing 링크 추가.
- 모든 architecture 다이어그램의 `nexus/X` → `@nexusts/X` (22 파일, 33회 치환).

### 검증 (v0.6.2)

- `nx init` (cli): 7/7 테스트 통과
- `nx config` (cli): 17/17 테스트 통과
- 전체 suite: 659/663 (4개 실패는 v0.5부터 알려진
  `tests/validation` 이슈, 무관)
- `bun run build`: dist version 0.6.2, 26개 모듈
- `bunx tsc --noEmit` 클린
- `npm pack --dry-run`: tarball에 LICENSE + README.md + dist/ 포함

---

v0.6.1은 **patch release**. 새 기능 없음; 모든 consumer-facing 표면에
 영향을 주는 rename 하나, 그리고 빌드 파이프라인 수정.

### 변경 · 패키지명 `nexus` → `nexusts`

출판된 npm 패키지는 항상 `nexusts`였음 (`nexus`라는 이름은 무관한
프로젝트가 npm에 등록하고 있음). v0.6.1은 모든 내부 참조를 출판된
이름에 맞춤:

- `src/`와 `tests/`의 모든 import 경로가 `nexusts` / `@nexusts/X`를 사용.
- CLI 템플릿(`src/cli/templates/**`)이 생성하는 파일에 `nexusts` import 사용.
- `nx new`가 스캐폴딩하는 새 앱의 `package.json`에
  `"nexusts": "*"`이, 모든 생성 파일에 `from '@nexusts/core'`가 들어감.
- `docs/**`의 모든 import 예제 업데이트.
- JSDoc에서 백틱으로 인용된 module 경로 (예: `` `@nexusts/grpc` ``)도
  출판된 이름으로 업데이트.

191 파일, 1281회 치환. `Symbol.for("nexus:...")` DI 토큰과
`"nexus-csrf"` 기본 쿠키 이름은 의도적으로 그대로 둠 (내부 구현
디테일 / 런타임 동작이지 패키지 참조가 아님).

### 수정 · 빌드 파이프라인

- **Consumer `package.json`에 `bin` 필드 누락.** `bin: { nx: "./cli/index.js" }`
  추가하여 `bunx nx` / `npx nx`가 install 후 정상 동작.
- **`dist/src/*` → `dist/*` 평탄화.** `bun.build()`와 `tsc`가
  source path를 보존해서 `dist/src/<name>/...`로 emit하던 문제 해결.
  post-build `moveRecursive()` 단계로 `exports` 필드와 일치하는
  publish 레이아웃 생성.

### 문서

- 신규: [`docs/user-guide/grpc.md`](./docs/user-guide/grpc.md) 및
  한국어 번역 [`docs/user-guide/grpc.ko.md`](./docs/user-guide/grpc.ko.md)
  — 전체 gRPC 가이드.
- 신규: [`docs/user-guide/testing-published-package.md`](./docs/user-guide/testing-published-package.md)
  및 한국어 번역
  [`docs/user-guide/testing-published-package.ko.md`](./docs/user-guide/testing-published-package.ko.md)
  — `dist/`를 로컬에서 테스트하는 3가지 방법 (`bun link` / `file:` / `npm pack`).
- `docs/` 트리 전체의 모든 import 예제가 `nexusts`로 업데이트됨.
- `docs/README.md` 모듈 표에 `@nexusts/grpc` 추가, v0.6 라인의 26개 모듈 반영.

### 검증 (v0.6.1)

- `@nexusts/grpc`: 10 / 10 테스트 통과.
- 전체 suite: 635 / 639 테스트 통과 (4개 실패는 v0.5부터 알려진
  `tests/validation` 이슈, 이 release와 무관).
- `bun run build` 결과: 26개 모듈의 깨끗한 `dist/` 생성, `exports`
  필드가 end-to-end로 정상 resolve (`bun add ../@nexusts/dist` →
  `bunx nx` 동작).
- `bunx tsc --noEmit` `src/` 클린.
- `nx new my-app`이 새 sandbox에서 `package.json`에
  `"nexusts": "*"`, 모든 생성 파일에 `from '@nexusts/core'`를 정상 생성.

### v0.6.0에서의 마이그레이션

이미 `nexusts` import를 쓰고 있었다면 (출판된 이름이 그 것이므로
그랬을 것) 코드 변경 불필요. 소스 파일에 아직 `from "nexus"` 또는
`from "nexus/X"`가 남아있다면 `nexusts` / `@nexusts/X`로 업데이트 —
출판된 패키지에서는 어차피 resolve 안 됐을 것임.

---

v0.6는 **gRPC + 툴링** 마일스톤. 프레임워크가 reflection 기반
proto 로딩과 typed client API를 갖춘 gRPC 통합을 획득. 빌드
파이프라인은 `package.json` `exports`와 일치하는 publish 가능한
`dist/` 레이아웃을 생성.

### 추가 · `@nexusts/grpc`

`@grpc/grpc-js` + `@grpc/proto-loader` 기반의 gRPC 서버 + typed
client 통합. 둘 다 **optional** peer dependency — gRPC 모듈을
사용할 때만 설치.

- **Reflection 기반 proto 로딩.** codegen 단계 없음. `.proto` 파일을
  어디든 두고 `protoPath`만 `GrpcModule.forRoot(...)`에 전달.
- **Decorator 기반 service 구현.** 클래스에 `@GrpcService("ServiceName")`,
  메서드에 `@GrpcMethod("FindById")`를 붙이면 끝. JS 메서드명과
  proto 메서드명은 독립적.
- **DI 통합.** Service 구현은 완전한 DI 시민; `@Inject(Token)`로
  database / event bus 등 의존성 주입 가능.
- **Typed client.** `grpc.client<UserClient>("ServiceName", { url })`로
  서비스 메서드당 하나씩 Promise를 반환하는 메서드를 가진 객체 반환.
  메서드명은 camelCase로 변환 (`FindById` → `findById`).
- **Multi-service / multi-proto.** 한 서버에 여러 서비스, 여러
  `.proto` 파일을 호스팅.
- **Lifecycle.** `await grpc.start()`로 bind, `await grpc.stop()`로
  graceful shutdown (1s timeout 후 force).
- **v1 범위: unary 메서드만.** Server-streaming, client-streaming,
  bidi streaming은 v2에서 예정.

### 수정 · 빌드 파이프라인

- **`dist/src/*` → `dist/*` 평탄화.** `bun.build()`와 `tsc`가
  source path를 보존해서 `dist/src/<name>/...`로 emit하던 문제 해결.
  post-build `moveRecursive()` 단계로 `exports` 필드와 일치하는
  publish 레이아웃 생성.
- **Consumer `package.json`에 `bin` 필드 누락.** `bin: { nx: "./cli/index.js" }`
  추가하여 `bunx nx` / `npx nx`가 install 후 정상 동작.
- **`@opentelemetry/sdk-node` 빈 문자열 peer dep.** published
  peer-deps 리스트에서 빈 문자열 제거.

### 문서

- 신규: [`docs/user-guide/grpc.md`](./docs/user-guide/grpc.md) (영어)
  - [`grpc.ko.md`](./docs/user-guide/grpc.ko.md) (한국어)
- 신규: [`docs/user-guide/testing-published-package.md`](./docs/user-guide/testing-published-package.md) (영어)
  - [`testing-published-package.ko.md`](./docs/user-guide/testing-published-package.ko.md) (한국어)
  — `dist/`를 로컬에서 테스트하는 3가지 방법 (`bun link` / `file:` / `npm pack`)

### 검증 (v0.6)

- `@nexusts/grpc`: 10 / 10 테스트 통과.
- 전체 suite: 634 / 639 테스트 통과 (5개 실패는 v0.5부터 알려진
  `tests/validation` 이슈, v0.6과 무관).
- `bun run build` 결과: 26개 모듈의 깨끗한 `dist/` 생성, `exports`
  필드가 end-to-end로 정상 resolve (`bun add ../@nexusts/dist` →
  `bunx nx` 동작).
- `bunx tsc --noEmit` `src/` 클린.
- `@nexusts/grpc`은 `dist/`의 54번째 runtime file.

### 참고

- v0.5 작업 cycle 내내 `package.json` 버전은 0.4.0이었음. 0.6.0으로
  bump하는 이유는 v0.6이 gRPC 모듈 + publish 가능한 `dist/` 파이프라인
  둘 다 user-visible 추가이기 때문. v0.5 라인 (ws / crypto / i18n /
  redis / cli)은 `0.5.0`으로 release; 이 commit은 package 버전을
  문서화된 release line과 일치시킴.

---

v0.5는 **실시간** 마일스톤. 프레임워크가 Bun (기본) 및 Node.js
(`ws` 패키지 경유)에서 작동하는 통합 WebSocket API를 획득. 단일
데코레이터 기반 게이트웨이 패턴. 프레임워크는 이제 23개 모듈 제공
(v0.4에서 22개에서 증가).

### 추가 · `@nexusts/ws`

`@nexusts/ws`는 Hono의 런타임별 WebSocket 지원에 대한 단일 관용적 API 제공.

- **`@WebSocketGateway(path)`** — 클래스 데코레이터. 클래스를 WebSocket 게이트웨이로 표시. 프레임워크가 `<path>`에 Hono `upgradeWebSocket` 핸들러 설치.
- **`@OnWebSocketOpen()`, `@OnWebSocketMessage()`, `@OnWebSocketClose()`, `@OnWebSocketError()`** — 메서드 데코레이터 팩토리. 라이프사이클 이벤트를 특정 메서드에 바인딩.
- **`WebSocketService`** — DI 친화적 서비스. 연결 추적, rooms, broadcasting.
- **`WebSocketClient`** — `id`, `rooms`, `data`, `send()`, `close()`, `joinRoom()` / `leaveRoom()`을 가진 per-connection 래퍼.
- **런타임 자동 감지** — Bun은 자동 감지. Node에서 프레임워크는 `ws` 패키지 (optional peer dep)를 lazy-import.
- **`BunWsAdapter`** — Hono의 `createBunWebSocket`을 래핑하여 `Bun.serve()`용 `websocket` config 객체 반환.
- **`NodeWsAdapter`** — `ws` 패키지 래핑, `http.Server.upgrade` 이벤트용 `handleUpgrade` 함수 반환.
- **Rooms** — `joinRoom`, `leaveRoom`, `broadcastToRoom`, `getRoomMembers`. Room은 비면 자동 정리.
- **Broadcast** — `broadcast(data, filter?)`는 모든 열린 클라이언트에 도달; `sendTo(id, data)`는 한 명에 도달.

### 추가 · API surface

```ts
@Injectable()
@WebSocketGateway("/ws")
class ChatGateway {
  constructor(@Inject(WEBSOCKET_SERVICE_TOKEN) private ws: WebSocketService) {}

  @OnWebSocketOpen()
  onOpen(client: WebSocketClient) { this.ws.joinRoom(client, "lobby"); }

  @OnWebSocketMessage()
  onMessage(client: WebSocketClient, data: { text: string }) {
    this.ws.broadcastToRoom("lobby", { user: client.id, text: data.text });
  }

  @OnWebSocketClose()
  onClose(client: WebSocketClient) { this.ws.leaveAllRooms(client); }
}

@Module({ imports: [WebSocketModule.forRoot({ gateways: [ChatGateway] })] })
class AppModule {}
```

### 추가 · Auth 패턴

Sub-protocol 토큰, 세션 쿠키 (기존 `@nexusts/session` 미들웨어),
또는 first-message handshake를 통한 WebSocket 인증. 자세한 가이드는
`docs/user-guide/ws.md` 참조.

### 변경

- 패키지 버전 0.5.0으로 bump.
- 신규 번들 entry point: `./ws`. 23 entry points 합계;
  46 runtime files emitted to `dist/`.

### 추가 · CLI

- 신규 `nx repl` 명령 (별칭: `console`, `shell`). 사용자의
  AppModule을 boot하고 `app`, `container`, `db`, `logger`,
  `cfg`, `cache`, `events`이 사전 로드된 대화형 REPL로 진입.
  다중 행 입력 (bracket-matching), async 코드, history
  (영구 저장), dot-commands 지원: `.help`, `.exit`,
  `.services`, `.modules`, `.routes`, `.history`, `.clear`,
  `.reset`. raw REPL을 원하면 `--no-boot` 사용.

### 변경 · CLI

- `nx migrate`는 이제 `nx db:migrate`. 이전 이름은 하위 호환을
  위해 여전히 별칭으로 작동; 새 짧은 별칭은 `nx db:m`.
- 신규 `nx db:seed` 명령 (별칭: `db:s`, `seed`)이 `db/seeds/`
  (nx.config.ts의 `paths.seeds`로 설정 가능)의 모든 시드
  파일 실행. 서브 플래그: `--file <name>`로 단일 시드 실행,
  `--create <name>`로 시드 파일 스캐폴드, `--reset`로 모든
  테이블 truncate 후 시드 실행 (파괴적).

### 의존성

- **`@nexusts/ws`의 optional peer dep**:
  - `ws` (^8.18.0) — Node 런타임에서만. Bun 앱은 불필요.

### 문서

- 신규 가이드 `docs/user-guide/ws.md` (영문) + `ws.ko.md` (한글):
  빠른 시작 (Bun 및 Node), `WebSocketService` API, `WebSocketClient` 래퍼,
  인증 패턴, heartbeat, Cloudflare Workers 통합 레시피, 설정 레퍼런스.
- 갱신:
  - `docs/README.md` — 모듈 표가 23 항목.
  - `docs/api-reference.md` — 신규 `@nexusts/ws` 섹션.
  - `README.md` — 모듈 수 22 → 23; 로드맵 갱신.

### 검증 (v0.5)

- **490 / 490 tests pass** in 2.71s (v0.3 이전부터 존재한
  `tests/validation`, `tests/e2e`, `tests/config`의 실패 제외). v0.4의
  464에서 +26 신규.
- `tsc --noEmit` clean.
- 23 bundle entry points; 46 runtime files emitted to `dist/`.

### 추가 · `@nexusts/redis`

런타임 인식 Redis 호환 키/값 클라이언트. 새로운 `redis` 및
`cloudflare-kv` 세션/캐시 백엔드를 구동. 세 가지 런타임 어댑터
(+ 인-프로세스 `memory`):

- **`bun`** — 내장 `Bun.redis` 사용 (추가 패키지 없음).
- **`node`** — `ioredis` 사용 (이제 옵션 peer dep).
- **`cloudflare`** — Cloudflare Workers KV 사용 (추가 패키지 없음;
  Workers / Pages 런타임에 이상적).
- **`memory`** — 인-프로세스 맵 (테스트 및 단일 프로세스 dev용).

런타임에서 자동 감지. 네 어댑터 모두 동일한 `RedisClient`
API를 가지므로 키/값 저장소가 필요한 모든 모듈이 같은
클라이언트 셰이프 사용 가능.

### 추가 · `@nexusts/session` — Redis & Cloudflare KV 백엔드

`SessionModule.forRoot({ backend: "redis", redis: { client, keyPrefix } })`가
새 `RedisSessionStorage` 사용 (Bun, Node 또는 `RedisClient`를
노출하는 모든 런타임에서 작동). Cloudflare Workers의 경우
`CloudflareKVAdapter` 전달 후 `backend: "cloudflare-kv"` 사용.
사용자별 세션 인덱스 자동 유지; `gc()`가 고아 정리.

### 추가 · `@nexusts/cache` — Redis 캐시 스토어

`RedisCacheStore`는 `RedisClient`를 래핑하는 `CacheStore`. 태그
기반 무효화는 `gc()`가 정리하는 태그별 인덱스를 통해 지원. 같은
설정이 Bun (`Bun.redis`), Node (`ioredis`), Cloudflare Workers (KV)에서 작동.

### v0.4에서 마이그레이션

대부분의 v0.4 코드는 변경 없이 v0.5와 호환됨. 본 릴리스의 breaking
change 없음. 신규 `@nexusts/ws` 모듈은 opt-in — WebSocket이 필요할 때만
설치 (Node에서는 `ws` 패키지도).

---

## [0.4.0] — 2026-06-22

v0.4는 **관측 가능성과 개발자 경험** 마일스톤입니다. NestJS / AdonisJS
기능 분석의 모든 "Tier 1" 및 "Tier 2" 격차가 해소되었습니다. 프레임워크는 이제
22개 모듈을 제공합니다 (v0.3에서 17개에서 증가).

### 추가 · 모듈

v0.4에서 **6개의 신규 모듈**이 추가되었습니다:

| 모듈 | Tier | 목적 |
| ------ | ---- | ------- |
| `@nexusts/openapi` | 1 | OpenAPI 3.1 스펙 생성 + Scalar UI. `@Validate({body,query,params,headers})` Zod 스키마에서 자동 도출. |
| `@nexusts/upload` | 1 | 멀티파트 파일 업로드 헬퍼. `UploadService`가 `multipart/form-data` 파싱, 크기 / MIME / 개수 검증. `@Upload()` / `@UploadedFile()` / `@UploadedFiles()` 데코레이터. |
| `@nexusts/sse` | 2 | Server-Sent Events. `SseStream`이 Hono의 `SSEStreamingApi`를 pending-write 트래킹과 함께 래핑. `sse(c, handler)` 헬퍼. `onClose()` cleanup. |
| `@nexusts/tracing` | 2 | OpenTelemetry 분산 추적. `TracingService`, `TracingModule.forRoot()` (lazy OTel SDK), `@Trace()` 데코레이터, W3C + B3 전파, Hono 자동 계측. |
| `@nexusts/metrics` | 2 | Prometheus / OpenMetrics. `Counter` / `Gauge` / `Histogram` / `Summary`, 라벨, content negotiation이 가능한 `/metrics` 엔드포인트. `@Counted()` / `@Timed()` 데코레이터. |
| (코어) **Request-scoped DI** | 2 | `@Injectable({ scope: 'request' })` provider 옵션. Hono 미들웨어가 `AsyncLocalStorage`로 요청별 scope 활성화. `getRequest()` / `getRequestScope()` / `getRequestState()` 헬퍼. `REQUEST` 및 `REQUEST_SCOPE` 토큰. |

### 추가 · Tracing

`@nexusts/tracing`은 OpenTelemetry API의 얇고 관용적인 래퍼. Bun-native 앱용 설계:

- **Lazy SDK 로딩.** `@opentelemetry/api`는 유일한 필수 의존성 (~7kb). SDK 패키지들(`sdk-node`, `exporter-trace-otlp-http`, `resources`, `semantic-conventions`)은 optional peer dep이며, `TracingModule.forRoot()`가 dynamic-import.
- **`@Trace()` 데코레이터** — 메서드를 span으로 감쌈. `AsyncFunction` 감지로 sync 메서드는 sync로 유지.
- **`withSpan()` / `withSpanSync()`** — 수동 span 헬퍼.
- **W3C + B3 전파** — `parseTraceParent`, `formatTraceParent`, `extractB3Context`. `extractContext()` / `injectContext()` 헬퍼.
- **Hono 자동 계측** — 들어오는 `traceparent` 추출, `http.method` / `http.route` / `http.target` / `http.user_agent` / `http.client_ip` / `http.status_code` 속성을 가진 `SERVER` span 시작.
- **기본 no-op.** `forRoot()` 없이는 `TracingService`가 OTel의 no-op tracer 사용; `@Trace()`는 투명한 pass-through.

### 추가 · Metrics

`@nexusts/metrics`는 **외부 의존성 0**인 Prometheus 호환 메트릭 수집 라이브러리 (gzipped ~5kb).

- **4가지 메트릭 타입** — `Counter`, `Gauge`, `Histogram`, `Summary`.
- **라벨** — 메트릭별 `labelNames`, observation 시점에 검증.
- **기본 버킷** — Prometheus 표준 `[0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10]`.
- **기본 백분위** — `Summary`의 `[0.5, 0.9, 0.99]`.
- **`/metrics` 엔드포인트** — `MetricsModule.forRoot()`가 자동 마운트. `Accept` 헤더로 content negotiation (Prometheus는 `text/plain; version=0.0.4`, OpenMetrics는 `application/openmetrics-text; version=1.0.0`).
- **기본 Node.js 프로세스 메트릭** — `process_start_time_seconds`, `process_resident_memory_bytes`, `nodejs_heap_size_used_bytes`, `nodejs_eventloop_lag_seconds` 등 (총 10개 gauge, scrape 시점에 실행되는 `collect()` 콜백).
- **글로벌 라벨** — `service`, `region` 등이 모든 메트릭에 prepend.
- **`@Counted()` / `@Timed()` 데코레이터** — 메서드 호출 시 자동 기록. sync 메서드는 sync로 유지.
- **`getOrCreate*` 헬퍼** — 데코레이터 사용 시, 다른 라벨 셋으로 동일 메트릭을 여러 메서드에서 observe할 때 "metric already registered" 에러 회피.

### 추가 · Request-scoped DI

오랫동안 요청받은 기능. DI 컨테이너가 이제 세 가지 provider scope 지원:

| Scope | 수명 | 사용 사례 |
| ----- | -------- | -------- |
| `singleton` (기본) | 앱 수명 | 무상태 서비스 |
| `request` | 단일 HTTP 요청 | 멀티테넌트 컨텍스트, 감사 로깅, request-id 전파 |
| `transient` | resolve당 | for-each, 일회용 워커 |

프레임워크가 `AsyncLocalStorage`로 요청별 scope를 활성화하는 Hono 미들웨어 설치. 서비스 코드는 호출 트리 어디서나 활성 요청을 읽을 수 있음:

```ts
import { getRequest, getRequestState, REQUEST, Inject, Injectable } from "nexusts";

@Injectable({ scope: "request" })
class RequestContext {
  id = crypto.randomUUID();
  userId: string | null = null;
  constructor(@Inject(REQUEST) public req: any) { ... }
}

// 호출 트리 깊숙이:
function audit() {
  const ctx = getRequestState<MyAuditData>("audit");
  // ...
}
```

### 추가 · OpenAPI

`@nexusts/openapi`는 OpenAPI 3.1 스펙을 생성하고 모던 Scalar UI로 제공.

- **`@Validate({body,query,params,headers})` Zod 스키마에서 자동 도출** — 스키마를 두 번 선언할 필요 없음.
- **Zero-dep zod-to-JSON-schema 변환기** — zod 3.25+ 내부 `_def` 구조 처리 (literal `value`, enum `values`, function-style `shape()`).
- **데코레이터** — `@ApiTags`, `@ApiOperation`, `@ApiResponse`, `@ApiBody`, `@ApiParam`, `@ApiQuery`, `@ApiSecurity`, `@ApiExclude`, `@ApiProperty`, `@ApiSchema`.
- **Scalar UI** — jsDelivr CDN에서 로드 (asset 번들링 없음).
- **`GET /openapi.json` + `GET /docs`** — 스펙과 UI.

### 추가 · Upload

`@nexusts/upload`는 Hono의 `c.req.parseBody()` 기반의 얇고 관용적인 멀티파트 업로드 헬퍼. Bun의 `Blob`과 Node의 `File` 타입을 투명하게 수용.

- **`@Upload('field', opts)`** — 라우트별 설정.
- **`@UploadedFile('field')` / `@UploadedFiles('field')`** — 파라미터 주입.
- **검증** — `maxFileSize` (기본 10MB), `maxFiles` (기본 5), `allowedMimeTypes` (`image/*` 와일드카드 지원).
- **에러** — `FILE_TOO_LARGE`, `MIME_NOT_ALLOWED`, `MISSING_FIELD`, `TOO_MANY_FILES` (모두 400 반환).
- **`@nexusts/drive` 통합 옵션** — `driveToken` + `drivePrefix`로 업로드를 `DriveService` 버킷에 직접 파이프.

### 추가 · SSE

`@nexusts/sse`는 보장된 delivery semantics를 가진 Hono의 `SSEStreamingApi` 래퍼 `SseStream` 제공.

- **`sse(c, handler)` 헬퍼** — Hono 컨텍스트가 첫 번째 인자.
- **Pending-write 트래킹** — `SseStream.send()`가 `api.writeSSE()` promise를 트래킹; `close()`가 `Promise.allSettled()`를 await하여 `close()` 이전의 모든 `send()`가 클라이언트에 도달.
- **`getLastEventId(c)`** — 재연결 지원.
- **`onClose(cb)`** — cleanup (명시적 close 또는 Hono의 `onAbort` 통한 클라이언트 disconnect 시 발화).

### 변경 · deprecated 항목 제거

`@CurrentSession` 및 `CurrentSessionOptions`은 v0.2에서 deprecated (각각 `@Session` 및 `SessionOptions`로 이름 변경). deprecation shim이 **v0.4에서 제거**; 이제 v0.2 이름만 export.

```diff
- import { CurrentSession } from "@nexusts/session";
+ import { Session } from "@nexusts/session";

- add(@CurrentSession() session) { ... }
+ add(@Session() session) { ... }
```

### 변경 · Build

- 번들 수: 17 → 22 entry points. 34 → 44 runtime files.
- 신규 번들 entry points: `./openapi`, `./upload`, `./sse`, `./tracing`, `./metrics`. (Request-scoped DI는 `core`와 함께 출시.)
- TypeScript: `strict: true`; experimental decorators 활성화.

### 의존성

- **`@nexusts/tracing`의 optional peer dep**:
  - `@opentelemetry/api` (항상 필요, ~7kb)
  - `@opentelemetry/sdk-node`, `@opentelemetry/exporter-trace-otlp-http`,
    `@opentelemetry/resources`, `@opentelemetry/semantic-conventions`
    (`TracingModule.forRoot()` 호출 시에만)
- **신규 필수 의존성 없음.** `@nexusts/metrics`는 runtime dep 없음. `@nexusts/upload` / `@nexusts/openapi` / `@nexusts/sse`는 이미 있는 `hono`와 `zod`만 사용.

### 문서

- 신규 가이드 (영문 + 한글):
  - `docs/user-guide/openapi.md`
  - `docs/user-guide/upload.md`
  - `docs/user-guide/sse.md`
  - `docs/user-guide/tracing.md`
  - `docs/user-guide/request-scope.md`
  - `docs/user-guide/metrics.md`
- 갱신:
  - `docs/README.md` — 모듈 인덱스에 22개 항목.
  - `docs/api-reference.md` — 22개 모듈의 API surface.
  - `docs/user-guide/getting-started.md` — v0.4 quickstart.
  - `docs/design/architecture.md` — v0.4 layer diagram.
  - `docs/analysis/nestjs-comparison.md` — §4.3 (request-scoped DI),
    §4.4 (OpenTelemetry), §4.5 (Prometheus metrics) 모두 "closed in v0.4"로 표시. "Closed in v0.3" 표는 18행 (이전 14).
  - `docs/analysis/adonisjs-comparison.md` — v0.4로 재기준.

### 검증 (v0.4)

- **464 / 464 tests pass** in 2.67s (v0.3 이전부터 존재한 `tests/validation`,
  `tests/e2e`, `tests/config`의 실패 제외). v0.3의 322에서 +142 신규.
- `tsc --noEmit` clean.
- 22 bundle entry points; 44 runtime files emitted to `dist/`.

### v0.3에서 마이그레이션

대부분의 v0.3 코드는 변경 없이 v0.4와 호환됩니다. 유일한 breaking change:

1. **`@CurrentSession`을 `@Session`으로 교체.** v0.1 alias는 v0.2에서 deprecated되었고 이제 제거됨.

```ts
// v0.3
import { CurrentSession } from "@nexusts/session";
class C {
  add(@CurrentSession() session) { ... }
}

// v0.4
import { Session } from "@nexusts/session";
class C {
  add(@Session() session) { ... }
}
```

이게 전부. 다른 모든 v0.3 API는 v0.4에서 변경 없이 작동.

---

## [0.3.0] — 2026-06-21

v0.3는 **production-ready** 마일스톤. NestJS / AdonisJS 기능 분석의 모든
"Tier 1" 격차가 해소되었고, 기본 ORM (Drizzle)이 모든 DB 의존 모듈에 연결됨.

### 추가 · 모듈

프레임워크는 이제 **17개 모듈**을 제공 (v0.2에서 7개에서 증가). 모든 신규 모듈은 자체 번들 entry point — 필요한 것만 설치.

| 모듈 | 번들 entry | 목적 |
| ------ | ------------ | ------- |
| `@nexusts/health` | `@nexusts/health` | Liveness / readiness / startup 엔드포인트. 내장 indicator: memory, disk, HTTP, Drizzle DB probe. |
| `@nexusts/config` | `@nexusts/config` | Zod 검증 설정. 레이어 로딩 (process.env → `.env` → `load()` → schema). |
| `@nexusts/logger` | `@nexusts/logger` | Pino 기반 구조화 로깅. dev에서는 pretty-print, prod에서는 JSON. AsyncLocalStorage로 request-scoped. |
| `@nexusts/static` | `@nexusts/static` | ETag, Range, path-traversal 보호, MIME 추론이 있는 정적 파일 서빙. |
| `@nexusts/limiter` | `@nexusts/limiter` | Rate limiting. 3가지 전략 (fixed / sliding / token-bucket) × 2가지 백엔드 (memory / drizzle). |
| `@nexusts/shield` | `@nexusts/shield` | 보안 스위트: CSRF (HMAC) + HSTS + CSP + X-Frame-Options + Referrer-Policy. |
| `@nexusts/cache` | `@nexusts/cache` | 애플리케이션 캐시. Memory (LRU + TTL) 및 Drizzle 백엔드. 실제 tag-based invalidation. |
| `@nexusts/drive` | `@nexusts/drive` | 파일 스토리지 추상화. Memory / Local / S3 / R2 드라이버. 서명된 URL. |
| `@nexusts/mail` | `@nexusts/mail` | 아웃바운드 이메일. Null / File / SMTP 전송. MJML 렌더링. |
| `@nexusts/drizzle` | `@nexusts/drizzle` | **기본 ORM.** Drizzle ORM 통합. 5개 dialect (postgres / mysql / sqlite / bun-sqlite / d1). Lucid 등가 API. |

### 추가 · 기존 모듈의 Drizzle 백엔드

`@nexusts/session`, `@nexusts/health`, `@nexusts/limiter`, `@nexusts/cache`가 모두 Drizzle
백엔드를 획득하여, 멀티 pod 배포에서 모든 Drizzle 호환 DB를 통해 상태 공유 가능.

| 모듈 | Drizzle 백엔드 |
| ------ | --------------- |
| `@nexusts/session` | `DrizzleSessionStorage` (`backend: 'database'`) |
| `@nexusts/health` | `DrizzleHealthIndicator` (`SELECT 1` probe) |
| `@nexusts/limiter` | `DrizzleRateLimitStorage` (3가지 전략 모두) |
| `@nexusts/cache` | `DrizzleCacheStore` (`invalidateByTag`용 tag 인덱스 포함) |

### 추가 · CLI

- `nx make:model` 및 `nx make:migration`이 이제 **dialect-aware**. `--dialect
  postgres | mysql | sqlite | bun-sqlite | d1`로 올바른 Drizzle import 경로와 컬럼 타입 선택.
- **신규 명령어 `nx migrate`** (`nx m`) — `drizzle-kit migrate`를 래핑, `--status`,
  `--generate "<name>"`, `--folder`, `--dialect`, `--config` 플래그.
- `nx init`이 `--orm drizzle` 선택 시 `drizzle.config.ts`를 자동 스캐폴드.
- `nx info`가 resolved `dialect` 필드 출력.

### 추가 · Lucid 격차 해소 (AdonisJS 비교)

`@nexusts/drizzle`은 가장 큰 AdonisJS 격차 (Lucid ORM)를 다음으로 해소:

- `DrizzleModel` 베이스 클래스 + `@Table` / `@Column` / `@PrimaryKey` 데코레이터.
- `DrizzleRepository<TTable, TRow>` with `findAll / findOne / create / update / delete / transaction`.
- `db.migrate(folder)`로 자동 마이그레이션, 부팅 시 `autoMigrate: true` 포함.
- `db.transaction(fn)`로 ACID 트랜잭션.
- `db.raw\`SELECT * FROM users WHERE id = ${id}\``로 **SQL injection 안전** raw 쿼리 — 값은 bound parameter로 전송, SQL 텍스트에 연결되지 않음.

### 추가 · SQL Injection 방지

`db.raw\`...\``는 tagged template literal. 모든 interpolate된`${value}`는 bound parameter가 됨 (postgres는 `$1, $2, ...`; sqlite / mysql은`?`). 드라이버가 SQL 텍스트와 파라미터 값 사이의 프로토콜-레벨 분리를 유지하므로,`"admin' OR 1=1 --"` 같은 악의적 입력은 SQL이 아닌 리터럴 문자열로 처리됨.

### 변경

- 패키지 버전 0.3.0으로 bump.
- `NxConfig`에 옵션 `dialect` 필드 추가.
- `MemoryStore` (cache)가 `invalidateByTag`용 `tag -> Set<key>` 인덱스 획득. MemoryStore의 `invalidateByTag()`는 더 이상 no-op이 아님.
- `CacheStore` 인터페이스에 옵션 `invalidateByTag()` 및 `gc()` 메서드 추가. 없는 기존 백엔드도 계속 작동.
- `SessionStorage.name`이 `'database'`를 유효 값으로 수용.

### 의존성

- **필수 peer dep**: `drizzle-orm` (`@nexusts/drizzle` 모듈 전체가 이것 없이 무의미).
- **옵션 peer dep** (해당 dialect 사용 시에만 설치): `pg`, `postgres`, `mysql2`, `better-sqlite3`.
- `@nexusts/logger`를 위해 `pino`와 `pino-pretty`가 dependencies에 추가됨.

### 문서

- 신규 `docs/user-guide/production-basics.md` — health, config, logger, static.
- 신규 `docs/user-guide/cross-cutting-features.md` — limiter, shield, cache, drive, mail.
- 신규 `docs/user-guide/drizzle.md` — Lucid 호환성 표가 포함된 종합 Drizzle 가이드.
- 신규 `docs/analysis/nestjs-comparison.md` 및 `docs/analysis/adonisjs-comparison.md` — 격차 분석.
- 모든 user guide에 한글 (`.ko.md`) 번역 추가.

### 검증 (v0.3)

- 322 / 322 tests pass (v0.3 이전부터 존재한 `tests/validation`, `tests/e2e`, `tests/config`의 실패 제외).
- `tsc --noEmit` clean.
- 17 bundle entry points; 34 runtime files emitted to `dist/`.

---

## [0.2.0] — 2026-05-15

Feature-complete MVP. 프레임워크가 "v0.2 약속" 모듈을 모두 획득.

### 추가

- **`@nexusts/auth`** — better-auth 통합. `AuthService`, `AuthController`, `authMiddleware`, `@CurrentUser()` 데코레이터.
- **`@nexusts/queue`** — BullMQ + Cloudflare Queues + memory 백엔드. `@OnQueueReady` 데코레이터, `QueueService.add/process`, retry 정책, `nx make:queue` 스캐폴드.
- **`@nexusts/schedule`** — In-tree cron parser (`croner` / `node-cron` 의존성 없음). `@Cron` / `@Interval` / `@Timeout` 데코레이터. `nx make:schedule` 스캐폴드.
- **`@nexusts/events`** — wildcards (`*` / `**`), 우선순위, 가드를 가진 `NexusEventEmitter`. `@OnEvent` 데코레이터.
- **`@nexusts/session`** — Cookie (HMAC) + memory 백엔드. Session 회전, sliding expiry, `nx make:session` 스캐폴드.
- **`nx` CLI** — 12개 명령어: `new`, `init`, `make:crud`, `make:controller`, `make:service`, `make:module`, `make:model`, `make:migration`, `make:middleware`, `make:validator`, `info`, `route:list`.

### 변경

- `@CurrentSession` → `@Session` (마이그레이션을 위해 현재 alias 유지).
- 패키지 버전 0.2.0으로 bump.

### 검증 (v0.2)

- 117 / 117 tests pass.
- 7 bundle entry points; clean typecheck.

---

## [0.1.0] — 2026-04-30

초기 릴리스. **feature-complete MVP core.**

### 추가

- **Core MVC**:
  - `@Controller`, `@Get`, `@Post`, `@Put`, `@Delete`, `@Patch`, `@Options`, `@Head` HTTP method 데코레이터.
  - `@Req`, `@Res`, `@Next`, `@Body`, `@Query`, `@Param`, `@Headers`, `@Ctx`, `@User` 파라미터 데코레이터.
  - 3가지 라우팅 스타일: **Nest** (class 데코레이터), **Adonis** (router table), **Functional** (Hono-native).
- **DI 컨테이너** — `@Injectable`, `@Inject`, `Symbol.for("nexus:X")` 토큰, `useExisting`, `useFactory`, `useValue` providers, request-scoped lifecycle을 가진 class-based 주입.
- **검증 파이프라인** — `@Validate` 데코레이터로 Zod 스키마.
- **View engines**:
  - **Rendu** (Bun-native, 기본).
  - **Edge** (Adonis 스타일).
  - **Inertia.js adapter** — API 없이 전체 SPA UX. Asset 버전 관리, lazy-evaluation 헬퍼, merge props.
- **런타임**:
  - Bun (기본).
  - Node (≥ 18) Hono 통해 지원.
  - Cloudflare Workers (Hono adapter).
- **CLI 부트스트랩** — 미니멀 스캐폴드 도구.

### 검증 (v0.1)

- 24 / 24 tests pass.
- 단일 bundle entry point; clean typecheck.

---

[0.8.3]: https://github.com/nexus-ts/nexusts/compare/v0.8.2...v0.8.3
[0.8.2]: https://github.com/nexus-ts/nexusts/compare/v0.8.1...v0.8.2
[0.8.1]: https://github.com/nexus-ts/nexusts/compare/v0.8.0...v0.8.1
[0.8.0]: https://github.com/nexus-ts/nexusts/compare/v0.7.9...v0.8.0
[0.7.9]: https://github.com/nexus-ts/nexusts/compare/v0.7.8...v0.7.9
[0.7.8]: https://github.com/nexus-ts/nexusts/compare/v0.7.7...v0.7.8
[0.7.7]: https://github.com/nexus-ts/nexusts/compare/v0.7.6...v0.7.7
[0.7.6]: https://github.com/nexus-ts/nexusts/compare/v0.7.5...v0.7.6
[0.7.5]: https://github.com/nexus-ts/nexusts/compare/v0.7.4...v0.7.5
[0.7.4]: https://github.com/nexus-ts/nexusts/compare/v0.7.3...v0.7.4
[0.7.3]: https://github.com/nexus-ts/nexusts/compare/v0.7.0...v0.7.3
[0.7.0]: https://github.com/nexus-ts/nexusts/compare/v0.6.9...v0.7.0
[0.6.9]: https://github.com/nexus-ts/nexusts/compare/v0.6.8...v0.6.9
[0.4.0]: https://github.com/nexus-ts/@nexusts/compare/v0.3.0...v0.4.0
[0.3.0]: https://github.com/nexus-ts/@nexusts/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/nexus-ts/@nexusts/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/nexus-ts/@nexusts/releases/tag/v0.1.0
