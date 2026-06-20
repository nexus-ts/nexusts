# CLI · `nx` 명령어 러너

> English version: [`cli.md`](./cli.md)

Nexus는 Adonis ACE / Ruby on Rails 스타일의 CLI를 `nx` 명령어로 제공합니다. 컨트롤러, 서비스, 모듈, 모델, 마이그레이션, 미들웨어, 검증, 그리고 **풀스택 CRUD 슬라이스**를 `nx.config.ts` 기반으로 자동 생성합니다 — 모든 생성 코드는 프로젝트의 라우팅 스타일, 뷰 엔진, ORM, 데이터베이스 설정에 맞춰집니다.

---

## 1. 설치

CLI는 `nexus` 패키지에 포함되어 있어 추가 의존성이 필요 없습니다.

```bash
bun add nexus reflect-metadata zod hono
```

설치 후 `bunx nx ...`가 `nexus/package.json`의 `bin` 항목을 통해 자동 동작합니다.

---

## 2. 빠른 참조

| 명령어 | 설명 |
| ------- | ------------ |
| `nx new <name>` | 새 프로젝트 스캐폴드 |
| `nx init` | 현재 디렉터리에 `nx.config.ts` 생성 |
| `nx make:crud <Name>` | 풀스택 CRUD 슬라이스 (Rails 스타일 scaffold) |
| `nx make:controller <Name>` | 단일 컨트롤러 클래스 |
| `nx make:service <Name>` | 서비스 클래스 |
| `nx make:module <Name>` | `@Module()` 와이어링 |
| `nx make:model <Name>` | 테이블 스키마 (Drizzle / Prisma / Kysely) |
| `nx make:migration <Name>` | 마이그레이션 파일 |
| `nx make:middleware <Name>` | 미들웨어 클래스 |
| `nx make:validator <Name>` | Zod DTO |
| `nx route:list` | 등록된 라우트 목록 |
| `nx info` | 해석된 config + env 출력 |
| `nx help [command]` | 도움말 |

모든 명령어에는 **단축 별칭**이 있습니다.

| 명령어 | 별칭 |
| ------- | ------- |
| `nx make:controller` | `mc`, `make-controller` |
| `nx make:service` | `ms`, `make-service` |
| `nx make:module` | `mm`, `make-module` |
| `nx make:model` | `mmodel`, `make-model` |
| `nx make:migration` | `mkm`, `make-migration` |
| `nx make:middleware` | `mwm`, `make-middleware` |
| `nx make:validator` | `mv`, `make-validator` |
| `nx make:crud` | `crud`, `make-crud`, `scaffold` |
| `nx route:list` | `routes`, `route-list` |
| `nx info` | `i` |
| `nx new` | `n` |
| `nx init` | `i` |

---

## 3. `nx new <name>`

처음부터 새 프로젝트를 스캐폴드합니다.

```bash
nx new my-app
# 인터랙티브 — 라우팅/view/orm/db 선택

nx new my-app --style nest --view inertia --orm drizzle --db bun-sqlite --no-interaction
# 비대화형
```

생성되는 구조:

```
my-app/
├── nx.config.ts
├── package.json
├── tsconfig.json
├── README.md
└── src/app/
    ├── main.ts
    ├── app.module.ts
    └── controllers/
        └── home.controller.ts
```

그 다음:

```bash
cd my-app
bun install
bun run dev
```

---

## 4. `nx init`

기존 프로젝트에 `nx.config.ts`를 생성(또는 갱신)합니다.

```bash
nx init
# routing / view / orm / db / frontend를 물어봄

nx init --style nest --view inertia --orm drizzle --db bun-sqlite --no-interaction
# 프롬프트 건너뜀

nx init --merge
# 기존 필드 유지; 누락된 것만 채움
```

생성된 `nx.config.ts`:

