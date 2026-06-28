# 아키텍처 개요

> 최종 업데이트: v0.1 (MVC 코어)
> English version: [`architecture.md`](./architecture.md)

## 1. 목표

NexusTS는 다음 네 가지 원칙을 중심으로 설계된 **Bun 네이티브 풀스택 프레임워크**입니다.

1. **멀티 런타임** — 동일한 코드가 Bun, Node.js, Cloudflare Workers에서 동작합니다.
2. **멀티 패러다임** — Nest 스타일 클래스 데코레이터, Adonis 스타일 라우트 테이블, Hono 스타일 함수형 핸들러를 한 앱에서 혼용할 수 있습니다.
3. **멀티 렌더러** — Rendu, Edge, Inertia 어댑터가 일급 시민이며, React, Vue, Svelte, Solid용 SSR 어댑터를 요청 파이프라인을 분기하지 않고도 연결할 수 있습니다.
4. **엣지 우선** — 모든 어댑터는 Workers 요청 예산 안에서 동작하도록 설계되었습니다. 핫 패스에 블로킹 I/O가 없습니다.

프레임워크는 의도적으로 **작은 범위**(v0.1 MVP는 코어 MVC + DI + 검증 + 뷰 기반)에 머무르며, 잘 분리된 모듈로 확장됩니다.

---

## 2. 레이어 다이어그램

```
┌──────────────────────────────────────────────────────────────┐
│                       Application                            │
│   (루트 모듈, 컨테이너, 서버, Inertia, 뷰 어댑터)            │
├──────────────────────────────────────────────────────────────┤
│                       사용자 코드                             │
│   Modules · Controllers · Services · Repositories · DTOs     │
├──────────────────────────────────────────────────────────────┤
│                      Core (프레임워크)                        │
│  ┌────────┐ ┌────────┐ ┌────────────┐ ┌───────────────────┐  │
│  │  DI    │ │  HTTP  │ │ Validation │ │     View          │  │
│  │container│ │server │ │ (Zod)      │ │ Rendu / Edge /    │  │
│  │scanner │ │router │ │            │ │ Inertia / SSR     │  │
│  └────────┘ └────────┘ └────────────┘ └───────────────────┘  │
│  ┌────────┐ ┌────────┐ ┌────────────────────────────────────┐ │
│  │  ORM   │ │Runtime │ │           Decorators               │ │
│  │Drizzle │ │Bun/Node│ │ @Controller @Injectable @Module    │ │
│  │        │ │Cloudfl.│ │ @Get/@Post @Body/@Query @Validate  │ │
│  └────────┘ └────────┘ └────────────────────────────────────┘ │
├──────────────────────────────────────────────────────────────┤
│                   플랫폼 어댑터                              │
│              Hono (HTTP 코어) · Drizzle · Zod                │
└──────────────────────────────────────────────────────────────┘
```

사용자가 사용하는 모든 표면은 플랫폼 어댑터 **위**에 구현되어 있으므로, 애플리케이션 코드를 변경하지 않고도 어댑터를 교체할 수 있습니다 (예: Drizzle와 Kysely 간 교체).

---

## 3. 모듈 트리

NexusTS 앱은 `@Module` 노드의 트리입니다. 루트 모듈은 `new Application(...)`에 전달되며, 스캐너가 import 그래프를 순회하면서 모듈당 하나의 `ApplicationContainer`를 생성합니다.

```
RootModule
 ├── UserModule
 │    ├── UserController
 │    ├── UserService       (provider)
 │    ├── UserRepository    (provider)
 │    └── { provide: 'DB', useValue: drizzleInstance }
 ├── OrderModule
 │    ├── OrderController
 │    ├── OrderService
 │    └── StripeService     (provider)
 └── { provide: Inertia.TOKEN, useValue: appInertia }   ← Application이 등록
```

각 모듈의 컨테이너는 **격리**되어 있습니다 — 프로바이더는 `exports: [...]`로 다시 export하지 않는 한 선언된 모듈 내부에서만 해석됩니다.

> **왜 모듈당 컨테이너인가?** 모듈은 Nest/Adonis에서 캡슐화의 단위입니다. 모듈을 별도의 서브 컨테이너로 취급하면 프라이빗 프로바이더의 주입을 거부할 수 있고, 의존성 그래프를 감사하기 쉬워집니다.

전체 설계는 [`di-container.md`](./di-container.md)를 참조하세요.

---

## 4. 요청 라이프사이클

하나의 HTTP 요청은 다음과 같은 흐름을 따릅니다.

