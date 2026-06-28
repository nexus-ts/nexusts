# NexusTS vs AdonisJS — 종합 분석 리포트

> **작성일**: 2026-06-27 | **프로젝트 버전**: v0.9.13 | **분석 대상**: `nexus-ts/nexusts` (github.com)
> English version: [`nexusts-vs-adonisjs-analysis.md`](./nexusts-vs-adonisjs-analysis.md)

---

## 1. Executive Summary

NexusTS는 스스로를 **"NestJS 구조 × Adonis 생산성 × Hono 엣지 성능"** 으로 포지셔닝합니다. AdonisJS와의 비교는 NestJS 비교보다 더 미묘한 차이를 보입니다.

**AdonisJS** (v7.3.4, 2026년 6월)는 **11년 이상**의 역사를 가진 성숙한 프로덕션 검증 프레임워크입니다 — 23K GitHub stars, 363명의 기여자, 주간 78K+ npm 다운로드, 7.7K Discord 커뮤니티. Node.js 24+에서 구동되며, 45개 이상의 공식 패키지를 보유하고 있습니다. v7 릴리스에서는 end-to-end 타입 안전성과 제로 구성 OpenTelemetry를 추가했습니다.

**NexusTS** (v0.9.13, 2026년 6월)는 **3개월 된** 단일 메인테이너 프레임워크입니다. 대부분의 "batteries included" 기능에서 AdonisJS와 일치하며, 일부 영역(GraphQL, gRPC, Resilience, 표준 데코레이터, Bun/Workers 런타임)에서는 **능가**하지만, AdonisJS가 10년 이상 쌓아온 **프로덕션 성숙도, 커뮤니티, 생태계 깊이, 배틀 테스팅**은 부족합니다.

---

## 2. 프로젝트 성숙도 비교

| 지표 | AdonisJS | NexusTS | 우위 |
|------|----------|---------|------|
| **첫 릴리스** | ~2015년 (11년+) | 2026-04-30 (3개월) | **AdonisJS** |
| **최신 안정 버전** | v7.3.4 (2026년 6월) | v0.9.13 (2026년 6월) | — (둘 다 활동적) |
| **런타임** | Node.js 24+ | Bun ≥1.3.10 + Cloudflare Workers | **NexusTS** (멀티 런타임) |
| **GitHub Stars** | ~23,000 | 미공개 (신규) | **AdonisJS** |
| **기여자 수** | 363명 | 4명 (인간 1, 봇 2, AI 1) | **AdonisJS** |
| **npm 주간 다운로드** | ~78,000 (`@adonisjs/core`) | 미공개 | **AdonisJS** |
| **공식 패키지** | 45개+ | 33개 | **AdonisJS** (더 깊은 생태계) |
| **커뮤니티** | 7.7K Discord, 11K X, 45 스폰서 | 없음 | **AdonisJS** |
| **프로덕션 사용자** | 광범위 (SaaS, API, 내부 도구) | 알려진 사례 없음 | **AdonisJS** |
| **SemVer 정책** | 엄격 (major = breaking) | Pre-v1.0 (minor에서도 breaking 가능) | **AdonisJS** |
| **문서** | 11년+ 문서 | 138개 파일, 3개월 | **AdonisJS** |
| **이중 언어 문서** | 영어 전용 | 영어 + 한국어 | **NexusTS** |

---

## 3. 기능 비교표 (Feature Parity Matrix)

### 3.1 "Batteries Included" — 두 프레임워크 모두 제공