```ts
/**
 * Nexus project configuration.
 * Run `nx info` to see the resolved values.
 */

export default {
  routing: 'nest',
  view: 'inertia',
  orm: 'drizzle',
  database: {
    driver: 'bun-sqlite',
    url: process.env.DATABASE_URL ?? 'app.db',
  },
  inertia: {
    frontend: 'react',
    ssr: true,
    version: '1.0.0',
  },
  paths: {
    app:         'src/app',
    controllers: 'src/app/controllers',
    services:    'src/app/services',
    modules:     'src/app/modules',
    models:      'src/app/models',
    migrations:  'src/app/database/migrations',
    middleware:  'src/app/middleware',
    dto:         'src/app/dto',
  },
};
```

---

## 5. `nx make:crud <Name>` (핵심 명령어)

단일 리소스에 대한 **완전한 기능 슬라이스**를 한 번에 생성합니다 — 컨트롤러, 서비스, 리포지토리, 모델, DTO, 모듈, 테스트. `rails generate scaffold`에 해당합니다.

```bash
nx make:crud Post
```

`Post` 모델에 대해 CLI가 생성하는 파일:

```
src/app/controllers/post.controller.ts
src/app/services/post.service.ts
src/app/models/post.model.ts
src/app/dto/post.dto.ts
src/app/modules/post.module.ts
tests/post.test.ts
```

생성되는 파일은 **`nx.config.ts`에 적응**합니다.

- **라우팅 스타일** → 컨트롤러 템플릿
  - `nest` → `@Controller` / `@Get` 데코레이터
  - `adonis` → 평범한 클래스 메서드
  - `functional` → Hono 네이티브 핸들러 객체
- **뷰 엔진** → `inertia`는 `inertia.render(...)` 호출 추가
- **ORM** → Drizzle / Prisma / Kysely 템플릿 선택

### 플래그

| 플래그 | 효과 |
| ---- | ------ |
| `--no-views` | `view === 'inertia'`여도 Inertia 렌더링 건너뜀 |
| `--no-repo` | 리포지토리/모델 건너뜀 (메모리 서비스) |
| `--no-test` | 테스트 파일 건너뜀 |
| `--style nest\|adonis\|functional` | 라우팅 스타일 오버라이드 |
| `--orm drizzle\|prisma\|kysely` | ORM 오버라이드 |

### 예시

```bash
nx make:crud User --no-views --style functional
```

JSON 전용 functional API를 생성합니다.

```ts
// src/app/controllers/user.controller.ts (functional 스타일)
export const userRoutes = {
  list: async (c: Context) => c.json([]),
  show: async (c: Context) => c.json({ id: c.req.param('id') }),
  create: async (c: Context) => {
    const body = await c.req.json();
    return c.json({ created: body }, 201);
  },
  // ...
};
```

---

## 6. 리소스별 `make:*` 명령어

### `nx make:controller <Name>`

```bash
nx make:controller User
nx make:controller Comment --style functional
nx make:controller Webhook --no-service
```

### `nx make:service <Name>`

```bash
nx make:service User
nx make:service Comment --no-repo
```

### `nx make:module <Name>`

```bash
nx make:module User
nx make:module User --no-controller --no-service
```

### `nx make:model <Name>`

```bash
nx make:model User
nx make:model User --columns "name:text,email:text,bio:text,age:integer"
nx make:model User --orm drizzle
```

### `nx make:migration <Name>`

```bash
nx make:migration create_users_table
nx make:migration create_users_table --columns "name:text,email:text"
nx make:migration add_email_to_users
```

파일명 패턴: `YYYYMMDD_HHmmss_<snake>.sql` (Drizzle는 `.ts`).

### `nx make:middleware <Name>`

```bash
nx make:middleware Auth
nx make:middleware RateLimit
```

### `nx make:validator <Name>`

```bash
nx make:validator User
nx make:validator CreateOrder
```

---

## 7. `nx info`

해석된 설정과 환경을 출력합니다. config 레이어 디버깅에 유용합니다.