```
Hono fetch event
      │
      ▼
┌────────────────────────────────────────────────────────────┐
│ 1. 런타임 어댑터 (Bun / Node / Cloudflare)                  │
│    요청을 Hono Context로 정규화                              │
└────────────────────────────────────────────────────────────┘
      │
      ▼
┌────────────────────────────────────────────────────────────┐
│ 2. 전역 미들웨어                                            │
│    logger → errorHandler → formMiddleware → ...            │
└────────────────────────────────────────────────────────────┘
      │
      ▼
┌────────────────────────────────────────────────────────────┐
│ 3. 라우터                                                   │
│    - Adonis 스타일 테이블 조회                               │
│    - 데코레이터 기반 컨트롤러 디스패치                       │
│    - 함수형(raw Hono handler) 패스스루                      │
└────────────────────────────────────────────────────────────┘
      │
      ▼
┌────────────────────────────────────────────────────────────┐
│ 4. 파라미터 추출                                             │
│    @Body / @Query / @Param / @Headers / @Req / @Res /...  │
└────────────────────────────────────────────────────────────┘
      │
      ▼
┌────────────────────────────────────────────────────────────┐
│ 5. 검증                                                     │
│    @Validate({ body, query, params })  ← Zod schemas       │
└────────────────────────────────────────────────────────────┘
      │
      ▼
┌────────────────────────────────────────────────────────────┐
│ 6. 컨트롤러 메서드 호출                                     │
│    소유 모듈의 컨테이너에서 의존성 주입                       │
└────────────────────────────────────────────────────────────┘
      │
      ▼
┌────────────────────────────────────────────────────────────┐
│ 7. 응답 직렬화                                              │
│    - 일반 JSON                                              │
│    - 뷰 (Rendu / Edge)                                       │
│    - InertiaResponse → HTML shell (최초 로드) 또는 JSON     │
│      (XHR)                                                  │
└────────────────────────────────────────────────────────────┘
      │
      ▼
   Hono Response
```

각 단계는 별도 모듈로 구현되어 있으므로, 나머지를 포크하지 않고도任何一个 부분을 교체할 수 있습니다(예: 로거를 pino로, 검증기를 class-validator로).

---

## 5. 라우팅: 세 가지 스타일, 하나의 라우터

`src/core/http/router.ts`의 라우터는 단일 내부 라우트 테이블을 기반으로 세 가지 등록 API를 제공합니다.

| 스타일 | API | 사용 사례 |
| ----- | --- | -------- |
| **Nest** | `@Controller('/users')` + `@Get('/')` | 클래스 기반 서비스, 대규모 팀 |
| **Adonis** | `router.add('GET', '/users', Ctrl, 'list')` | 빠른 CRUD, 라우트 테이블 가독성 |
| **Functional** | `router.raw('GET', '/health', handler)` | 엣지 핸들러, 웹훅, 이스케이프 해치 |

라우터는 라우트를 `{ method, path, handlers, kind, meta }` 레코드로 저장하고 `start()` 시 Hono 앱으로 컴파일합니다. 첫 번째 매칭이 이기며, 동점은 구체성(파라미터보다 리터럴 세그먼트, 와일드카드보다 파라미터)으로 결정됩니다.

---

## 6. Inertia 어댑터

Inertia 어댑터는 별도의 프레임워크가 아니라 **특별한 응답 타입**입니다. 컨트롤러가 `inertia.render('Users/Index', { users })`를 반환하면 판별자 태그를 가진 `InertiaResponse` 객체가 만들어지고, 라우터가 태그를 검사하여:

- 최초 페이지 로드 (`X-Inertia` 헤더 없음) → `data-page` JSON이 임베드된 HTML 셸을 내보내고, 클라이언트가 거기서 하이드레이트합니다.
- XHR 방문 (`X-Inertia: true`) → JSON 페이지 객체만 내보냅니다.
- 에셋 버전 불일치 → `X-Inertia-Location`을 가진 409.

어댑터는 Inertia v3의 lazy-resolution 프로토콜(`defer`, `always`, `optional`, `merge`, `deepMerge`, `once`, `lazy`), 에셋 버전 관리, 공유 props, 서버 사이드 렌더링, Post/Redirect/Get 흐름을 담당하는 `<Form>` 서버 사이드 헬퍼도 구현합니다.

전체 설계는 [`inertia-adapter.md`](./inertia-adapter.md)를 참조하세요.

---

## 7. 런타임 어댑터

런타임 어댑터 레이어는 매우 다른 세 가지 실행 모델을 단일 `NexusServer.start()` API 뒤에 정규화합니다.

| 런타임 | 어댑터 파일 | 담당 |
| ------- | ------------ | ------------ |
| **Bun** | `src/core/runtime/bun.ts` | `Bun.serve` 라이프사이클, 포트 바인딩 |
| **Node** | `src/core/runtime/node.ts` | `node:http` 서버, `process` 시그널 |
| **Cloudflare Workers** | `src/core/runtime/cloudflare.ts` | `fetch` 핸들러 export |

애플리케이션은 `globalThis` 심볼을 통해 런타임을 자동 감지하고 `start()` 시 적절한 어댑터를 선택합니다. Workers의 경우 `app.fetch`가 export이고, Bun/Node의 경우 `app.listen(port)`입니다.

---

## 8. 확장 표면

프레임워크는 의도적으로 **서브 경로 import**를 노출하여 고급 사용자가 포크 없이 내부를 교체할 수 있게 합니다.