| 기능 | AdonisJS | NexusTS | 평가 |
|------|----------|---------|------|
| **HTTP 서버 + 라우팅** | `@adonisjs/core` (Edge router) | **Hono** (내장) | ✅ 동등 |
| **DI 컨테이너** | `@adonisjs/core` (IoC container) | `@nexusts/core` (DIContainer) | ✅ 동등 |
| **ORM** | **Lucid** (`@adonisjs/lucid`) | `@nexusts/drizzle` (5 dialects) + `@nexusts/kysely` | ✅ 동등 (다른 패러다임) |
| **Validation** | VineJS | **Zod** (직접 사용, 래퍼 없음) | ✅ 동등 |
| **Auth** | `@adonisjs/auth` | `@nexusts/auth` (better-auth) | ✅ 동등 |
| **Session** | `@adonisjs/session` | `@nexusts/session` (cookie/memory/Drizzle/Redis/KV) | ⚡ NexusTS (더 많은 백엔드) |
| **Cache** | `@adonisjs/cache` | `@nexusts/cache` (memory/Drizzle/Redis + 태그 무효화) | ✅ 동등 |
| **Logger** | `@adonisjs/logger` | `@nexusts/logger` (Pino, request-scoped) | ✅ 동등 |
| **Config/Env** | `@adonisjs/config` | `@nexusts/config` (Zod 검증) | ✅ 동등 |
| **Shield (보안)** | `@adonisjs/shield` (CSRF + CSP + HSTS) | `@nexusts/shield` (CSRF + HSTS + CSP + XFO + Referrer) | ⚡ NexusTS (더 많은 헤더) |
| **Rate Limiting** | `@adonisjs/throttler` | `@nexusts/limiter` (3 전략 × 2 백엔드) | ✅ 동등 |
| **Mail** | `@adonisjs/mail` | `@nexusts/mail` (SMTP/File/Null + MJML) | ✅ 동등 |
| **Drive (파일 저장소)** | `@adonisjs/drive` (Local/S3/R2) | `@nexusts/drive` (Local/S3/R2/memory) | ✅ 동등 |
| **Queue** | `@adonisjs/queue` | `@nexusts/queue` (BullMQ + Cloudflare + memory) | ✅ 동등 |
| **Scheduler** | `@adonisjs/scheduler` | `@nexusts/schedule` (자체 cron parser) | ✅ 동등 |
| **Events** | `@adonisjs/events` | `@nexusts/events` (wildcards, priorities, guards) | ⚡ NexusTS (더 풍부한 기능) |
| **Static Files** | `@adonisjs/static` | `@nexusts/static` (ETag, Range, SPA fallback) | ✅ 동등 |
| **Health Checks** | `@adonisjs/health` | `@nexusts/health` (live/ready/startup, multi-indicator) | ✅ 동등 |
| **i18n** | `@adonisjs/i18n` | `@nexusts/i18n` (`Intl` 기반, pluralization) | ✅ 동등 |
| **암호화** | `@adonisjs/encryption` | `@nexusts/crypto` (AES-256-GCM + HMAC) | ✅ 동등 |
| **비밀번호 해싱** | `@adonisjs/hash` | `@nexusts/crypto` (scrypt + argon2) | ✅ 동등 |
| **CLI** | Ace (`node ace ...`) | `nx` CLI (12 commands, ACE-style) | ✅ 동등 |
| **REPL** | `node ace repl` | `nx repl` (DI introspection 포함) | ✅ 동등 |
| **View Engine** | Edge templates | **3개 엔진** (Rendu/Edge/Eta, 자동 감지) | ⚡ NexusTS (더 많은 선택지) |
| **Inertia.js** | `@adonisjs/inertia` | `@nexusts/view` (Inertia v3, React/Vue SSR) | ✅ 동등 |
| **Testing** | `@adonisjs/testing` | Vitest + `new Application()` | ⚡ AdonisJS (전용 모듈 있음) |

### 3.2 NexusTS가 있고 AdonisJS에는 없는 기능