```bash
nx info
```

출력:

```
────────────────────────────
  Nexus CLI — Project Info
────────────────────────────

ℹ  Resolved configuration

  routing           nest
  view              inertia
  orm               drizzle
  database.driver   bun-sqlite
  database.url      app.db
  inertia.frontend  react
  inertia.ssr       true
  inertia.version   1.0.0

ℹ  Paths
  ...

ℹ  Environment
  NODE_ENV  (unset)
  NX_ORM    drizzle
  ...
```

---

## 8. `nx route:list`

등록된 모든 HTTP 라우트를 컨트롤러의 `@Controller` / `@Get` 메타데이터에서 읽어 출력합니다. HTTP 메서드별 컬러 코딩(GET=cyan, POST=green, DELETE=red, …).

```bash
nx route:list
nx route:list --format json
```

Adonis 스타일이나 functional 컨트롤러는 동적으로 등록되므로 라우트가 출력되지 않으며, 안내 메시지가 표시됩니다.

---

## 9. 환경 변수 오버라이드

모든 config 필드는 env 변수로 오버라이드할 수 있습니다. CI에서 유용합니다.

| 변수 | 효과 |
| -------- | ------ |
| `NX_ROUTING` | 라우팅 스타일 |
| `NX_VIEW` | 뷰 엔진 |
| `NX_ORM` | ORM 드라이버 |
| `NX_DATABASE_DRIVER` | 데이터베이스 드라이버 |
| `NX_DATABASE_URL` | 데이터베이스 URL |
| `NX_INERTIA_FRONTEND` | Inertia 프런트엔드 |
| `NX_INERTIA_SSR` | `true` / `false` |
| `NX_INERTIA_VERSION` | 에셋 버전 문자열 |

예시:

```bash
NX_ORM=prisma nx make:crud User
```

---

## 10. 비대화형 모드

프롬프트를 건너뛰려면 `--no-interaction`을 전달합니다 (CI에서 필수).

```bash
nx make:crud Post --no-interaction --style nest --view inertia --orm drizzle
```

---

## 11. 프로그래매틱 API

모든 CLI 모듈은 `nexus/cli`에서 import할 수도 있습니다.

```ts
import { loadConfig, render, parseArgs } from 'nexus/cli';
import controllerTemplate from 'nexus/cli/templates/controller/nest.js';

const config = await loadConfig();
const code = render(controllerTemplate, {
  name: 'User',
  service: 'UserService',
  serviceCamel: 'userService',
  kebab: 'user',
  camel: 'user',
  snake: 'user',
});
```

이는 `make:*` 명령어들이 내부적으로 사용하는 방식입니다.

---

## 12. 커스텀 명령어 작성

```ts
// src/cli/commands/make-feature.ts
import type { Command, CommandContext } from 'nexus/cli';
import { logger, writeFile, render } from 'nexus/cli';

export default {
  name: 'make:feature',
  summary: 'Generate a feature flag',
  async run(ctx: CommandContext): Promise<number> {
    const name = ctx.positional[0];
    if (!name) {
      logger.error('Usage: nx make:feature <Name>');
      return 1;
    }
    writeFile(`src/feature-flags/${name.toLowerCase()}.ts`, `// TODO`);
    logger.success(`created ${name}`);
    return 0;
  },
};
```

`src/cli/commands/index.ts`에 등록:

```ts
import makeFeature from './make-feature.js';
commands.push(makeFeature);
```

---

## 13. 참고

- [`controllers.md`](./controllers.md) — 세 가지 라우팅 스타일
- [`dependency-injection.md`](./dependency-injection.md) — 모듈 & DI
- [`validation.md`](./validation.md) — Zod DTO
- [`view-engines.md`](./view-engines.md) — Rendu / Edge / Inertia
- [설계: architecture](../design/architecture.md) — 스택에서 CLI의 위치
