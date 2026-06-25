---
layout: home

title: NexusTS
titleTemplate: Bun 네이티브 풀스택 프레임워크

hero:
  name: NexusTS
  text: Bun 네이티브 풀스택 프레임워크
  tagline: TC39 표준 데코레이터 · 32개 모듈 패키지 · 필요한 것만 설치 · 사용하지 않는 것은 제로 오버헤드
  image:
    src: /logo.svg
    alt: NexusTS
  actions:
    - theme: brand
      text: 시작하기
      link: /ko/getting-started
    - theme: alt
      text: GitHub에서 보기
      link: https://github.com/nexus-ts/nexusts

features:
  - icon: 🚀
    title: Bun 네이티브
    details: Bun.js 런타임에 특화. 네이티브 TypeScript, 빠른 시작, 핫 리로드. 컴파일러 대기 시간 없음.
  - icon: 📦
    title: 32개 모듈 패키지
    details: 각 기능은 독립적인 `@nexusts/*` 패키지. 필요한 것만 설치. 불필요한 코드 제로.
  - icon: 🎯
    title: 표준 데코레이터 (TC39)
    details: TC39 표준 ES 데코레이터 — `experimentalDecorators` 불필요, `reflect-metadata` 불필요. 필드 인젝션, `ctx.req.*` 메서드. 레거시 데코레이터와 듀얼모드 호환.
  - icon: 🔌
    title: 완전한 생태계
    details: GraphQL, gRPC (스트리밍 포함), WebSocket, SSE, Queue, Scheduler, Cache, Logger, Metrics, Tracing — 모두 자체 제공.
  - icon: 🛡️
    title: 내장 Resilience
    details: Retry, Circuit Breaker, Bulkhead. 크로스-팟 저장소 (Redis/Drizzle). HTTP 관리 API. 카나리 배포용 기능 플래그.
  - icon: ⚡
    title: 검증된 CI
    details: 314개 이상의 테스트 (Bun, Node.js 22, Cloudflare Workers, 3개 Drizzle 방언). 모든 커밋에서 smoke 테스트 통과.
---

## NexusTS란?

**NexusTS**는 Bun 네이티브 풀스택 TypeScript 프레임워크입니다. **32개 독립 패키지**를 `@nexusts/*` 네임스페이스로 제공합니다. 필요한 것만 설치하세요.

프로덕션 백엔드 서비스 구축에 필요한 모든 도구를 제공합니다:

- **MVC + DI** — NestJS 스타일 데코레이터 (`@Module`, `@Controller`, `@Injectable`, `@Get`, `@Post`)
- **데이터베이스** — Drizzle ORM (5개 방언: PostgreSQL, MySQL, SQLite, bun-sqlite, Cloudflare D1)
- **GraphQL** — SDL 우선 + 코드 퍼스트 (`autoSchema: true`)
- **gRPC** — 4가지 통신 방식: unary, server-stream, client-stream, bidi
- **Resilience** — Retry, Circuit Breaker, Bulkhead (크로스-팟 저장소)
- **Auth** — better-auth 통합
- **실시간 통신** — WebSocket, SSE, Queue, Scheduler
- **관측 가능성** — Logger (Pino), Metrics (Prometheus), Tracing (OpenTelemetry)
- **프론트엔드** — Inertia.js v3 어댑터 (React/Vue SPA + SSR)
- **CLI** — `nx` 명령어 (스캐폴딩, 생성기, REPL)

## 빠른 시작

```bash
npm create nexusts@latest my-app
cd my-app
bun install
bun run dev
```

```bash
# 또는 CLI 직접 사용:
bunx nx new my-app --view inertia --orm drizzle --db bun-sqlite --frontend react
```

## 아키텍처

```
@nexusts/core       → MVC + DI + 라우팅 + 검증 + 뷰
@nexusts/cli        → nx CLI (스캐폴드, 생성, 시드, REPL)
@nexusts/drizzle    → 기본 ORM (5개 방언)
@nexusts/graphql    → SDL 우선 + 코드 퍼스트 GraphQL
@nexusts/grpc       → gRPC 서버 + 타입드 클라이언트 (모든 스트리밍)
@nexusts/resilience → Retry + Circuit Breaker + Bulkhead
@nexusts/auth       → better-auth 통합
@nexusts/view       → Inertia.js v3 + Rendu + Edge + Eta
@nexusts/ws         → WebSocket
@nexusts/sse        → Server-Sent Events
@nexusts/cache      → Memory / Drizzle / Redis
@nexusts/queue      → 작업 큐 (BullMQ / Redis)
@nexusts/schedule   → Cron / Interval / Timeout
@nexusts/feature-flag → 카나리 / A/B 테스트
... 외 18개 →
```

## v0.9.0 — 최신 릴리스

**표준 데코레이터 마이그레이션.** TC39 표준 ES 데코레이터, `reflect-metadata` 제거. 필드 인젝션, `ctx.req.*` 메서드. **32개 패키지** 출시 완료. NestJS/AdonisJS와의 Tier 1 및 Tier 2 격차를 모두 해소했습니다.

자세한 내용은 [변경 로그](https://github.com/nexus-ts/nexusts/blob/main/CHANGELOG.md)를 참고하세요.