| 서브 경로 | 용도 |
| -------- | ------- |
| `@nexusts/view` | 뷰 엔진 (기본 `RenduAdapter`) |
| `@nexusts/view/inertia` | Inertia 어댑터 + 헬퍼 |
| `@nexusts/view/inertia/ssr` | React/Vue/Svelte/Solid SSR 어댑터 |
| `@nexusts/orm` | ORM 어댑터 (현재 Drizzle) |
| `@nexusts/runtime` | 런타임 어댑터 |

공개 진입점(`@nexusts/core`)은 안정적이고 합의된 표면만 다시 export합니다. 그 외는 모두 **고급**이며 메이저 버전 bump 없이 변경될 수 있습니다.

---

## 9. v0.1에 의도적으로 **포함되지 않은** 것

MVP를 집중적이고 출시 가능하게 유지하기 위해 다음은 이후 버전으로 연기됩니다.

- **인증** (세션, JWT, OAuth, 패스키) — v0.2
- **큐** (BullMQ, Cloudflare Queues) — v0.2
- **이벤트 시스템 / 스케줄러** — v0.2
- **Cloudflare D1 / KV / R2 / Durable Objects 어댑터** — v0.3
- **AI 에이전트 모듈 / MCP 서버** — v0.3
- **엣지 스트리밍 뷰 엔진** — v0.4

이는 기존 API를 깨지 않는 잘 분리된 모듈로 추가될 예정입니다.

---

## 11. 표준 데코레이터 아키텍처 (v0.9+)

NexusTS v0.9는 레거시 TypeScript 데코레이터(`experimentalDecorators: true`)에서 **TC39 표준 ES 데코레이터**로 마이그레이션했습니다.

### 듀얼모드 접근법

모든 데코레이터 팩토리는 두 가지 호출 규약을 지원합니다:

```ts
// 표준 모드 (TC39): (target, context) 받음
@Module({...})  →  Module(options)(target, { kind: "class", metadata })

// 레거시 모드: (target) 받음
@Module({...})  →  Module(options)(target)
```

데코레이터는 `context?.kind`를 확인하여 모드를 감지합니다:

```ts
export function Module(options: ModuleOptions = {}): any {
  return function (this: any, target: any, context?: any): void {
    if (context?.kind === "class" && context?.metadata) {
      // 표준 모드 — context.metadata에 저장
      context.metadata[METADATA_KEY.MODULE] = options;
      initNexusMeta(target, context.metadata);
      return;
    }
    // 레거시 모드 — safeDefineMeta 사용
    safeDefineMeta(METADATA_KEY.MODULE, options, target);
  };
}
```

### 메타데이터 저장소

| 저장소 | 사용 시기 | 필요 조건 |
|---------|-----------|----------|
| `Class.__nexus_meta__` | 표준 데코레이터 모드 | 추가 필요 없음 |
| `Reflect.defineMetadata` | 레거시 모드 + reflect-metadata 로드됨 | `import "reflect-metadata"` |
| 내부 Map (`fallbackStore`) | 레거시 모드 + reflect-metadata 미로드 | framework 내장 |

### 필드 인젝션

DI 컨테이너는 두 가지 인젝션 패턴을 지원합니다:

```ts
// 표준 모드 (v0.9+): 필드 인젝션
@Injectable()
class UserService {
  @Inject('DB') declare db: DrizzleLike;
}

// 레거시 모드: 생성자 인젝션
@Injectable()
class UserService {
  constructor(@Inject('DB') private db: DrizzleLike) {}
}
```

컨테이너가 필드 인젝션을 감지하면(`getFieldInjections()`가 비어있지 않음), `new Class()`(인자 없음)로 인스턴스를 생성한 후 필드를 할당합니다. 그렇지 않으면 `design:paramtypes` 또는 `@Inject` 파라미터 메타데이터를 통한 생성자 해석으로 폴백합니다.

### InputValue 체인

`inputValue()` 헬퍼는 요청 데이터 접근을 위한 파라미터 데코레이터를 대체합니다:

```ts
import { inputValue } from '@nexusts/core';

const id   = inputValue(ctx.req.param('id')).number().required().value();
const name = inputValue(ctx.req.query('name')).trim().max(100).value();
```

### 라우터 자동 감지

라우터는 마운트 시점에 표준 데코레이터 모드를 감지합니다:

```ts
const isStandardMode = paramMeta.length === 0;
if (isStandardMode) {
  attachInputHelper(c);
  result = await finalHandler.call(instance, c);
}
```

컨트롤러 메서드에 `@Param`/`@Body` 등의 파라미터 데코레이터가 없으면, 라우터는 Hono Context를 직접 전달하고 `CtxInput` 헬퍼를 연결합니다.

### 마이그레이션 경로

전체 마이그레이션 가이드는 [`standard-decorators-migration.ko.md`](./standard-decorators-migration.ko.md)를 참조하세요.
