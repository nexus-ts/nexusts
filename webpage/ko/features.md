---
title: 기능
description: NexusTS 기능 개요
---

# 기능

NexusTS는 **32개 독립 모듈**을 제공합니다. 각 모듈은 별도의 `@nexusts/*` 패키지로, 필요한 것만 설치할 수 있습니다.

## 코어 프레임워크

| 기능 | 패키지 | 상태 |
|------|--------|------|
| MVC + 의존성 주입 | `@nexusts/core` | ✅ Core |
| 라우팅 (Nest/Adonis/functional) | `@nexusts/core` | ✅ Core |
| 요청 검증 (Zod) | `@nexusts/core` | ✅ Core |
| Exception 필터 / Interceptor / Guard | `@nexusts/core` | ✅ v0.7.3 |
| 라이프사이클 훅 (`OnModuleInit` 등) | `@nexusts/core` | ✅ v0.7.3 |
| 요청 범위 DI | `@nexusts/core` | ✅ v0.4 |

## 데이터베이스 & ORM

| 기능 | 패키지 | 상태 |
|------|--------|------|
| Drizzle ORM (PostgreSQL, MySQL, SQLite, bun-sqlite, D1) | `@nexusts/drizzle` | ✅ v0.3 |
| 자동 마이그레이션 (`nx db:generate`, `nx db:migrate`) | `@nexusts/drizzle` | ✅ v0.6.5 |
| 시딩 (`nx db:seed` + `Factory<T>`) | `@nexusts/drizzle` | ✅ v0.8.3 |

## API & 통신

| 기능 | 패키지 | 상태 |
|------|--------|------|
| GraphQL (SDL 우선 + 코드 퍼스트, `autoSchema: true`) | `@nexusts/graphql` | ✅ v0.7.7 |
| gRPC (unary + server/client/bidi 스트리밍) | `@nexusts/grpc` | ✅ v0.8.2 |
| WebSocket | `@nexusts/ws` | ✅ v0.5 |
| Server-Sent Events | `@nexusts/sse` | ✅ v0.4 |
| OpenAPI 3.1 + Scalar UI | `@nexusts/openapi` | ✅ v0.4 |

## Resilience & 신뢰성

| 기능 | 패키지 | 상태 |
|------|--------|------|
| Retry (4가지 백오프 전략) | `@nexusts/resilience` | ✅ v0.7.0 |
| Circuit Breaker (HTTP 관리 API 포함) | `@nexusts/resilience` | ✅ v0.8.0 |
| Bulkhead | `@nexusts/resilience` | ✅ v0.7.0 |
| 크로스-팟 저장소 (Redis / Drizzle / Memory) | `@nexusts/resilience` | ✅ v0.8.1 |
| Eager `applyResilience()` 자동 래핑 | `@nexusts/resilience` | ✅ v0.8.0 |
| 기능 플래그 (카나리 / A/B 테스트) | `@nexusts/feature-flag` | ✅ v0.8.0 |

## 프론트엔드

| 기능 | 패키지 | 상태 |
|------|--------|------|
| Inertia.js v3 (React / Vue SPA + SSR) | `@nexusts/view` | ✅ v0.8.4 |
| Rendu 템플릿 엔진 | `@nexusts/view` | ✅ v0.2 |
| Edge 템플릿 엔진 (Adonis 스타일) | `@nexusts/view` | ✅ v0.6 |
| Eta 템플릿 엔진 (EJS 스타일) | `@nexusts/view` | ✅ v0.6 |

## 관측 가능성

| 기능 | 패키지 | 상태 |
|------|--------|------|
| 구조화된 로깅 (Pino) | `@nexusts/logger` | ✅ v0.3 |
| Prometheus 메트릭 | `@nexusts/metrics` | ✅ v0.4 |
| OpenTelemetry 트레이싱 | `@nexusts/tracing` | ✅ v0.4 |

## 보안

| 기능 | 패키지 | 상태 |
|------|--------|------|
| better-auth 통합 | `@nexusts/auth` | ✅ v0.2 |
| CSRF / HSTS / CSP / X-Frame-Options | `@nexusts/shield` | ✅ v0.3 |
| CORS 가드 | `@nexusts/shield` | ✅ v0.8.0 |
| 속도 제한 (3가지 전략) | `@nexusts/limiter` | ✅ v0.3 |
| 세션 관리 | `@nexusts/session` | ✅ v0.2 |
| 암호화 (AES-256-GCM + HMAC + scrypt) | `@nexusts/crypto` | ✅ v0.5 |

## 인프라

| 기능 | 패키지 | 상태 |
|------|--------|------|
| 캐시 (Memory / Drizzle / Redis) | `@nexusts/cache` | ✅ v0.3 |
| 작업 큐 (BullMQ / Redis) | `@nexusts/queue` | ✅ v0.2 |
| 스케줄러 (Cron / Interval / Timeout) | `@nexusts/schedule` | ✅ v0.2 |
| 이벤트 시스템 | `@nexusts/events` | ✅ v0.2 |
| 정적 파일 서빙 | `@nexusts/static` | ✅ v0.3 |
| 파일 저장소 (Memory / Local / S3 / R2) | `@nexusts/drive` | ✅ v0.3 |
| 이메일 (Null / File / SMTP / MJML) | `@nexusts/mail` | ✅ v0.3 |
| 설정 관리 | `@nexusts/config` | ✅ v0.3 |
| i18n (Intl 기반, 복수화) | `@nexusts/i18n` | ✅ v0.5 |
| Redis 클라이언트 (Bun / Workers KV) | `@nexusts/redis` | ✅ v0.5 |
| 파일 업로드 헬퍼 | `@nexusts/upload` | ✅ v0.4 |
| 헬스 체크 | `@nexusts/health` | ✅ v0.3 |

## CLI

| 기능 | 상태 |
|------|------|
| `nx init` / `nx new` — 프로젝트 스캐폴딩 | ✅ |
| `nx make:controller`, `make:service`, `make:crud` — 생성기 | ✅ |
| `nx make:model`, `make:repository`, `make:module` | ✅ |
| `nx make:migration`, `make:auth`, `make:schedule` | ✅ |
| `nx db:generate` / `db:migrate` / `db:seed` | ✅ |
| `nx route:list` — 라우트 인스펙터 | ✅ |
| `nx repl` — 대화형 디버그 콘솔 | ✅ |
| `nx info` — 시스템 진단 | ✅ |
