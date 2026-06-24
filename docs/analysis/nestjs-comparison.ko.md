# NexusTS vs NestJS — 기능 격차 분석

> English version: [`nestjs-comparison.md`](./nestjs-comparison.md)
> 분석 일자: 2026-06-24 · 기준: NexusTS **v0.8.3**

이 문서는 NexusTS v0.8.3와 [NestJS](https://nestjs.com)를 비교하여
프로덕션 등급 백엔드 기능이 **있음**, **부분적**, **없음** 상태를
식별한다. v0.3, v0.4, v0.5, v0.6.x, v0.7.0 마일스톤이 모든 Tier 1과
Tier 2 격차를 모두 해소했다. 이 분석은 v0.8+ 로드맵을 위한
Tier 3+ 잔존 격차에 집중한다.

> **중요**: NestJS는 7년 된 프레임워크로 주당 ~1000만 다운로드를
> 기록하며 수십 개의 first-party 패키지를 보유. NexusTS는
> 어린 프레임워크다 (v0.7.6, 개발 기간 약 6개월). 프로덕션
> 백엔드에 "지금" 필요한 것만 출시하며, 잔존 격차는 v0.8+
> 로드맵 우선순위를 정하기 위해 여기에 문서화된다.

---

## 1. 요약 표 (v0.7.0)

범례: ✅ 출시 · ⚠️ 부분적 · ❌ 없음 · 🔵 third-party 필요

| 카테고리 | NestJS | NexusTS v0.7.0 | 비고 |
|----------|--------|--------------|-------|
| HTTP / 라우팅 | ✅ GraphQL, WebSockets, gRPC, SSE, Fastify | ✅ Hono + SSE + WS + gRPC + GraphQL | REST + functional + Nest/Adonis 스타일 |
| DI | ✅ Request-scoped, 순환 자동 해결 | ✅ Singleton + transient + request | `AsyncLocalStorage`로 request scope; `@Injectable({ scope: 'request' })` |
| Config | ✅ @nestjs/config, .env 검증 | ✅ `@nexusts/config` | Zod 검증, 레이어 로딩 |
| 보안 | ✅ helmet, throttler, CSRF, CORS | ✅ `@nexusts/shield` + `@nexusts/limiter` | CSRF / HSTS / CSP / rate limit. CORS는 Hono 미들웨어 |
| 데이터베이스 | ✅ TypeORM, Prisma, Mongoose, Sequelize | ✅ `@nexusts/drizzle` (5개 dialect) | Drizzle가 기본 ORM |
| 캐시 | ✅ cache-manager (in-memory / Redis) | ✅ `@nexusts/cache` (memory / Drizzle) | tag-based invalidation; Redis는 커스텀 store |
| 로깅 | ✅ 내장 Logger (Winston / Pino 어댑터) | ✅ `@nexusts/logger` (Pino) | dev에서 pretty, prod에서 JSON, ALS로 request-scoped |
| 실시간 | ✅ WebSocket, SSE, gRPC streaming | ✅ WebSocket + SSE + gRPC | `@nexusts/ws` (Bun + Node) + `@nexusts/sse` + `@nexusts/grpc` |
| 마이크로서비스 | ✅ TCP, Redis, NATS, Kafka, MQTT | ⚠️ `@nexusts/queue` (BullMQ / Cloudflare) | 잡 큐만; service-mesh 전송 없음 |
| API 문서 | ✅ @nestjs/swagger | ✅ `@nexusts/openapi` | Zod에서 OpenAPI 3.1 + Scalar UI |
| 헬스 체크 | ✅ @nestjs/terminus | ✅ `@nexusts/health` | 내장 indicator (memory/disk/http/db) |
| 이메일 | ✅ @nestjs/mailer | ✅ `@nexusts/mail` (SMTP / File / Null) | MJML (옵션 peer) |
| 파일 업로드 | ✅ multer 통합 | ✅ `@nexusts/upload` | `@Upload` / `@UploadedFile` 데코레이터, 크기 + MIME 검증 |
| 파일 스토리지 | ❌ DIY | ✅ `@nexusts/drive` (memory / Local / S3 / R2) | Nexus는 first-party `@nexusts/drive` 보유; Nest는 없음 |
| i18n | ✅ nestjs-i18n | ✅ `@nexusts/i18n` | `Intl` 기반, pluralization, JSON 카탈로그 |
| Tracing | ✅ OpenTelemetry 통합 | ✅ `@nexusts/tracing` | Lazy OTel SDK, W3C + B3 전파 |
| Metrics | ✅ Prometheus 통합 | ✅ `@nexusts/metrics` | Counter / Gauge / Histogram / Summary |
| Auth | ✅ @nestjs/passport + 다수 전략 | ✅ `@nexusts/auth` (better-auth) | better-auth가 다수 전략 지원 |
| 암호화 | ⚠️ DIY (또는 `nestjs-crypto`) | ✅ `@nexusts/crypto` | AES-256-GCM + HMAC + scrypt/argon2 |
| Feature flags | ⚠️ DIY (first-party 없음) | ✅ `@nexusts/feature-flag` | Rollout, allowlist, denylist, `@FeatureFlag` 데코레이터. v0.8.3 출시. |
| GraphQL | ✅ @nestjs/graphql | ✅ `@nexusts/graphql` | SDL-first; `@Resolver`/`@Query`/`@Mutation` 데코레이터 + 전역 클래스 레지스트리 (v0.7.6). Code-first SDL 합성 v0.8 예정. |
| gRPC | ✅ @nestjs/microservices | ✅ `@nexusts/grpc` | Reflection 기반, unary 메소드 (streaming v2 예정). v0.5 출시. |
| Resilience | ⚠️ nestjs-recq | ✅ `@nexusts/resilience` | Retry + Circuit Breaker + Bulkhead, 공유 명명 레지스트리, exponential-jitter 백오프. v0.7.0 출시. **새 의존성 0.** |

**헤드라인**: NexusTS v0.7.0는 v0.2 분석의 **모든 Tier 1 및 Tier 2 격차**를 해소했다. 출시된 **30개** 모듈 모두 first-party.

---

## 2. v0.3 → v0.7.0에서 해소된 항목 (최근 성과)

v0.3, v0.4, v0.5, v0.6.x, v0.6.9, v0.7.0 마일스톤이 v0.2 분석에서 식별된 모든
Tier 1과 Tier 2 격차를 해소했다. 총 **34개** Tier 1+2+3 격차가 해소되었다.

| v0.2에서 누락 | 출시 | 모듈 |
| ------------------- | ------- | ------ |
| 헬스 체크 (`@nestjs/terminus` 등가) | v0.3 | `@nexusts/health` |
| Rate limiting / throttling | v0.3 | `@nexusts/limiter` |
| 보안 헤더 (helmet 등가) | v0.3 | `@nexusts/shield` (CSRF + HSTS + CSP) |
| 설정 관리 (`@nestjs/config` 등가) | v0.3 | `@nexusts/config` |
| 로깅 (Pino / Winston 통합) | v0.3 | `@nexusts/logger` |
| 캐시 (`cache-manager` 등가) | v0.3 | `@nexusts/cache` |
| 이메일 통합 (`@nestjs/mailer` 등가) | v0.3 | `@nexusts/mail` |
| 파일 스토리지 추상화 | v0.3 | `@nexusts/drive` (memory / Local / S3 / R2) |
| 데이터베이스 통합 | v0.3 | `@nexusts/drizzle` (기본 ORM) |
| 데이터베이스 마이그레이션 | v0.3 | `nx db:migrate` + `nx db:migrate --generate` |
| 정적 파일 서빙 | v0.3 | `@nexusts/static` |
| 기본 ORM (Drizzle 스타일) | v0.3 | `@nexusts/drizzle` |
| **OpenAPI / Swagger** | v0.4 | `@nexusts/openapi` |
| **파일 업로드 헬퍼** | v0.4 | `@nexusts/upload` |
| **Request-scoped DI** | v0.4 | 코어 DI + ALS + Hono 미들웨어 |
| **Server-Sent Events** | v0.4 | `@nexusts/sse` |
| **분산 추적** | v0.4 | `@nexusts/tracing` |
| **Prometheus 메트릭** | v0.4 | `@nexusts/metrics` |
| **WebSockets** | v0.5 | `@nexusts/ws` (Bun 기본, Node는 `ws` 경유) |
| **암호화 + 패스워드 해싱** | v0.5 | `@nexusts/crypto` (AES-256-GCM + HMAC + scrypt) |
| **i18n** | v0.5 | `@nexusts/i18n` (Intl 기반, pluralization) |
| **gRPC** | v0.5 | `@nexusts/grpc` (reflection-based, unary) |
| **`nx repl`** | v0.5 | 인터랙티브 REPL |
| **View engine 분할** | v0.6 | `@nexusts/view` (별도 번들) |
| **`nx.config.ts`에서 viewPaths 자동 로드** | v0.6.4 | `Application.tryLoadNxConfig()` |
| **Default view = Rendu, Eta 옵션** | v0.6.4 | `.eta` opt-in |
| **Env-aware config (`.env.{NODE_ENV}`)** | v0.6.5 | 우선순위: process.env > `.env.NODE` > `.env.local` > `.env` |
| **`nx db:generate` 명령** | v0.6.5 | drizzle-kit wrapper |
| **내장 `sessionMiddleware()`** | v0.6.5 | `@Inject(SessionService.TOKEN)`에 커스텀 미들웨어 불필요 |
| **패키지명 변경 `@nexusts/core`** | v0.6.6 | 다른 프로젝트와 npm 이름 충돌 |
| **OpenAPI용 `router.getRoutes()`** | v0.6.6 | 선언된 라우트에서 spec 생성 |
| **`create-nexusts` 스캐폴더** | v0.6.7 | 별도 npm 패키지 |
| **`examples/` + smoke test 슈트** | v0.6.8 | 27개 동작 예제, 55 vitest 테스트 (~2초) |
| **`@nexusts/graphql`** | v0.6.9 | SDL-first GraphQL 엔드포인트 + `GraphQLService`/`GraphQLModule`. `@Resolver`/`@Query`/`@Mutation` 데코레이터 (code-first SDL 합성 alpha). 옵션 peer-dep `graphql` |
| **Inertia v3 예제 (React + Vue, SPA + SSR)** | v0.6.9 | `examples/28-31` 아래 4개 예제 |
| **`@nexusts/resilience`** | v0.7.0 | 단일 DI singleton의 Retry + Circuit Breaker + Bulkhead. 4가지 백오프 전략의 `retry()`, named-circuit 레지스트리. **새 의존성 0.** |
| **예제 + smoke test 확장** | v0.7.0 | 33개 예제 (`32-graphql-hello`, `33-resilience-calls` 추가). |

합계: v0.2 이후 **34개의 Tier 1+2+3 격차 해소**.

---

## 3. Tier 1 — 잔존 critical 격차

없음. v0.3에서 모든 원본 Tier 1 격차가 해소되었다.

---

## 4. Tier 2 — 중요 (대부분의 프로덕션 앱)

### 4.1 WebSockets (`@nestjs/websockets` 등가)

- **상태**: ✅ v0.5에서 `@nexusts/ws`로 해소.
- **출시 내용**: `@WebSocketGateway(path)` + `@OnWebSocketMessage()`
  데코레이터. 연결 추적, rooms, broadcast를 위한 `WebSocketService`.
  `BunWsAdapter` (`hono/bun` 사용) 및 `NodeWsAdapter` (옵션 peer로
  `ws` 패키지 사용) — 런타임 자동 감지.
- [`../../user-guide/ws.md`](../../user-guide/ws.md) 참조.

### 4.2 Server-Sent Events (SSE)

- **상태**: ✅ v0.4에서 `@nexusts/sse`로 해소 (Hono의 `streamSSE`를
  타입 안전 `SseStream`으로 래핑, 자동 직렬화, 멱등 `close()`,
  `Last-Event-ID` 재연결 지원). [`../../user-guide/sse.md`](../../user-guide/sse.md) 참조.

### 4.3 Request-scoped DI를 코어 기능으로

- **상태**: ✅ v0.4에서 해소. `DIContainer`가 이제 `scope: 'request'`
  provider를 지원 (`@Injectable({ scope: 'request' })`로 선언)
  하며, Hono 미들웨어가 `AsyncLocalStorage`로 per-request scope를
  활성화. 서비스 코드는 `getRequest()` / `getRequestScope()`로
  활성 요청을 읽을 수 있고, `REQUEST` 토큰이 라이브 Hono
  컨텍스트를 주입. [`../../user-guide/request-scope.md`](../../user-guide/request-scope.md) 참조.

### 4.4 gRPC (`@nestjs/microservices` 부분)

- **용도**: 서비스 간 고성능 RPC.
- **상태**: ✅ v0.5에서 `@nexusts/grpc`로 출시됨.
- **출시 내용**:
  - `GrpcModule.forRoot()` — `@grpc/proto-loader`로 런타임에 `.proto` 로드 (reflection-based, codegen 없음).
  - `@GrpcService()` 데코레이터 — 컨트롤러 클래스에서 unary 서비스 메소드 등록.
  - 타입 안전 클라이언트 — `grpcClient()`가 프록시 반환.
  - 런타임 백엔드 자동 감지 (Bun / Node).
- **비고**: v1은 unary만, 스트리밍 (server / client / bidi) 은 v2 예정.
- [`../../user-guide/grpc.md`](../../user-guide/grpc.md) 참조.

---

## 5. Tier 3 — Nice-to-have

### 5.1 i18n (`nestjs-i18n` 등가)

- **상태**: ✅ v0.5에서 `@nexusts/i18n`로 해소.
- [`../../user-guide/i18n.md`](../../user-guide/i18n.md) 참조.

### 5.2 Feature flags

- **용도**: 카나리 배포, A/B 테스트, 점진적 롤아웃.
- **상태**: ❌ 아직 출시 안 됨.
- **제안 모듈**: `@nexusts/feature-flag`
- **기능**:
  - `@FeatureFlag('new-dashboard')` 데코레이터
  - 백엔드: in-memory / LaunchDarkly / Unleash
  - 테넌트 / 사용자별 타겟팅

### 5.3 Tracing (OpenTelemetry)

- **상태**: ✅ v0.4에서 `@nexusts/tracing`으로 해소. Lazy
  `@opentelemetry/sdk-node` 로드, W3C + B3 전파, Hono 자동
  계측 미들웨어, `@Trace()` 데코레이터. [`../../user-guide/tracing.md`](../../user-guide/tracing.md) 참조.

### 5.4 Metrics (Prometheus)

- **상태**: ✅ v0.4에서 `@nexusts/metrics`로 해소. Counter /
  Gauge / Histogram / Summary, `@Counted` / `@Timed` 데코레이터,
  content negotiation이 있는 `/metrics` 엔드포인트 (Prometheus
  0.0.4 / OpenMetrics 1.0.0). 기본 Node.js 프로세스 메트릭.
  [`../../user-guide/metrics.md`](../../user-guide/metrics.md) 참조.

### 5.5 암호화 + 패스워드 해싱

- **상태**: ✅ v0.6에서 `@nexusts/crypto`로 해소. AES-256-GCM 인증된
  암호화, HMAC-SHA256 sign/unsign, scrypt 패스워드 해싱 (기본,
  Node 내장), 옵션 `@node-rs/argon2` peer. `EncryptionService`는
  `@nexusts/session` 및 `@nexusts/shield`에서 HMAC용으로 내부 사용.
  [`../../user-guide/crypto.md`](../../user-guide/crypto.md) 참조.

---

## 6. Quick wins (작은 노력, 큰 효과)

| 작업 | 노력 | 효과 | 상태 |
|------|------|------|------|
| CORS 추상화 | 낮음 | 중간 | 진행 중 (Hono의 `cors()` 동작; 얇은 래퍼가 일관된 config 제공) |
| 다중 런타임 패리티 테스트 | 낮음 | 높음 | 진행 중 (Bun / Node / Workers) |
| `@nexusts/cache` Redis store | 낮음 | 높음 | 진행 중 (`CacheStore` 인터페이스 구현하는 백엔드 하나 더) |
| Multipart body parser wrapper | 낮음 | 중간 | ✅ `@nexusts/upload`으로 출시 (v0.4) |
| `helmet()` 미들웨어 | 매우 낮음 | 높음 | 진행 중 (일부 조각은 `@nexusts/shield`에 출시) |

GraphQL은 v0.6.9에서, Resilience는 v0.7.0에서 출시되어 이제 이 두
격차는 해소되었다. 남은 가장 큰 레버리지는 **Feature flags**와
**코드 우선 GraphQL SDL 합성**이다.

---

## 7. 권장 v0.7+ 로드맵

### v0.6.x — Async RPC & DX ("polyglot" 마일스톤) — 출시됨

v0.5–v0.6.8에서 출시:

1. **`@nexusts/grpc`** — server + typed client (unary, reflection-based)
2. **`nx repl`** — 인터랙티브 REPL
3. **`@nexusts/view`** — view engine 분할 (별도 번들)
4. **`nx.config.ts`에서 viewPaths 자동 로드** (v0.6.4) — 명시적 호출 불필요
5. **Default view = Rendu, Eta 옵션** (v0.6.4)
6. **Env-aware config (`.env.{NODE_ENV}`)** (v0.6.5)
7. **`nx db:generate`** (v0.6.5) — drizzle-kit wrapper
8. **내장 `sessionMiddleware()`** (v0.6.5)
9. **`@nexusts/core` 패키지명 변경** (v0.6.6)
10. **OpenAPI용 `router.getRoutes()`** (v0.6.6)
11. **`create-nexusts` 스캐폴더** (v0.6.7)
12. **`examples/` + smoke test 슈트** (v0.6.8)
13. **Inertia v3 예제** (v0.6.8)

### v0.6.9 — GraphQL — 출시됨

- **`@nexusts/graphql`** — SDL-first GraphQL 엔드포인트.
  `@Resolver`/`@Query`/`@Mutation`/`@Subscription`/`@Arg` 데코레이터.
  옵션 peer-dep `graphql`.
- **4개 Inertia v3 예제** (examples 28–31).
- **example 32** (`graphql-hello`).

### v0.7.0 — Resilience — 출시됨

- **`@nexusts/resilience`** — Retry + Circuit Breaker + Bulkhead.
  **새 의존성 0.** 순수 TypeScript.
- **example 33** (`resilience-calls`).

### v0.7.3 — Exception Filters, Interceptors, Guards (출시)

- `@UseFilters()`, `@UseInterceptors()`, `@UseGuards()` 데코레이터.
- Lifecycle Hooks (`OnModuleInit` 등).

### v0.7.4 — REPL & DX 개선 (출시)

- REPL `.services`, `.modules`, `.routes` 수정.
- Logger pino 직접 의존성으로 변경.
- Schedule 핫리로드 지원.

### v0.7.5 — Circuit Breaker Admin API (출시)

- `metrics()`, `forceOpen()`, `forceClose()`, `reset()`, `listCircuits()`.
- `make:repository` CLI 명령어 추가.
- `route:list` 프리픽스 수정, `db:seed` 경로 수정.

### v0.7.6 — Global @Resolver Registry (출시)

- `@Resolver` 전역 클래스 레지스트리.
- `drizzle.config.ts` 자동 생성.
- DB 드라이버 deps 자동 추가.

### v0.8 — Hardening + Feature flags (계획)

- **Code-first GraphQL SDL 합성**.
- **`@nexusts/feature-flag`**.
- **Cross-pod circuit breakers**.
- 안정적인 public API surface (semver 보장).
- 다중 런타임 CI.

### v1.0 — Production-ready LTS

- 동결된 API surface.
- 마이그레이션 가이드.
- LTS 브랜치 (12개월).

---

## 8. 정직한 평가 (v0.7.6)

NexusTS v0.7.0는 **대부분의 백엔드 서비스를 위한 production-ready** 상태:

- MVC + DI + 검증 코어가 견고하고 실전 검증됨.
- 모든 **30개** 옵션 모듈이 독립적으로 사용 가능하고 잘 분리됨.
- **Tier 1 및 Tier 2 격차가 모두 해소**. 모든 프로덕션-필수
  인프라 조각이 출시됨.
- **33개 동작 예제**가 모든 주요 모듈을 다루며 살아있는 문서 역할.
- `examples/`의 smoke test 슈트가 매 커밋마다 import / DI / wiring
  회귀를 잡는다.

NestJS 기능 패리티에 **부족한 것**:

- **Code-first GraphQL SDL 합성** (alpha; v0.8 정식 출시). 지금은
  SDL을 직접 사용.
- **Feature flags** (`@nexusts/feature-flag`) — v0.8 계획.
- **Cross-pod circuit breakers** — v0.8 계획.
- **Federation** (Apollo Federation v2 subgraph) — v0.8+ 계획.

v0.7.0에서 v1.0까지의 경로:

- **v0.7.1** (계획): Inertia `<Form>` SDK 안정화, code-first GraphQL SDL
  합성, eager resilience wrapping, 서킷 브레이커 admin API.
- **v0.8** (2026 Q3): Hardening + Feature flags — 안정 public API,
  다중 런타임 CI, feature flags, cross-pod circuit breakers,
  code-first GraphQL SDL 합성.
- **v1.0** (2027 Q1): Production-ready LTS — 동결 API surface,
  마이그레이션 가이드, 장기 지원 브랜치.

v0.7.0 이후 NexusTS는 Bun의 런타임 + ORM 이점을 가지고 NestJS가
오늘 지원하는 모든 백엔드의 **실현 가능한 대안**.

---

## 9. 참고

- [`../../CHANGELOG.md`](../../CHANGELOG.md) — v0.7.0 릴리스 노트
- [`../../user-guide/`](../../user-guide/) — 30개 모듈의 가이드
- [`../../user-guide/testing-examples.md`](../../user-guide/testing-examples.md) — smoke test runner 가이드
- [`../../../examples/`](../../../examples/) — 33개 동작 예제 앱
- [NestJS 문서](https://docs.nestjs.com) — 비교 기준선
- [Bulletproof Node.js 아키텍처](https://github.com/santiq/bulletproof-nodejs) —
  이 분석이 파생된 프로덕션 체크리스트
