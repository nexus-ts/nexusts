# NexusTS vs AdonisJS — 기능 격차 분석

> English version: [`adonisjs-comparison.md`](./adonisjs-comparison.md)
> 분석 일자: 2026-06-24 · 기준: NexusTS **v0.8.4**

이 문서는 NexusTS v0.8.4와 [AdonisJS v6](https://adonisjs.com)를 비교하여
어떤 AdonisJS 스타일 "battery" (관례 기반, "그냥 동작" 기능)가
**있음**, **부분적**, **없음** 상태인지 식별한다. v0.3–v0.7.0 마일스톤이
모든 Tier 1, Tier 2, Tier 3 격차를 해소했다. 이제 프레임워크는
AdonisJS가 출시하는 모든 battery를 다루며, 그 이상을 제공한다.

> **중요**: AdonisJS는 9년 된 프레임워크로 NexusTS보다 5년 앞서 있다.
> 매우 관용적인 수십 개의 first-party 패키지 (`@adonisjs/*`)를
> 보유. NexusTS는 더 작은 코어와 "스택을 직접 조합"하는 철학을
> 의도적으로 출시한다. 따라서 "격차"는 기능 패리티보다
> **battery 커버리지** — AdonisJS가 알려진 "그냥 동작" 수준.

---

## 1. 요약 표 (v0.8.4)

범례: ✅ 출시 · ⚠️ 부분적 · ❌ 없음 · 🔵 third-party 필요

| 카테고리 | AdonisJS | NexusTS v0.8.4 | 비고 |
|----------|----------|--------------|-------|
| HTTP 서버 | ✅ Custom (Node & Workers) | ✅ Hono (Bun / Node / Workers) | Nexus는 Hono를 기반 서버로 사용 |
| 라우팅 | ✅ Route groups, resources, subdomains | ✅ 클래스 데코레이터 + functional | 세 가지 스타일: Nest, Adonis, Functional |
| 컨트롤러 | ✅ "thin" (Adonis 관례) | ✅ "fat" (DI와 함께 Nest 스타일) | 둘 다 작동; 스타일 선택 |
| 미들웨어 | ✅ 클래스 기반, 순서 지정 | ✅ Hono 미들웨어 (타입됨) | `app.use('*', mw)` |
| DI | ✅ IoC 컨테이너, 데코레이터 | ✅ 클래스 기반 + `@Inject()` | Nest 스타일 + Adonis 스타일 모두 |
| 검증 | ✅ Vine (Zod에서 영감) | ✅ Zod | Nexus는 `@Validate`로 직접 Zod 사용 |
| ORM | ✅ Lucid (내장) | ✅ `@nexusts/drizzle` | Drizzle가 기본 ORM |
| 마이그레이션 | ✅ 내장 | ✅ `nx db:migrate` (drizzle-kit 래퍼) | 같은 DX |
| Seeding | ✅ 내장 팩토리 | ⚠️ DIY | first-party 없음; 사용자가 팩토리 작성 |
| Auth | ✅ `@adonisjs/auth` | ✅ `@nexusts/auth` (better-auth) | better-auth = 다수 전략 |
| 세션 | ✅ `@adonisjs/session` | ✅ `@nexusts/session` | Cookie / Memory / Drizzle 백엔드 |
| 암호화 | ✅ `@adonisjs/encryption` | ✅ `@nexusts/crypto` (AES-256-GCM + HMAC + scrypt) | 같은 API 스타일 |
| Hash | ✅ `@adonisjs/hash` | ✅ `@nexusts/crypto` (HashService) | Argon2 / scrypt |
| Shield | ✅ `@adonisjs/shield` (CSRF, headers) | ✅ `@nexusts/shield` (CSRF / HSTS / CSP) | 같은 이름, 같은 목적 |
| Throttler | ✅ `@adonisjs/throttler` | ✅ `@nexusts/limiter` (fixed / sliding / token-bucket) | |
| 로거 | ✅ `@adonisjs/logger` | ✅ `@nexusts/logger` (Pino) | |
| 메일 | ✅ `@adonisjs/mail` | ✅ `@nexusts/mail` (SMTP / File / Null) | |
| Drive (파일 스토리지) | ✅ `@adonisjs/drive` | ✅ `@nexusts/drive` (Local / S3 / R2 / memory) | |
| 캐시 | ✅ `@adonisjs/cache` | ✅ `@nexusts/cache` (memory / Drizzle) | |
| 이벤트 | ✅ `@adonisjs/events` | ✅ `@nexusts/events` | wildcards, priorities, guards |
| 큐 | ✅ `@adonisjs/queue` | ✅ `@nexusts/queue` (BullMQ / Cloudflare / memory) | |
| 스케줄러 | ✅ `@adonisjs/scheduler` | ✅ `@nexusts/schedule` (인-트리 cron 파서) | 외부 의존성 없음 |
| Static | ✅ `@adonisjs/static` | ✅ `@nexusts/static` (ETag / Range / MIME) | |
| Health | ✅ `@adonisjs/health` | ✅ `@nexusts/health` (내장 indicator) | |
| SSE | ❌ DIY | ✅ `@nexusts/sse` | Nexus는 SSE를 기본 출시 |
| WebSockets | ❌ DIY | ✅ `@nexusts/ws` | 런타임 자동 감지 (Bun / Node) |
| 업로드 | ❌ DIY | ✅ `@nexusts/upload` | `@Upload()` / `@UploadedFile()` 데코레이터 |
| i18n | ✅ `@adonisjs/i18n` | ✅ `@nexusts/i18n` | `Intl` 기반, pluralization |
| OpenAPI | ❌ DIY | ✅ `@nexusts/openapi` | Zod → OpenAPI 3.1 + Scalar UI |
| Tracing | ❌ DIY | ✅ `@nexusts/tracing` | lazy SDK를 갖춘 OpenTelemetry |
| Metrics | ❌ DIY | ✅ `@nexusts/metrics` | Prometheus / OpenMetrics |
| Bodyparser | ✅ 내장 | ✅ Hono의 `c.req.parseBody()` + `@nexusts/upload` | |
| REPL | ✅ `node ace repl` | ✅ `nx repl` | v0.5에 출시됨 (DI-resolved 객체, exec expression, introspection) |
| Inspector | ✅ `@adonisjs/inspector` | ❌ 출시 안 됨 | 디버깅 전용 |
| Admin panel | ✅ `@adonisjs/admin` | ❌ 출시 안 됨 | 낮은 우선순위 |
| GraphQL | ✅ `@adonisjs/graphql` (legacy) | ✅ `@nexusts/graphql` | SDL-first; `@Resolver`/`@Query`/`@Mutation` 데코레이터 + 전역 클래스 레지스트리 (v0.7.6). Code-first SDL 합성 v0.8. |
| gRPC | ❌ DIY | ✅ `@nexusts/grpc` | v0.5에 출시됨 (reflection-based, unary / streaming v2) |
| Feature flags | ❌ DIY | ✅ `@nexusts/feature-flag` | Rollout, allowlist, denylist, `@FeatureFlag` 데코레이터. v0.8.0 출시. |
| Resilience (서킷 브레이커, retry) | ❌ DIY | ✅ `@nexusts/resilience` | Retry + Circuit Breaker + Bulkhead, 공유 명명 레지스트리, exponential-jitter 백오프. v0.7.0 출시. **새 의존성 0.** |

**헤드라인**: NexusTS v0.7.6는 **모든** AdonisJS v6 battery를
커버하며, 모던 기능 (GraphQL, WebSockets, OpenAPI, SSE,
tracing, metrics, gRPC, resilience)에서 AdonisJS가 battery로
출시하지 않는 것을 능가한다. 모든 **32개** 모듈이 first-party.

---

## 2. v0.3 → v0.8.4에서 해소된 항목

v0.3~v0.8.4 마일스톤이 v0.2 분석에서 식별된 모든
"누락된 battery" 격차를 해소했다. 총 **35개** AdonisJS 스타일 배터리가
출시되었다.

| v0.2에서 누락 | 출시 | 모듈 |
| ------------------- | ------- | ------ |
| 헬스 체크 | v0.3 | `@nexusts/health` |
| Rate limiting / throttling | v0.3 | `@nexusts/limiter` |
| 보안 헤더 (CSRF / HSTS / CSP) | v0.3 | `@nexusts/shield` |
| 설정 관리 | v0.3 | `@nexusts/config` |
| 로깅 | v0.3 | `@nexusts/logger` |
| 캐시 | v0.3 | `@nexusts/cache` |
| 이메일 | v0.3 | `@nexusts/mail` |
| 파일 스토리지 (S3 / R2 / Local) | v0.3 | `@nexusts/drive` |
| 데이터베이스 (기본 ORM) | v0.3 | `@nexusts/drizzle` |
| 데이터베이스 마이그레이션 + CLI | v0.3 | `nx db:migrate` |
| 정적 파일 서빙 | v0.3 | `@nexusts/static` |
| **OpenAPI 생성기** | v0.4 | `@nexusts/openapi` |
| **파일 업로드 헬퍼** | v0.4 | `@nexusts/upload` |
| **Request-scoped DI** | v0.4 | 코어 DI + ALS + Hono 미들웨어 |
| **Server-Sent Events** | v0.4 | `@nexusts/sse` |
| **분산 추적** | v0.4 | `@nexusts/tracing` |
| **Prometheus 메트릭** | v0.4 | `@nexusts/metrics` |
| **WebSockets** | v0.5 | `@nexusts/ws` |
| **암호화 + 패스워드 해싱** | v0.5 | `@nexusts/crypto` |
| **i18n** | v0.5 | `@nexusts/i18n` |
| **gRPC** | v0.5 | `@nexusts/grpc` |
| **`nx repl`** | v0.5 | 인터랙티브 REPL |
| **View engine 분할** | v0.6 | `@nexusts/view` |
| **`nx.config.ts`에서 viewPaths 자동 로드** | v0.6.4 | `Application.tryLoadNxConfig()` |
| **Default view = Rendu, Eta 옵션** | v0.6.4 |
| **Env-aware config (`.env.{NODE_ENV}`)** | v0.6.5 |
| **`nx db:generate` 명령** | v0.6.5 | drizzle-kit wrapper |
| **내장 `sessionMiddleware()`** | v0.6.5 |
| **패키지명 변경 `@nexusts/core`** | v0.6.6 |
| **OpenAPI용 `router.getRoutes()`** | v0.6.6 |
| **`create-nexusts` 스캐폴더** | v0.6.7 |
| **`examples/` + smoke test 슈트** | v0.6.8 | 27개 동작 예제 |
| **Inertia v3 예제 (React + Vue, SPA + SSR)** | v0.6.8 | 4개 예제 (28–31) |
| **`@nexusts/graphql`** | v0.6.9 | SDL-first GraphQL 엔드포인트 |
| **`@nexusts/resilience`** | v0.7.0 | Retry + Circuit Breaker + Bulkhead |

---

## 3. 다른 철학

AdonisJS와 NexusTS는 비슷한 문제를 다른 trade-off로 해결:

| 관심사 | AdonisJS 접근 | NexusTS 접근 |
| ------- | -------------- | ------------- |
| **서버 런타임** | Custom Node HTTP 서버 | Hono (Bun / Node / Workers) |
| **DI** | IoC 컨테이너, 데코레이터, 지연 해결 | 클래스 기반 + `@Inject()`, ALS로 request-scoped |
| **ORM** | Lucid (내장, 관용적) | Drizzle (기본, 덜 관용적) |
| **검증** | Vine (Zoid에서 영감) | Zod (사실상 표준) |
| **관례 vs 조합** | 강한 관례 (lucid → "User.find", routes → "users" 등) | 약한 관례 + 조합 (DI 우선) |
| **번들 크기** | 단일 ~1MB 번들 | 모듈별 번들 (각 ~5-50kb) |
| **First-party 패키지 수** | 30+ `@adonisjs/*` 패키지 | 32개 first-party 모듈 (`@nexusts/*` 아래) |
| **다중 런타임** | Node + Workers | Bun + Node + Workers |
| **빌드 철학** | 하나의 큰 앱 | "스택을 직접 조합" — 필요한 것만 설치 |
| **기본 ORM 스타일** | ActiveRecord (`User.find(id)`) | Drizzle의 쿼리 빌더 + `DrizzleRepository` (Lucid 스타일) |

가장 큰 실제 차이: **AdonisJS는 관례에, NexusTS는 조합에 의존**.
데코레이터와 DI에 익숙하고 "Nest" 스타일을 선호하면 NexusTS가
자연스러울 것. AdonisJS의 Rails 같은 "관례가 설정보다 우선"을
선호하면 NexusTS가 더 장황하게 느껴질 수 있음.

---

## 4. DX 비교 (개발자 경험)

### 라우팅

| 스타일 | AdonisJS | NexusTS |
| ----- | -------- | ------- |
| 클래스 데코레이터 (Nest 스타일) | ❌ | ✅ |
| 라우트 파일 (`routes.ts`) | ✅ | ✅ |
| Functional handler (Hono 스타일) | ❌ | ✅ |
| Resource 라우트 (`Route.resource('users')`) | ✅ | ⚠️ DIY (`make:crud` 스캐폴드 사용) |

NexusTS는 **세 가지** 라우팅 스타일을 제공; AdonisJS는 **하나**
(라우트 파일). Nest 스타일 클래스 컨트롤러를 선호하는 팀에게는
큰 장점.

### 검증

두 프레임워크 모두 Zod 스타일 스키마 사용. AdonisJS는 Vine
출시 (Zod에서 영감); NexusTS는 직접 Zod 사용. DX는 매우
유사 — 선호하는 스타일 선택.

### ActiveRecord 스타일 모델

AdonisJS의 Lucid는 `User.find(id)`, `User.create({...})` 등을 제공.
NexusTS의 `DrizzleRepository`는 같은 관용성 제공:

```ts
// AdonisJS
const user = await User.findOrFail(params.id)
const posts = await user.related('posts').query()

// NexusTS (Lucid 스타일)
const user = await this.users.findByIdOrFail(params.id)
const posts = await this.users.relation(user, 'posts')
```

원시 Drizzle의 쿼리 빌더를 선호하면 `DrizzleService`로 직접 사용 가능:

```ts
// NexusTS (Drizzle 네이티브)
const user = await this.db.select().from(users).where(eq(users.id, id)).get();
const posts = await this.db.select().from(posts).where(eq(posts.userId, user.id));
```

### Hot-reload

두 프레임워크 모두 hot-reload 지원. AdonisJS는 `node ace serve --watch`;
NexusTS는 `bun --hot app/main.ts` 사용. Bun의 hot-reload가 Node보다
빠르므로 NexusTS가 여기서 우세.

### REPL

AdonisJS는 라이브 코드 탐색용 `node ace repl` 보유. NexusTS는
`nx repl` (DI-resolved 객체, exec expression, introspection을
갖춘 인터랙티브 REPL) 출시 — v0.5에 출시됨.

---

## 5. 클러스터 / 다중 인스턴스

| 기능 | AdonisJS | NexusTS |
| ------- | -------- | ------- |
| 공유 DB를 통한 다중 pod | ✅ | ✅ (Drizzle 백엔드) |
| Redis 기반 큐 | ✅ (BullMQ) | ✅ (`@nexusts/queue`) |
| 다중 리전 | ❌ DIY | ❌ DIY |
| 세션 sticky | ⚠️ DIY | ✅ (쿠키 백엔드는 stateless; DB 또는 memory로 폴백) |

AdonisJS와 NexusTS는 여기서 유사: 둘 다 공유 상태에 데이터베이스 의존.
NexusTS의 쿠키 기반 세션은 본질적으로 stateless이므로 다중 리전
배포에서 약간의 우위.

---

## 6. NexusTS가 AdonisJS를 능가하는 곳

여러 AdonisJS battery가 존재하지 않거나 (또는 DIY 전용). NexusTS는
이를 기본 출시:

- **GraphQL** (`@nexusts/graphql`) — AdonisJS는 레거시 graphql
  패키지만 보유; NexusTS는 최신 `@Resolver`/`@Query` 데코레이터와
  SDL-first 엔드포인트 제공.
- **WebSockets** (`@nexusts/ws`) — AdonisJS 사용자는 커스텀
  WebSocket 레이어 작성.
- **Server-Sent Events** (`@nexusts/sse`) — 같은.
- **OpenAPI / Swagger** (`@nexusts/openapi`) — AdonisJS 사용자는
  일반적으로 스펙을 손으로 작성하거나 `@nestjs/swagger` 스타일
  데코레이터 사용.
- **분산 추적** (`@nexusts/tracing`) — AdonisJS 사용자는 OpenTelemetry
  수동 통합.
- **Prometheus 메트릭** (`@nexusts/metrics`) — AdonisJS 사용자는
  `prom-client` 수동 통합.
- **파일 업로드** (`@nexusts/upload`) — AdonisJS 사용자는
  multipart 처리 손으로 작성.
- **Resilience** (`@nexusts/resilience`) — retry, circuit breaker,
  bulkhead, 외부 의존성 0. AdonisJS 사용자는 DIY.
- **Bun 네이티브 런타임** — AdonisJS는 Node 전용.

이들 중 하나라도 필요한 팀은 NexusTS에서 무료로 얻음.

---

## 7. 권장 v0.8+ 로드맵

### v0.6.x — Async RPC & DX — 출시됨

1. **`@nexusts/grpc`** — server + typed client
2. **`nx repl`** — 인터랙티브 REPL
3. **`@nexusts/view`** — view engine 분할
4. **`nx.config.ts`에서 viewPaths 자동 로드** (v0.6.4)
5. **Default view = Rendu, Eta 옵션** (v0.6.4)
6. **Env-aware config** (v0.6.5)
7. **`nx db:generate`** (v0.6.5)
8. **내장 `sessionMiddleware()`** (v0.6.5)
9. **`@nexusts/core` 패키지명 변경** (v0.6.6)
10. **OpenAPI용 `router.getRoutes()`** (v0.6.6)
11. **`create-nexusts` 스캐폴더** (v0.6.7)
12. **`examples/` + smoke test 슈트** (v0.6.8)
13. **Inertia v3 예제** (v0.6.8)

### v0.6.9 — GraphQL — 출시됨

- **`@nexusts/graphql`** — SDL-first GraphQL 엔드포인트.
  `@Resolver`/`@Query`/`@Mutation`/`@Subscription`/`@Arg` 데코레이터.
- **Inertia v3 예제** (28–31: React + Vue, SPA + SSR).
- **example 32** (`graphql-hello`).

### v0.7.0 — Resilience — 출시됨

- **`@nexusts/resilience`** — Retry + Circuit Breaker +
  Bulkhead. **새 의존성 0.**
- **example 33** (`resilience-calls`).

### v0.7.3 — Exception Filters, Interceptors, Guards (출시)

### v0.7.4 — REPL & DX 개선 (출시)

### v0.7.5 — Circuit Breaker Admin API (출시)

- `metrics()`, `forceOpen()`, `forceClose()`, `listCircuits()`.
- `make:repository` CLI 명령어.

### v0.7.6 — Global @Resolver Registry (출시)

- `@Resolver` 전역 클래스 레지스트리.
- `drizzle.config.ts` 자동 생성.

### v0.8.0 — ResilienceAdminModule + FeatureFlagModule (출시)

- `ResilienceAdminModule` HTTP admin endpoints.
- `@nexusts/feature-flag`.
- Code-first GraphQL SDL 합성 (`autoSchema: true`).
- Cross-pod circuit breaker (Redis / Drizzle).

### v0.8.1 — Cross-pod circuit breaker store (출시)

### v0.8.2 — gRPC streaming (출시)

### v0.8.3 — CI workflow 안정화 (출시)

### v0.9 — DataLoader + Federation (계획)

- **DataLoader 통합** — N+1 쿼리 배칭.
- **Federation** — Apollo Federation v2 subgraph.
- **Persisted queries.**
- **Bulkhead 큐 추적.**
- **LaunchDarkly/Unleash 어댑터.**

### v1.0 — Production-ready LTS

- 동결 API surface.
- 마이그레이션 가이드.
- LTS 브랜치 (12개월).

---

## 8. 정직한 평가 (v0.8.4)

v0.8.4 릴리스는 **모든 AdonisJS v6 battery 격차를 해소**.
AdonisJS에서 NexusTS v0.8.4로 마이그레이션하는 팀:

- **모든** first-party battery에 NexusTS에 동등한 것 있음.
- GraphQL (code-first `autoSchema: true`).
- gRPC + streaming (`@GrpcServerStream`).
- Resilience (retry + circuit + bulkhead + HTTP admin).
- Feature flags (`@nexusts/feature-flag`).
- Cross-pod circuit breaker (Redis / Drizzle).
- REPL (`nx repl`).
- 시딩 팩토리 (`Factory<T>`).
- CORS (ShieldModule 내장).
- Cache with Redis backend shorthand.
- **34개 동작 예제**, 69개 smoke test, 314+ unit tests.

**완전한** AdonisJS 커버리지에 여전히 **부족한 것**:

- **Inspector** — 디버깅 전용; 낮은 우선순위.
- **Admin panel** — 낮은 우선순위.

AdonisJS v6 vs NexusTS v0.8.4 차별점:

- **Bun 네이티브** — 빠른 시작, 빠른 I/O, 적은 의존성.
- **모듈별 번들** — 필요한 것만 import.
- **OpenAPI / WebSockets / SSE / tracing / metrics / GraphQL /
  resilience / feature flags** — NexusTS 기본 출시.
- **기본 ORM = Drizzle** — Bun에서 Drizzle가 더 뛰어난 성능.
- **Cloudflare Workers** — NexusTS가 Workers에 더 친화적.

v0.8.4 이후 NexusTS는 오늘 AdonisJS 사용자가 사용 가능한 모든 것에
대한 **실현 가능한 대안**.

---

## 9. 참고

- [`../../CHANGELOG.md`](../../CHANGELOG.md) — 전체 릴리스 노트
- [`../../user-guide/`](../../user-guide/) — 32개 모듈의 가이드
- [`../../user-guide/testing-examples.md`](../../user-guide/testing-examples.md) — smoke test runner 가이드
- [`../../../examples/`](../../../examples/) — 34개 동작 예제 앱
- [`./nestjs-comparison.md`](./nestjs-comparison.md) — 동반 분석
- [AdonisJS 문서](https://docs.adonisjs.com) — 비교 기준선
- [Drizzle ORM](https://orm.drizzle.team) — NexusTS가 출시하는 기본 ORM
