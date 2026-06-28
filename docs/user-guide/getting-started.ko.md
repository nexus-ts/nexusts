# 시작하기

> English version: [`getting-started.md`](./getting-started.md)
> Current version: **v0.9**

이 가이드는 빈 디렉터리에서 약 5분 안에 실행되는 NexusTS 앱까지 안내합니다.

## 1. 사전 요구 사항

- **Bun** ≥ 1.3 — <https://bun.sh>
- **TypeScript** ≥ 5.6 (Bun과 함께 자동 설치)
- TS 지원이 있는 코드 에디터 (VS Code, Zed 등)

대상 런타임에 따라 다음이 추가로 필요할 수 있습니다.

- **Bun** ≥ 1.3.10
- **Cloudflare Wrangler** — Workers에 배포할 때만

---

## 2. 설치

새 프로젝트에서:

```bash
bun add @nexusts/core zod hono
bun add -d @types/bun typescript vitest
```

---

## 3. TypeScript 설정

`tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "types": ["bun-types"]
  },
  "include": ["app/**/*.ts", "nx.config.ts"]
}
```

| 플래그 | 필수? | 이유 |
| ---- | --------- | --- |
| `moduleResolution: "bundler"` | 권장 | Bun + ESM에 대한 최선의 지원 |
| `strict` | 권장 | 표준 TS 위생 |

---

## 4. 최소 앱 만들기

```
my-app/
├── app/
│   ├── main.ts
│   ├── app.module.ts
│   └── controllers/
│       └── home.controller.ts
├── resources/
│   └── views/
│       └── welcome.html
├── public/
│   └── favicon.ico
├── package.json
└── tsconfig.json
```

### `app/main.ts`

```ts
import { Application } from '@nexusts/core';
import { AppModule } from './app.module.js';

const app = new Application(AppModule);

await app.listen(3000);
console.log('[nexus] http://localhost:3000 에서 수신 대기 중');
```

### `app/app.module.ts`

```ts
import { Module } from '@nexusts/core';
import { HomeController } from './controllers/home.controller.js';

@Module({
  controllers: [HomeController],
})
export class AppModule {}
```

### `app/controllers/home.controller.ts`

```ts
import { Controller, Get } from '@nexusts/core';

@Controller('/')
export class HomeController {
  @Get('/')
  index() {
    return { message: '안녕하세요, NexusTS!' };
  }
}
```

---

## 5. 실행

```bash
bun app/main.ts
```

다음과 같이 표시됩니다.

```
[nexus] Routes registered. Listening on :3000
[nexus] http://localhost:3000 에서 수신 대기 중
```

다른 셸에서:

```bash
$ curl http://localhost:3000/
{"message":"안녕하세요, NexusTS!"}
```

---

## 6. 핫 리로드

```bash
bun --hot app/main.ts
```

Bun의 `--hot` 플래그는 파일 변경 시 프로세스를 재시작합니다.

---

## 7. 다음 단계

- **[컨트롤러 & 데코레이터](./controllers.md)** — `@Get`/`@Post`,
  파라미터 데코레이터, 라우팅 스타일.
- **[의존성 주입](./dependency-injection.md)** — `@Injectable`,
  `@Inject`, 모듈.
- **[검증](./validation.md)** — Zod 스키마를 사용한 `@Validate`.
- **[Inertia.js 어댑터](./inertia.md)** — API 작성 없이 완전한 SPA UX.

---

## 8. 문제 해결

| 문제 | 가능한 원인 | 해결 |
| ------- | ------------ | ----- |
| `Class "X" is missing the @Module() decorator` | 모듈 클래스에 `@Module({...})` 누락 | `@Module({ controllers: [...] })`를 클래스에 추가 |
| `Cannot resolve token "DB"` | 어떤 모듈의 `providers`에도 토큰이 없음 | `{ provide: 'DB', useValue: drizzleInstance }`를 관련 모듈에 추가 |
| `Decorator function return type expected` | 메서드가 아닌 것에 데코레이터 적용 | 데코레이터는 클래스, 메서드, 또는 파라미터에 적용 |
| 정의한 경로가 404 | 경로 불일치 | `@Controller('/users')` + `@Get('/:id')`가 `/users/:id`를 만드는지 확인 |

---

## 9. 프로젝트 구조

프레임워크 소스는 `src/core/` 아래에 있습니다. 일반적인 사용자 앱:

```
my-app/
├── app/
│   ├── main.ts                    # 진입점
│   ├── app.module.ts              # 루트 모듈
│   ├── modules/                   # 기능 모듈
│   │   └── user/
│       ├── user.module.ts
│       │       ├── user.controller.ts
│       │       ├── user.service.ts
│       │       └── user.repository.ts
│   └── shared/                    # 횡단 관심사
│       ├── interceptors/
│       └── filters/
├── resources/
│   └── views/                     # 뷰 템플릿
├── public/                        # 정적 자산 (/static으로 서빙)
├── tests/
├── package.json
└── tsconfig.json
```