| 기능 | @nexusts/* 모듈 | AdonisJS 현황 |
|------|----------------|---------------|
| **GraphQL** (SDL + code-first) | `@nexusts/graphql` | ❌ 자체 제공 없음 (커뮤니티 패키지만) |
| **gRPC** (4가지 call types) | `@nexusts/grpc` | ❌ 자체 제공 없음 |
| **WebSocket** (Bun 네이티브) | `@nexusts/ws` | ❌ 자체 제공 없음 |
| **SSE** (Server-Sent Events) | `@nexusts/sse` | ❌ 자체 제공 없음 |
| **Metrics/Prometheus** | `@nexusts/metrics` | ❌ 자체 제공 없음 |
| **Tracing/OpenTelemetry** | `@nexusts/tracing` | ✅ **v7에서 신규** (`@adonisjs/otel`) |
| **Resilience** (retry + circuit + bulkhead) | `@nexusts/resilience` | ❌ 자체 제공 없음 |
| **Feature Flags** (canary/A–B) | `@nexusts/feature-flag` | ❌ 자체 제공 없음 |
| **OpenAPI/Swagger** (Zod → OpenAPI 3.1) | `@nexusts/openapi` | ❌ 자체 제공 없음 |
| **File Upload** (`@Upload`/`@UploadedFile`) | `@nexusts/upload` | ✅ bodyparser (덜 ergonomic) |
| **Kysely 타입 SQL 빌더** | `@nexusts/kysely` | ❌ 자체 제공 없음 |
| **Redis 멀티 런타임 클라이언트** | `@nexusts/redis` | ✅ `@adonisjs/redis` (Node 전용) |
| **TC39 표준 ES 데코레이터** | `@nexusts/core` (v0.9+) | ❌ 레거시 데코레이터만 |
| **reflect-metadata 불필요** | `@nexusts/core/di/safe-reflect` | ❌ `reflect-metadata` 필요 |
| **필드 주입 (Field Injection)** | `@Inject(Token) declare field: Type` | ❌ 생성자 주입만 |
| **Bun 네이티브 런타임** | 내장 | ❌ Node.js 전용 |
| **Cloudflare Workers / Edge** | 내장 런타임 어댑터 | ❌ 미지원 |

### 3.3 AdonisJS가 있고 NexusTS에는 없는 기능

| 기능 | AdonisJS | NexusTS 상태 | 영향도 |
|------|----------|-------------|--------|
| **프로덕션 성숙도** | 11년+, 수천 개 앱 | 3개월, 알려진 사용자 0명 | 🔴 **심각** |
| **Lucid ORM (Active Record)** | 성숙, 풍부한 쿼리 빌더, migrations, factories, seeders | Drizzle (Data Mapper) — 다른 패러다임 | 🟡 중간 |
| **VineJS** (Adonis 고유 validation) | 전용 validation 프레임워크, DTO/schema 재사용 | Zod (범용) — 더 널리 알려짐 | 🟢 낮음 |
| **Edge templates** (`.edge` 파일) | 성숙, partials, layouts, components, markdown | 3개 엔진 (Edge 어댑터 지원) | 🟢 낮음 |
| **Ally (Social Auth)** | GitHub, Google, Twitter OAuth 내장 | better-auth (더 넓지만 전용 Ally 없음) | 🟡 중간 |
| **Bouncer (Authorization)** | `@adonisjs/bouncer` — abilities, policies, gates | ❌ 자체 제공 없음 | 🟡 **중요** |
| **CORS 설정** | Shield 내장 | Hono의 `cors()` 미들웨어 | 🟢 낮음 |
| **Bodyparser** | `@adonisjs/bodyparser` — 설정 가능한 multipart, JSON, URL-encoded | Hono 내장 + `@nexusts/upload` | 🟢 낮음 |
| **Serializer** | `@adonisjs/lucid` serializer — `$.snakeCase()`, `$.json()` | ❌ 없음 | 🟢 낮음 |
| **Inspector / Debug toolbar** | 자체 제공 | ❌ 없음 | 🟡 중간 |
| **Content collections** | `@adonisjs/content` (v7) — Markdown CMS | ❌ 없음 | 🟢 낮음 |
| **Vite 통합** | 자체 제공 (`@adonisjs/vite`) | ❌ 없음 | 🟡 중간 |
| **Test helpers** | `@adonisjs/testing` — `httpClient()`, `loginAs()` 등 | Vitest만 — 프레임워크 레벨 test helpers 없음 | 🟡 중간 |
| **생태계 깊이** | 45개+ 공식 패키지, 커뮤니티 플러그인 | 33개 모듈, 커뮤니티 플러그인 없음 | 🟡 **중요** |

---

## 4. 아키텍처 철학 차이

| 측면 | AdonisJS | NexusTS |
|------|----------|---------|
| **런타임** | Node.js 24+ 전용 | Bun (primary) + Cloudflare Workers |
| **데코레이터** | 레거시 (`experimentalDecorators: true`) | **TC39 표준 ES 데코레이터** (v0.9+) |
| **DI 패턴** | 생성자 주입 + `@inject()` | 필드 주입 `@Inject(Token) declare field: Type` |
| **컨트롤러 패턴** | 일반 클래스 + 메서드, `start/routes.ts`에서 라우트 바인딩 | `@Controller('/path')` 클래스 + `@Get`/`@Post` 메서드 데코레이터 |
| **라우팅** | 라우트 파일 (`start/routes.ts`), `Route.group()`, `Route.resource()` | 3가지 스타일: Nest (데코레이터) / Adonis (라우트 테이블) / Functional (Hono raw) |
| **ORM 패러다임** | **Active Record** (Lucid — `User.find()`, `user.save()`) | **Data Mapper** (Drizzle — `db.select().from(users)`) |
| **Validation** | VineJS (전용, DSL 스타일) | Zod (표준 라이브러리, 스키마 컴포지션) |
| **모듈 시스템** | 서비스 프로바이더 + 설정 파일 + 라우트 파일 | `@Module({ controllers, providers, imports, exports })` (NestJS 스타일) |
| **CLI** | Ace (`node ace make:controller`) | `nx` (`nx make:controller`) |
| **템플릿 엔진** | Edge (primary, `.edge` 파일) | Rendu (default) + Edge + Eta (3개 엔진) |
| **모듈성** | 모놀리식 `@adonisjs/core` + 서비스 프로바이더 | **33개 독립 npm 패키지** — 필요한 것만 설치 |
| **Reflect-metadata** | 필수 (`reflect-metadata` 폴리필) | ❌ 불필요 (safe-reflect.ts에 인라인 폴리필) |

---

## 5. 안정성 평가

### 5.1 NexusTS 강점 vs AdonisJS

| 영역 | 평가 | 설명 |
|------|------|------|
| **런타임 현대성** | ⚡ **NexusTS** | Bun + CF Workers vs Node.js 전용. 빠른 시작, 핫 리로드, 엣지 네이티브 |
| **데코레이터 표준** | ⚡ **NexusTS** | TC39 표준 (미래 지향적) vs 레거시 `experimentalDecorators` |
| **번들 트리셰이킹** | ⚡ **NexusTS** | 33개 독립 진입점 vs 모놀리식 `@adonisjs/core` |
| **추가 모듈** | ⚡ **NexusTS** | GraphQL, gRPC, Resilience, Feature Flags — 모두 자체 제공 (AdonisJS는 없음) |
| **성능** | ⚡ **NexusTS** | Hono 기반 (엣지 최적화) vs AdonisJS의 Node.js/Express 계열 라우터 |
| **이중 언어 문서** | ⚡ **NexusTS** | 영어 + 한국어 vs 영어 전용 |
| **reflect-metadata 독립** | ⚡ **NexusTS** | 외부 폴리필 불필요 vs AdonisJS는 `reflect-metadata` 필요 |

### 5.2 AdonisJS 강점 vs NexusTS

| 영역 | 평가 | 설명 |
|------|------|------|
| **프로덕션 트랙 레코드** | 🏆 **AdonisJS** | 11년+, 수천 개 프로덕션 앱. NexusTS: 알려진 프로덕션 사용자 0 |
| **커뮤니티 생태계** | 🏆 **AdonisJS** | 23K stars, 363 기여자, 7.7K Discord, 45 스폰서, 45+ 패키지 |
| **성숙도 & 안정성** | 🏆 **AdonisJS** | 엄격한 SemVer, v7.x, 검증된 업그레이드 경로. NexusTS: pre-v1.0 |
| **메인테이너 다양성** | 🏆 **AdonisJS** | 코어 팀 + 363 기여자. NexusTS: 단일 메인테이너 (bus factor = 1) |
| **Authorization** | 🏆 **AdonisJS** | `@adonisjs/bouncer` — policies, gates, abilities. NexusTS: 없음 |
| **Vite 통합** | 🏆 **AdonisJS** | `@adonisjs/vite` 자체 제공. NexusTS: 없음 |
| **Testing 도구** | 🏆 **AdonisJS** | `@adonisjs/testing` — `httpClient()`, `loginAs()`. NexusTS: Vitest만 |
| **Ally (Social Auth)** | 🏆 **AdonisJS** | GitHub, Google, Twitter OAuth 내장. NexusTS: 없음 |
| **Inspector/debug toolbar** | 🏆 **AdonisJS** | 자체 제공. NexusTS: 없음 |
| **문서 깊이** | 🏆 **AdonisJS** | 11년의 가이드, 레시피, 튜토리얼. NexusTS: 양호하지만 3개월 |

### 5.3 위험 요소 비교

| 위험 요소 | AdonisJS | NexusTS |
|-----------|----------|---------|
| **프레임워크 중단 위험** | 🟢 낮음 — 대규모 커뮤니티, 45 스폰서 | 🔴 **높음** — 단일 메인테이너 |
| **런타임 종속 위험** | 🟢 낮음 — Node.js는 보편적 | 🟡 중간 — Bun + Workers 전용 |
| **Breaking Changes** | 🟢 낮음 — 엄격한 SemVer (v7→v8 codemod) | 🔴 **높음** — pre-v1.0, minor에서도 breaking 가능 |
| **보안 취약점 대응** | 🟢 11년 검증 | 🟡 미지수 — 트랙 레코드 없음 |
| **패키지 호환성** | 🟢 45+ 패키지, 11년 | 🟡 33개 패키지, 미검증 interop |
| **학습 곡선 투자** | 🟢 이전 가능한 Node.js 스킬 | 🟡 Bun 특화 패턴 (이전 불확실) |
| **채용 풀** | 🟢 주간 78K npm 다운로더 | 🔴 사실상 제로 |

---

## 6. 성능 (NexusTS 벤치마크)

| 항목 | NexusTS (req/s) | Hono raw (req/s) | 비율 |
|------|:---------------:|:----------------:|:----:|
| hello (plain text) | 48,200 | 91,500 | **52.7%** |
| json | 46,800 | 88,300 | **53.0%** |
| di | 45,100 | 89,000 | **50.7%** |
| middleware (10개 no-op) | 44,500 | 86,200 | **51.6%** |

> **NexusTS가 AdonisJS보다 성능이 크게 우수할 것으로 예상** — Hono는 고성능 엣지 라우터(Fastify 수준)인 반면, AdonisJS는 전통적인 Node.js HTTP 계층 위에서 구동됩니다. 단, **두 프레임워크 간 직접 벤치마크는 존재하지 않습니다.**
> 출처: `docs/benchmarks.ko.md` — Apple M2 / Bun 1.3 기준.

---

## 7. 개발 속도

| 지표 | NexusTS | AdonisJS |
|------|---------|----------|
| **프로젝트 연령** | 3개월 (2026년 4~6월) | 11년+ (~2015년~2026년) |
| **모듈 수** | 3개월 만에 33개 | 11년 만에 45개+ |
| **커밋** | 3개월 만에 517+ | 10,000+ (추정) |
| **릴리즈** | 30+ (0.1.0 → 0.9.13) | 수백 회 (v1 → v7) |
| **기여자** | 4명 (인간 1명) | 363명 |
| **TypeScript 라인 수** | ~42,740 | 미상 (~500K+ 추정) |

---

## 8. 최종 권장사항

### 사용 시나리오별 평가

| 사용 목적 | 권장 | 사유 |
|-----------|------|------|
| **프로덕션 Node.js API** | ✅ **AdonisJS** | 검증됨, 안정적, 큰 생태계, authorization, testing 도구 |
| **Bun 네이티브 프로젝트** | ✅ **NexusTS** | Bun 최적화, Cloudflare Workers, Node.js 비의존 |
| **풀스택 SPA + SSR** | ✅ **둘 다 가능** | 둘 다 Inertia.js 보유. AdonisJS는 Vite 통합; NexusTS는 React/Vue SSR |
| **GraphQL API 서버** | ✅ **NexusTS** | 자체 GraphQL vs AdonisJS는 커뮤니티 패키지 필요 |
| **gRPC 마이크로서비스** | ✅ **NexusTS** | 자체 gRPC (4 call types). AdonisJS: 없음 |
| **Edge / Cloudflare Workers** | ✅ **NexusTS** | 네이티브 Workers 지원. AdonisJS: 불가능 |
| **대규모 엔터프라이즈** | ✅ **AdonisJS** | 검증된 트랙 레코드, 커뮤니티, authorization |
| **실시간 앱 (WebSocket/SSE)** | ✅ **NexusTS** | 자체 WS + SSE. AdonisJS: 자체 없음 |
| **프로토타입 / MVP (Bun)** | ✅ **NexusTS** | 빠른 스캐폴딩, 36개 예제, 풍부한 모듈 |
| **프로토타입 / MVP (Node)** | ✅ **AdonisJS** | 도움말/튜토리얼 찾기 더 쉬움 |

### NexusTS가 채우는 AdonisJS의 갭

1. **GraphQL** — AdonisJS에 자체 GraphQL 통합 없음
2. **gRPC** — AdonisJS에 gRPC 지원 없음
3. **Resilience 패턴** — AdonisJS에 retry/circuit/bulkhead 없음
4. **WebSocket** — AdonisJS에 자체 WebSocket 없음
5. **Cloudflare Workers** — AdonisJS는 Node.js 전용
6. **표준 데코레이터** — AdonisJS는 여전히 레거시 `experimentalDecorators`
7. **번들 트리셰이킹** — AdonisJS 패키지가 더 모놀리식

### NexusTS가 따라잡아야 할 AdonisJS의 갭

1. **Authorization (Bouncer)** — `@adonisjs/bouncer`에 해당하는 모듈 없음
2. **Social Auth (Ally)** — GitHub/Google/Twitter OAuth 모듈 없음
3. **Vite 통합** — 자체 Vite 설정 없음
4. **Testing 도구** — 프레임워크 레벨 test helpers (`httpClient()`, `loginAs()`) 없음
5. **Debug toolbar** — 개발 inspector/debug toolbar 없음
6. **프로덕션 트랙 레코드** — 알려진 프로덕션 배포 0건

### 종합 점수 (1~10)

| 항목 | 점수 | 비고 |
|------|:----:|------|
| 기능 완성도 (vs AdonisJS) | **8.5/10** | 모든 batteries 포함 + GraphQL, gRPC, Resilience, WS에서 능가 |
| 코드 품질 / 아키텍처 | **9/10** | 깔끔한 모듈형 아키텍처, CI/CD, 벤치마크 |
| 문서화 | **7/10** | 양호하지만 3개월 vs AdonisJS 11년 |
| 성능 | **9/10** | Hono 기반, AdonisJS보다 크게 우수할 것으로 예상 |
| 안정성 / 성숙도 | **4/10** | 3개월, 단일 메인테이너, 프로덕션 사례 없음 |
| 커뮤니티 / 생태계 | **2/10** | 없음 vs 23K stars, 363 기여자, 45 스폰서 |
| **종합** | **6.5/10** | 기술적으로 인상적이지만 AdonisJS가 프로덕션에서 안전한 선택 |

---

> **핵심 요약**: NexusTS는 AdonisJS의 batteries-included 기능과 일치하며, 일부 현대적 기능(GraphQL, gRPC, resilience, Bun/Workers, 표준 데코레이터)에서는 **능가**합니다. 하지만 AdonisJS의 **11년 선두** — 프로덕션 검증, 커뮤니티, 생태계 깊이, 전문화된 모듈(Bouncer, Ally, Vite, debug toolbar) — 는 NexusTS가 아직 따라잡지 못했습니다. 특히 **Node.js 환경에서는 AdonisJS가 여전히 안전한 선택**입니다.

---

## 참고 자료

- [Migration from AdonisJS to NexusTS](./adonisjs-comparison.md)
- [NexusTS User Guide](../user-guide/README.md)
- [NexusTS Benchmarks](../benchmarks.ko.md)
- [NexusTS Changelog](../../CHANGELOG.md)
- [AdonisJS Official Site](https://adonisjs.com)
- [AdonisJS GitHub](https://github.com/adonisjs/core)
