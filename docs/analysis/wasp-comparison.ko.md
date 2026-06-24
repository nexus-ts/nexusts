# NexusTS vs Wasp — 비교 분석

> English version: [`wasp-comparison.md`](./wasp-comparison.md)
> 분석 일자: 2026-06-24 · 기준: NexusTS **v0.8.4**, Wasp **Launch Week #12 / TS Spec**

이 문서는 [NexusTS](https://github.com/nexus-ts/nexusts) v0.8.4과
[Wasp](https://wasp.sh)를 비교합니다. 두 프레임워크 모두 "TypeScript 풀스택
프레임워크"라 칭하지만, 동일한 교훈(개발자는 웹앱을 만들기 위해 새 언어를
배우고 싶어하지 않는다)에서 출발했음에도 **근본적으로 다른 설계 철학**을
갖고 있습니다.

Wasp는 2026년 6월 "Launch Week #12: MeTSamorphosis" 발표를 통해 5년 된 자체
DSL(`.wasp` 파일)에서 **TypeScript 네이티브 spec** (`.wasp.ts`)으로 전환했습니다.
겉보기에는 두 프레임워크가 비슷해 보이지만, **"프레임워크는 어디서 끝나고
당신의 코드는 어디서 시작되는가?"** 라는 질문에 대해 정반대로 답합니다.

---

## 1. 요약 비교표

| 카테고리 | Wasp (TS Spec) | NexusTS v0.7.0 |
| --- | --- | --- |
| **패러다임** | 컴파일러 기반 — `main.wasp.ts`가 **컴파일됨** | 라이브러리 기반 — `import { … } from '@nexusts/*'` |
| **spec 위치** | 루트 레벨의 `.wasp.ts` 파일 (한 개 이상) | 프로젝트 어디든 — 모든 파일이 "사용자 코드" |
| **프레임워크가 소유하는 것** | 앱 형태: routes, pages, queries, actions, jobs, auth UI | 빌딩 블록: DI, routing, validation, ORM, modules |
| **당신이 소유하는 것** | spec에서 참조하는 모든 React/Node 코드 | 모든 것 — controllers, services, schema, views |
| **스택 종속성** | React + Express + Prisma + (Vite for client)에 고정 | view engine 선택, ORM은 옵션, transport는 Hono |
| **ORM** | Prisma only (`schema.prisma`) | `@nexusts/drizzle` (기본) + 다른 어떤 ORM이든 |
| **프론트엔드** | React + TanStack Query (built-in) | 무엇이든 — Inertia.js + React/Vue, plain HTML, REST/SSE/WS, GraphQL |
| **백엔드** | Express (단일 서버) | Hono (단일 서버) + SSE + WS + gRPC + GraphQL |
| **Auth** | Built-in 풀스택 (email, Google, GitHub 등) via `auth:` 블록 | `@nexusts/auth` (better-auth) — UI는 직접 |
| **Jobs** | Built-in async jobs (PgBoss scheduler) | `@nexusts/queue` (BullMQ / Cloudflare / memory) |
| **Email** | Built-in (`app.emailSender`) | `@nexusts/mail` (SMTP / File / Null) |
| **배포** | CLI-driven (`wasp deploy fly`, `wasp deploy aws`) | 직접 Docker / Node / Bun |
| **TypeScript-first** | ✅ Yes (2026년 6월 이후) | ✅ Yes (처음부터) |
| **Custom 언어** | ❌ v0.24에서 제거됨 (TS Spec) | ❌ 처음부터 없음 |
| **학습 곡선** | "Typical SaaS"에는 낮음 / 비표준에는 높음 | 중간 — DI, modules, decorators 이해 필요 |
| **유연성** | 낮음 — "JS용 Rails" 형태에 맞춤 | 높음 — 어떤 HTTP 형태든, 어떤 데이터 모델이든 |
| **IDE / tooling** | ✅ 모든 게 즉시 동작 (TS Spec → 표준 TS) | ✅ 모든 게 즉시 동작 (decorator metadata via tsconfig) |

---

## 2. 근본적인 설계 차이

### Wasp의 접근: high-level spec, 프레임워크가 앱을 컴파일

Wasp는 **컴파일러**입니다. `main.wasp.ts`를 작성합니다:

```ts
// main.wasp.ts (Wasp TS Spec)
import { app, page, query, route } from "@wasp.sh/spec";

import { MainPage } from "./src/MainPage";
import { getTasks } from "./src/queries";

export default app({
  name: "todoApp",
  title: "ToDo App",
  auth: {
    userEntity: "User",
    methods: { email: {}, google: {} },
  },
  spec: [
    route("RootRoute", "/", page(MainPage)),
    query(getTasks, { entities: ["Task"] }),
  ],
});
```

그다음 `wasp build`를 실행하면 Wasp가 `.wasp/build/`에 **완전한 React +
Express + Prisma 앱을 생성**합니다. 생성된 코드를 읽고 수정할 수도
있습니다 (실제로 `.wasp/build/...`로 들어가서 직접 실행도 가능).

**트레이드오프**: **프레임워크가 애플리케이션 골격을 소유**합니다. 당신은
코드 islands (pages, queries, jobs)를 기여하고 프레임워크가 그것들을
이어붙입니다. Rails / Laravel for JS 느낌입니다.

### NexusTS의 접근: 빌딩 블록, 당신이 앱을 구성

NexusTS는 **라이브러리**(사실 30개 라이브러리)입니다. 모든 파일을 직접 작성:

```ts
// app/main.ts
import "reflect-metadata";
import { Application, Module, Controller, Get, Inject } from "@nexusts/core";
import { DrizzleModule } from "@nexusts/drizzle";

@Controller("/")
class HomeController {
  @Get("/")
  index(@Inject("DB") db: any) {
    return db.select().from(tasks).all();
  }
}

@Module({
  imports: [DrizzleModule.forRoot({ dialect: "bun-sqlite", connection: { filename: "app.db" } })],
  controllers: [HomeController],
})
class AppModule {}

const app = new Application(AppModule);
await app.listen(3000);
```

**디렉토리 레이아웃, 라우팅 형태, service 레이어, views, 데이터베이스
schema** — 모든 것을 통제합니다. NexusTS는 DI, controllers, decorators,
modules를 제공할 뿐입니다. 나머지는 당신의 것.

**트레이드오프**: 더 많은 boilerplate, 더 많은 결정, 더 많은 유연성.

### 한 문장 요약

- **Wasp**: "앱이 무엇인지 말해줘. 내가 생성할게."
- **NexusTS**: "타입과 decorator를 줘. 내가 이어줄게."

---

## 3. Wasp가 다르게 선택한 것 — 그리고 왜 중요한가

### 3.1 컴파일러 vs 런타임

Wasp는 당신의 spec을 처리하는 **Haskell 컴파일러**를 가지고 있습니다.
NexusTS는 부팅 시 module graph를 해결하는 런타임을 가지고 있습니다.

| 측면 | Wasp | NexusTS |
| --- | --- | --- |
| 빌드 단계 | `wasp build` (Haskell → 생성된 앱) | 없음 — `bun app/main.ts` 그대로 실행 |
| 부팅 시간 | 느림 (compile + Node boot) | 빠름 (Bun start) |
| 디버깅 | `.wasp/build/`의 생성된 코드를 읽음 | 자신의 코드를 읽음 |
| Hot reload | Wasp-managed | Bun의 `--hot` |
| 결과물 | 독립 실행형 웹앱 (Docker image) | 직접 ship |

**함의**: Wasp의 compile-time view는 global optimization이 가능합니다
(예: 어떤 query가 어떤 entity를 만지는지 분석해 cache invalidation에 활용).
NexusTS의 runtime view는 변경이 즉각적이지만, 앱 전체를 한 번에 추론하지
못합니다.

### 3.2 스택 lock-in vs 유연성

| 선택 | Wasp | NexusTS |
| --- | --- | --- |
| Frontend framework | React + TanStack Query (필수) | 무엇이든 — Inertia.js, plain HTML, Vue, custom SPA |
| 서버 transport | Express (필수) | Hono (기본), 단 raw Hono route 등록 가능 |
| ORM | Prisma (필수) | Drizzle (기본), 단 어떤 ORM이든 가능 |
| Build tool | Vite (Wasp가 관리) | 무엇이든 (Vite, esbuild, Bun.build) |
| Schema 언어 | `schema.prisma` | Drizzle의 TypeScript 테이블 (또는 원하는 어떤 DSL이든) |

**함의**: 스택이 "React + Express + Prisma"라면 Wasp는 당신의 workflow의
strict superset입니다. Vue, Svelte, 다른 ORM, 커스텀 frontend bundle이
필요하다면 NexusTS만이 유일한 길입니다.

### 3.3 Built-in 기능 vs opt-in modules

| 기능 | Wasp | NexusTS |
| --- | --- | --- |
| Auth UI | ✅ sign-up/login 페이지 자동 생성 | ❌ 직접 UI를 만듦 |
| Email 인증 | ✅ built-in hook | ❌ 직접 구현 + `@nexusts/mail` |
| Cache invalidation | ✅ 자동, `entities: ["Task"]` 어노테이션으로 | ❌ `cache.invalidateByTag(...)` 직접 호출 |
| Query client | ✅ TanStack Query, 자동 wired | ❌ React Query / SWR 직접 설정 |
| Routing | ✅ `route("X", "/path", page(Y))` | ❌ `@Controller("/path")` + `@Get("/")` |
| Real-time 업데이트 | ⚠️ subscriptions via, 아직 실험적 | ✅ `@nexusts/ws` / `@nexusts/sse` first-class |
| File uploads | ⚠️ 직접 (FormData) | ✅ `@nexusts/upload` decorators |
| Background jobs | ✅ `app.job(...)` + PgBoss | ✅ `@nexusts/queue` (BullMQ) |

**함의**: Wasp가 "2주 안에 SaaS 만들기"에 더 빠릅니다. NexusTS가 "비표준
요구사항이 있는 커스텀 웹앱"에 더 빠릅니다.

### 3.4 spec 파일이 source of truth

Wasp는 모든 앱을 설명하는 단일 `main.wasp.ts` 파일을 고집합니다. 이는
다음에 좋습니다:

- **AI agents** — Wasp는 자기 자신을 명시적으로 "AI-native"로 마케팅;
  spec이 LLM에게 앱의 구조화된 지도를 제공.
- **Onboarding** — 새 개발자가 한 파일을 읽고 전체 그림을 봄.
- **Tooling** — `wasp studio`가 spec을 시각화.

NexusTS에는 그런 파일이 없습니다. 모든 module, controller, service는
일반 TypeScript 파일입니다. 발견은 코드베이스를 읽으며 일어납니다.

---

## 4. NexusTS가 앞서는 영역

### 4.1 Real-time & streaming

- **WebSockets** — `@nexusts/ws`는 channel subscriptions, middleware,
  Bun + Node 지원을 갖춘 first-class module.
- **SSE** — `@nexusts/sse`는 backpressure 제어를 갖춘 stream helpers 제공.
- **gRPC** — reflection 및 unary methods를 갖춘 `@nexusts/grpc`.
- **GraphQL** — SDL-first 설계를 갖춘 `@nexusts/graphql`.

Wasp는 실험적인 WS / SSE 지원이 있지만 **first-class가 아님**. 실시간
채팅 앱은 NexusTS에서 더 쉽습니다.

### 4.2 Granular modules

NexusTS는 30개의 독립 패키지를 출시합니다. 필요한 것만 비용 지불:

```ts
// Lego 블록처럼 모듈 선택
import { DrizzleModule } from "@nexusts/drizzle";
import { AuthModule } from "@nexusts/auth";
import { SessionModule } from "@nexusts/session";
import { GraphQLModule } from "@nexusts/graphql";
import { QueueModule } from "@nexusts/queue";
```

Wasp의 기능들은 baked-in — Wasp의 Prisma 없이 Wasp의 auth를 사용할 수 없고,
Wasp의 React client 없이 Wasp의 Express 서버를 사용할 수 없습니다.

### 4.3 Multi-runtime

NexusTS는 처음부터 **Bun, Node, Cloudflare Workers**를 지원합니다. Drizzle
모듈은 각각에 대해 별도 driver를 가짐:

```ts
DrizzleModule.forRoot({
  dialect: "bun-sqlite",            // Bun
  // dialect: "postgres",          // Node
  // dialect: "d1",                // Cloudflare Workers
  connection: { filename: "app.db" },
});
```

Wasp는 Node.js를 타겟합니다. Cloudflare Workers는 실험적 (자체 compiler가
Workers 호환 출력을 emit해야 하는데, spec → React → Vite 체인 때문에 쉽지 않음).

### 4.4 No compile step

NexusTS 앱은 `bun run app/main.ts`로 **<100ms** 만에 부팅됩니다. Wasp 앱은
먼저 `wasp build`가 필요합니다 (프로젝트 크기에 따라 수 초 ~ 수십 초).
iteration 속도에서 NexusTS가 이깁니다.

### 4.5 Decorator + DI ecosystem

NexusTS의 decorator-first 설계는 retry, circuit breaker, bulkhead,
schedule 등에 동력을 공급하는 **method-level metadata** 작성을 허용:

```ts
class StripeClient {
  @Retry({ attempts: 3, backoff: "exponential-jitter" })
  @CircuitBreaker({ name: "stripe", threshold: 5 })
  async charge(amount: number) { /* ... */ }
}
```

Wasp에는 동등한 것이 없습니다 — try/catch와 retry loop를 직접 작성합니다.

### 4.6 Production-grade tooling

- **OpenAPI 3.1** — Zod schemas로부터 자동 생성
- **Prometheus metrics** — 즉시 사용 가능
- **Distributed tracing** — OpenTelemetry를 통해
- **Health checks** — (memory, disk, http, db indicators)

Wasp에는 이들에 대한 first-party 동등물이 없습니다. Express middleware로
직접 추가합니다.

---

## 5. Wasp가 앞서는 영역

### 5.1 Time-to-first-deploy

Wasp의 `wasp deploy fly` (또는 `wasp deploy aws`)는 spec을 받아 올바른
secrets/DB/cache wiring으로 **production-ready Docker image**를 생성합니다.
Wasp 팀이 deploy recipes를 유지보수합니다.

NexusTS에는 의견이 있는 deploy 이야기가 없습니다. `Dockerfile`을 작성하고,
Postgres를 설정하고, Nginx를 구성합니다. 이는 **더 많은 작업**이지만
**더 유연**합니다 (어디든 배포 가능).

### 5.2 Full-stack auth UI

Wasp는 login / signup / password-reset 페이지와 흐름을 생성합니다.
`auth: { methods: { email: {}, google: {} } }`라고만 말하면 됩니다.

NexusTS는 auth *서버*(better-auth를 통해)를 제공하지만 React form은 직접
만듭니다. 트레이드오프: Wasp는 속도, NexusTS는 customization.

### 5.3 Open-source SaaS boilerplate

Wasp는 [OpenSaaS](https://opensaas.sh/) 템플릿을 출시합니다 — auth, billing,
admin 등을 갖춘 완전한 SaaS 스타터. NexusTS에는 동등한 것이 없습니다
(다만 `../blog-app/`의 blog-app이 가장 가까운 영적 후계자임).

### 5.4 성숙도 & 생태계

- Wasp: 5년 차, $5M+ 펀딩, 풀타임 팀, 유료 지원 플랜.
- NexusTS: 4개월 차 (v0.7.x), 단일 maintainer, 커뮤니티 주도.

엔터프라이즈 지원 계약이 필요한 스타트업이거나 battle-tested framework가
필요하다면, Wasp가 오늘 더 안전한 선택입니다.

### 5.5 Auto cache invalidation

Wasp의 `query(getTasks, { entities: ["Task"] })`는 `Task` mutation이
실행될 때 React Query cache를 자동으로 무효화합니다. Wasp의 compile-time
이해를 통해 "공짜로" 얻습니다.

NexusTS는 명시적인 `cache.invalidateByTag(...)` 호출이 필요합니다. 더 많은
제어, 더 많은 코드.

---

## 6. 언제 무엇을 선택하는가

### **Wasp**를 선택

- ✅ "Typical" SaaS (CRUD + auth + email + payments)를 만드는 경우.
- ✅ React + Express + Prisma를 원하고 다른 게 필요 없는 경우.
- ✅ one-command deploy (Fly.io, Railway, AWS)를 원하는 경우.
- ✅ 빠르게 ship하고 싶은 solo founder 또는 소규모 팀.
- ✅ 기본 제공되는 AI agent 지원을 원하는 경우.

### **NexusTS**를 선택

- ✅ Bun + Hono + Drizzle (현대적 스택)을 원하는 경우.
- ✅ WebSockets, SSE, gRPC, 또는 GraphQL이 필요한 경우.
- ✅ 프레임워크와 싸우지 않고 pieces (ORM, view engine, transport)를
  swap하고 싶은 경우.
- ✅ 비표준 무언가 (IoT dashboard, real-time collaboration, custom
  protocol)를 만드는 경우.
- ✅ Module-level composition — 한 곳에서 auth, 다른 곳에서 queue, 세 번째
  곳에서 GraphQL을 가져오기.
- ✅ 프레임워크가 앱을 **생성**하는 것이 아니라 **구조화하는 데 도움을
  주기**를 원하는 경우.

### 둘 다?

이론적으로는 — 런타임 레벨에서 상호 배타적입니다. 그러나 frontend
(Wasp의 자동 생성된 React client)를 사용하고 NexusTS 백엔드에 RPC로 연결할
수는 있습니다. 이는 이색적이지만 가능합니다.

---

## 7. 공유된 교훈

두 프레임워크 모두 같은 통찰로 수렴했습니다:

> **개발자는 웹앱을 만들기 위해 새 언어를 배우고 싶어하지 않는다.**

Wasp는 5년과 $5M을 들여 어렵게 이것을 배웠습니다 (2026년 6월에 DSL
제거). NexusTS는 처음부터 이것을 가지고 시작했습니다 (좋은 결정).

또 다른 공유된 통찰:

> **AI agents는 구조화된 spec의 혜택을 본다.**

Wasp는 이것을 직접 마케팅합니다. NexusTS는 암묵적으로 혜택을 봅니다 —
decorators + module exports가 LLM에게 앱의 dependencies, controllers,
services의 명확한 지도를 제공합니다.

---

## 8. 나란히 코드: "Hello World" with auth + DB

### Wasp (TS Spec)

```ts
// main.wasp.ts
import { app, page, query, route, auth } from "@wasp.sh/spec";

export default app({
  name: "helloApp",
  auth: {
    userEntity: "User",
    methods: { email: {} },
  },
  spec: [
    route("HomeRoute", "/", page("MainPage")),
    query("getMessage", {
      fn: "import { getMessage } from '@src/queries'",
      entities: [],
    }),
  ],
});
```

```prisma
// schema.prisma
model User { id Int @id @default(autoincrement()) email String @unique }
model Message { id Int @id @default(autoincrement()) text String }
```

```tsx
// src/MainPage.tsx
import { useQuery, getMessage } from "@wasp.sh/queries";

export const MainPage = () => {
  const { data: msg } = useQuery(getMessage);
  return <h1>{msg?.text ?? "Loading…"}</h1>;
};
```

```ts
// src/queries.ts
import type { GetMessage } from "@wasp.sh/queries/server";

export const getMessage: GetMessage<void, { text: string }> = async (_args, context) => {
  return { text: "Hello from Wasp!" };
};
```

### NexusTS

```ts
// app/main.ts
import "reflect-metadata";
import {
  Application, Module, Controller, Get, Inject,
} from "@nexusts/core";
import { DrizzleModule, DrizzleService } from "@nexusts/drizzle";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

const messages = sqliteTable("messages", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  text: text("text").notNull(),
});

@Controller("/")
class HomeController {
  @Inject(DrizzleService.TOKEN) db!: DrizzleService;
  @Get("/")
  async index() {
    return this.db.select().from(messages).all();
  }
}

@Module({
  imports: [DrizzleModule.forRoot({ dialect: "bun-sqlite", connection: { filename: "app.db" } })],
  controllers: [HomeController],
})
class AppModule {}

const app = new Application(AppModule);
await app.listen(3000);
```

**Wasp가 간결성에서 이깁니다.** **NexusTS가 투명성에서 이깁니다** — 모든
라인이 당신이 바꿀 수 있는 것입니다.

---

## 9. 의사결정 프레임워크

```
일반적인 CRUD SaaS를 만들고 있나요?
├── YES → Wasp 고려 (빠른 ship)
│   └── React 외 frontend나 WebSockets가 필요한가요?
│       └── YES → NexusTS
└── NO  → NexusTS
    └── Bun만 사용해도 되나요 (Node만 말고)?
        ├── YES → NexusTS 이상적
        └── NO  → NexusTS는 Node에서도 동작
```

---

## 10. 더 보기

- [`nestjs-comparison.md`](./nestjs-comparison.md) — NestJS 대비 (DI-first)
- [`adonisjs-comparison.md`](./adonisjs-comparison.md) — AdonisJS 대비 (Laravel-style)
- [`wasp-comparison.md`](./wasp-comparison.md) — 이 문서의 영어 버전
- [Wasp blog: New language for web dev was a mistake](https://wasp.sh/blog/2026/05/13/new-language-for-web-dev-was-a-mistake)
- [Wasp blog: Launch Week #12 — TS Spec](https://wasp.sh/blog/2026/06/05/wasp-launch-week-12-ts-spec)
- [Wasp docs: TS Spec](https://wasp.sh/docs/general/typescript)
