# NexusTS vs NestJS — 종합 분석 리포트

> **작성일**: 2026-06-27 | **프로젝트 버전**: v0.9.13 | **분석 대상**: `nexus-ts/nexusts` (github.com)
> English version: [`nexusts-vs-nestjs-analysis.md`](./nexusts-vs-nestjs-analysis.md)

---

## 1. Executive Summary

NexusTS는 **Bun 네이티브 풀스택 TypeScript 프레임워크**로, **3개월(2026년 4월~6월)** 만에 NestJS가 8년(2017년~2026년)에 걸쳐 구축한 기능의 대부분을 구현했습니다. 데코레이터, DI, HTTP 라우팅, ORM(Drizzle), GraphQL, gRPC, WebSocket, SSE, 큐/스케줄러, 캐시, 보안, 모니터링(메트릭/트레이싱), 헬스체크 등 **33개 독립 모듈**과 **~42,740줄의 TypeScript**로 구성되어 있습니다.

다만 NestJS(70K+ GitHub stars, 2M+/주 npm 다운로드)와 비교하면 **실무 프로덕션 적용은 극초기 단계**입니다.

---

## 2. 기능 완성도 비교 (Feature Parity Matrix)

### 2.1 동등 또는 유사 수준 구현 (33개 모듈)

| 영역 | @nexusts/* 모듈 | NestJS 대응 | 비고 |
|------|----------------|-------------|------|
| **MVC + DI** | `@nexusts/core` | `@nestjs/core` | `@Module`, `@Controller`, `@Injectable`, `@Inject` 동일 |
| **HTTP 라우팅** | `@nexusts/core` | `@nestjs/common` | `@Get`/`@Post`/`@Put`/`@Delete`/`@Patch` |
| **Guards** | `@nexusts/core` | `@nestjs/guards` | `@UseGuards` |
| **Interceptors** | `@nexusts/core` | `@nestjs/interceptors` | `@UseInterceptors` |
| **Exception Filters** | `@nexusts/core` | `@nestjs/filters` | `@UseFilters` |
| **Validation** | `@nexusts/core` (Zod) | `class-validator` + `ValidationPipe` | Zod 기반, `@Validate` 또는 `schema.parse()` |
| **ORM** | `@nexusts/drizzle` (5 dialects) + `@nexusts/kysely` | TypeORM / Prisma / MikroORM | **기본 ORM** Drizzle |
| **GraphQL** | `@nexusts/graphql` | `@nestjs/graphql` | SDL-first + code-first |
| **gRPC** | `@nexusts/grpc` | `@nestjs/microservices` | 반영 기반, 4가지 call types |
| **WebSocket** | `@nexusts/ws` | `@nestjs/websockets` | Bun 네이티브 (Node는 `ws` 패키지) |
| **SSE** | `@nexusts/sse` | 수동 구현 | `SseStream` 내장 |
| **Queue/Jobs** | `@nexusts/queue` | `@nestjs/bullmq` | BullMQ + Cloudflare Queues + memory |
| **Schedule/Cron** | `@nexusts/schedule` | `@nestjs/schedule` | 자체 cron parser, `@Cron`/`@Interval`/`@Timeout` |
| **Cache** | `@nexusts/cache` | `@nestjs/cache-manager` | Tag 기반 무효화, Memory/Drizzle/Redis |
| **Rate Limiting** | `@nexusts/limiter` | `@nestjs/throttler` | 3 전략 × Memory/Drizzle backend |
| **Auth** | `@nexusts/auth` | `@nestjs/passport` + `@nestjs/jwt` | better-auth 통합 |
| **Session** | `@nexusts/session` | `@nestjs/session` | Cookie/Memory/Drizzle/Redis/Cloudflare KV |
| **Config** | `@nexusts/config` | `@nestjs/config` | Zod 검증, 계층형 로딩 |
| **Logger** | `@nexusts/logger` | NestJS Logger | Pino 기반 구조화 로깅 |
| **OpenAPI/Swagger** | `@nexusts/openapi` | `@nestjs/swagger` | Zod → OpenAPI 3.1 + Scalar UI |
| **Health** | `@nexusts/health` | `@nestjs/terminus` | `/health/live`, `/health/ready`, `/health/startup` |
| **Static Files** | `@nexusts/static` | `@nestjs/serve-static` | ETag, Range, 경로 탐색 방지 |
| **File Upload** | `@nexusts/upload` | multer (`@nestjs/platform-express`) | `@Upload`/`@UploadedFile` 데코레이터 |
| **Mail** | `@nexusts/mail` | `@nestjs-modules/mailer` | SMTP/File/Null transports, MJML |
| **Events** | `@nexusts/events` | `@nestjs/event-emitter` | Wildcards, priorities, guards, `@OnEvent` |
| **i18n** | `@nexusts/i18n` | `nestjs-i18n` | `Intl` 기반, pluralization, 날짜/숫자/통화 포맷 |
| **Metrics/Prometheus** | `@nexusts/metrics` | `@willsoto/nestjs-prometheus` | Counter/Gauge/Histogram/Summary |
| **Tracing/OpenTelemetry** | `@nexusts/tracing` | `@nestjs/opentelemetry` | Lazy SDK, auto-HTTP, `@Trace()` 데코레이터 |

### 2.2 NexusTS가 NestJS보다 앞선 영역

| 기능 | @nexusts/* 모듈 | NestJS 현황 |
|------|----------------|-------------|
| **TC39 표준 ES 데코레이터** (experimentalDecorators 불필요) | `@nexusts/core` (v0.9+) | ❌ 여전히 `experimentalDecorators: true` 필요 |
| **reflect-metadata 불필요** | `@nexusts/core/di/safe-reflect` (인라인 폴리필) | ❌ `import 'reflect-metadata'` 강제 |
| **필드 주입 (Field Injection)** | `@Inject(Token) declare field: Type` | ❌ 생성자 주입만 지원 |
| **33개 독립 번들 진입점** | 각 `@nexusts/*` 개별 설치 가능 | ❌ `@nestjs/*` 설치 시 전체 번들 |
| **Bun 네이티브 런타임** | Bun ≥ 1.3 | ❌ Node.js 전용 |
| **Cloudflare Workers 지원** | 내장 런타임 어댑터 | ❌ 미지원 (제3자 어댑터 필요) |
| **Retry / Circuit Breaker / Bulkhead** | `@nexusts/resilience` | ❌ 자체 제공 없음 (BullMQ에 기본 retry만) |
| **Feature Flags (Canary/A–B 테스팅)** | `@nexusts/feature-flag` | ❌ 자체 제공 없음 |
| **File Storage (S3/R2/Local)** | `@nexusts/drive` | ❌ 자체 제공 없음 |
| **암호화 + 비밀번호 해싱** | `@nexusts/crypto` | ❌ 자체 제공 없음 (`crypto` 또는 `bcrypt` 수동) |
| **멀티 런타임 Redis 클라이언트** | `@nexusts/redis` (Bun/Node/Workers KV/Memory) | ❌ 자체 제공 없음 (`ioredis` 직접 사용) |
| **Inertia.js v3 어댑터** | `@nexusts/view/inertia` | ❌ 없음 |
| **3가지 뷰 엔진** (Rendu/Edge/Eta) | `@nexusts/view` | ❌ Express 템플릿만 |
| **SQL 인젝션 안전 raw 쿼리** (구조적) | Drizzle tagged template literals | ❌ TypeORM raw 쿼리 인젝션 위험 |
| **Kysely 타입 SQL 빌더** | `@nexusts/kysely` | ❌ 자체 제공 없음 |

### 2.3 NestJS가 앞서고 NexusTS가 따라잡아야 할 영역

| 영역 | NestJS | NexusTS 상태 | 영향도 |
|------|--------|-------------|--------|
| **커뮤니티 규모** | 70K+ stars, 2M+/주 다운로드 | 미공개 (신규) | 🔴 **심각** — 생태계/플러그인/Q&A 부재 |
| **테스팅 모듈** | `@nestjs/testing` (`Test.createTestingModule`) | `new Application(AppModule)` 만 가능 | 🟢 낮음 — Vitest로 대체 가능 |
| **마이크로서비스** | TCP/NATS/Kafka/RabbitMQ/Redis transport 내장 | gRPC만 가능 | 🟡 중간 |
| **CQRS** | `@nestjs/cqrs` | ❌ 없음 | 🟡 중간 |
| **CLI 플러그인 시스템** | Schematics (`@nestjs/cli`) | `nx` CLI (12 commands, 스캐폴딩 중심) | 🟡 중간 |
| **라우트 버전 관리** | 내장 | ❌ 없음 | 🟢 낮음 |
| **직렬화 (Serialization)** | `class-transformer` | ❌ 없음 | 🟢 낮음 |
| **멀티 ORM 지원** | TypeORM / Prisma / MikroORM / Mongoose | Drizzle + Kysely only | 🟡 중간 |
| **WebSocket (Socket.IO)** | `@nestjs/platform-socket.io` | Bun-native WS만 | 🟡 중간 |
| **배포 성숙도** | npm + Docker + serverless 모두 검증 | npm publish만 | 🟡 **중요** |
| **문서 완성도** | 8년 공식 문서 + 가이드 | 138개 파일, 3개월 | 🟡 중간 — 빠르게 채워지는 중 |
| **패키지 수 (생태계)** | 100+ `@nestjs/*` 패키지 | 33개 모듈 | 🟡 중간 |

---

## 3. 안정성 평가 (Stability Assessment)

### 3.1 강점

| 항목 | 평가 | 근거 |
|------|------|-------|
| **체계적 버전 관리** | ✅ 양호 | SemVer, 상세 CHANGELOG.md (영문/한글) |
| **CI/CD 파이프라인** | ✅ 우수 | 6개 워크플로우 (Bun + Workers + Drizzle + Benchmark + Publish + Webpage) |
| **테스트 커버리지** | ✅ 양호 | 68개 테스트 파일 + 36개 smoke test (~70 tests/2s) |
| **성능 벤치마크** | ✅ 우수 | Hono raw 대비 ~50%, NestJS+Express 대비 3–5× 빠름. 10% 회귀 시 CI 실패 |
| **표준 데코레이터 마이그레이션 완료** | ✅ 완료 | v0.9.0에서 TC39 표준으로 이전 완료 |
| **이중 언어 문서 (영문/한글)** | ✅ 우수 | 모든 사용자 가이드, 설계 문서, API 레퍼런스 |
| **모듈 분리 설계** | ✅ 우수 | 33개 독립 번들 — 필요한 것만 설치 |
| **reflect-metadata 제거** | ✅ 완료 | 인라인 폴리필로 ~16KB 절감 |

### 3.2 위험 요소

| 위험 | 심각도 | 설명 |
|------|--------|------|
| **단일 메인테이너** | 🔴 **심각** | 90%+ 커밋 = 1인 (kabyeon). 유일한 인간 기여자. Bus factor = 1 |
| **프로젝트 연령** | 🟡 3개월 | 첫 커밋 2026-04-30. v0.9.x지만 여전히 pre-v1.0 |
| **실제 사용자 없음** | 🔴 **심각** | GitHub stars, npm 다운로드, production 사례 모두 확인 불가 |
| **Pre-v1.0 Breaking Changes** | 🟡 보통 | minor bump에서도 breaking change 가능 (명시됨) |
| **런타임 제약** | 🟡 보통 | Bun(≥1.3.10) + Cloudflare Workers 전용. Node.js, Deno 미지원 |
| **NestJS 테스트 패턴 미지원** | 🟢 낮음 | `Test.createTestingModule()` 없음. `new Application()` 직접 필요 |
| **Vitest → bun test 마이그레이션 직후** | 🟡 보통 | 2026-06-27 막 전환 (금일). 잔여 이슈 가능성 |
| **마이크로서비스 부재** | 🟡 보통 | gRPC만 있음. Kafka/NATS/RabbitMQ 없음 |
| **LTS/EOL 정책 부재** | 🟡 보통 | v1.0 이후 계획만 언급, 구체적 지원 정책 없음 |
| **npm Publish 검증 부족** | 🟡 보통 | publish workflow는 있으나 실제 npm 데이터 검증 어려움 |

---

## 4. 성능 벤치마크

| 항목 | NexusTS (req/s) | Hono raw (req/s) | 비율 |
|------|:---------------:|:----------------:|:----:|
| hello (plain text) | 48,200 | 91,500 | **52.7%** |
| json | 46,800 | 88,300 | **53.0%** |
| di | 45,100 | 89,000 | **50.7%** |
| middleware (10개 no-op) | 44,500 | 86,200 | **51.6%** |

> **Hono raw 대비 ~50% 처리량** — DI + 데코레이터 + 미들웨어 파이프라인 오버헤드 감안 시 양호.
> **NestJS + Express 대비 3–5× 빠름** (Express는 Hono raw보다 2–3× 느림).
> 출처: `docs/benchmarks.ko.md` — Apple M2 / Bun 1.3 기준.

---

## 5. 개발 속도

| 지표 | 값 |
|------|-----|
| 프로젝트 연령 | 약 3개월 (2026-04-30 ~ 2026-06-27) |
| 총 커밋 | 517+ |
| 릴리즈 수 | 30+ (0.1.0 → 0.9.13) |
| 릴리즈 빈도 | 거의 **매일** (피크: 하루 5–8개) |
| 모듈 증가 | v0.1 (1 module) → v0.9.13 (33 modules) |
| TypeScript 라인 수 | ~42,740줄 |
| 테스트 파일 | 68개 |
| 예제 | 36개 |
| 문서 파일 | 138개 (영문 + 한글) |
| 고유 기여자 | 4명 (인간 1, 봇 2, AI 도우미 1) |

**개발 속도는 매우 인상적** — 3개월 만에 NestJS의 8년치 기능 중 80~90%를 구현했습니다. 그러나 **단일 메인테이너**에 의한 급속한 개발이 프로젝트의 가장 큰 리스크입니다.

---

## 6. 최종 권장사항

### 사용 시나리오별 평가

| 사용 목적 | 권장 | 사유 |
|-----------|------|------|
| **토이 프로젝트 / 개인 학습** | ✅ **NexusTS 추천** | 최신 스택(Bun + 표준 데코레이터 + Drizzle) 경험에 최적 |
| **프로토타입 / MVP** | ✅ **NexusTS 가능** | 빠른 개발 속도, 36개 예제, 풍부한 모듈 |
| **스타트업 프로덕션** | ⚠️ **신중히 검토** | 단일 메인테이너 위험. 팀 규모/역량에 따라 평가 필요 |
| **대규모 엔터프라이즈** | ❌ **NestJS 권장** | LTS 부재, 커뮤니티 부족, 마이크로서비스/메시징 미흡 |
| **Bun 전용 프로젝트** | ✅ **NexusTS 강력 추천** | Bun 최적화, Hono 기반, CLI 스캐폴딩 |
| **Edge (Cloudflare Workers)** | ✅ **NexusTS 적합** | Workers 네이티브 지원 (NestJS는 불가) |

### v1.0 도달을 위한 필요 조건

1. **두 번째 메인테
