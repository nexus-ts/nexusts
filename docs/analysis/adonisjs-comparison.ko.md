# AdonisJS에서 NexusTS로 마이그레이션

> English version: [`adonisjs-comparison.md`](./adonisjs-comparison.md)

이 가이드는 AdonisJS 개발자가 NexusTS로 마이그레이션하는 방법을 설명합니다.
개념 매핑, 코드 비교, 주요 차이점을 다룹니다.

---

## 마이그레이션 이유

| 이유 | 설명 |
|--------|--------|
| **Bun 네이티브** | 네이티브 TypeScript 실행, `tsc`/`ts-node` 불필요 |
| **표준 데코레이터** | TC39 표준 ES 데코레이터 기반 |
| **32개 독립 모듈** | 필요한 것만 설치 |
| **내장 생태계** | GraphQL, gRPC, WebSocket, Resilience 등 자체 제공 |
| **Hono 성능** | 엣지 수준 성능, Cloudflare Workers 지원 |

---

## 개념 매핑

| AdonisJS | NexusTS | 비고 |
|----------|---------|------|
| `Route.group()` / `start/routes.ts` | `@Module({ controllers })` | 모듈 기반 라우팅 |
| `Route.resource()` | `@Controller()` + `@Get`/`@Post` | 데코레이터 기반 |
| `HttpContext` | `ctx: Context` (Hono) | Hono Context 직접 수신 |
| Lucid ORM | `@nexusts/drizzle` | Drizzle ORM + `DrizzleRepository` |
| VineJS | Zod | Zod 스키마 직접 사용 |
| Ace CLI | `nx` CLI | ACE 스타일 명령어 |
| `@adonisjs/session` | `@nexusts/session` | Cookie/Memory/Drizzle |
| `@adonisjs/shield` | `@nexusts/shield` | CSRF + 보안 헤더 |
| `@adonisjs/logger` | `@nexusts/logger` | Pino 기반 구조화 로깅 |
| `@adonisjs/cache` | `@nexusts/cache` | Memory/Drizzle/Redis |
| `@adonisjs/drive` | `@nexusts/drive` | Local/S3/R2/Memory |
| `@adonisjs/mail` | `@nexusts/mail` | SMTP/File/Null |
| `@adonisjs/queue` | `@nexusts/queue` | BullMQ/Cloudflare/Memory |
| `@adonisjs/scheduler` | `@nexusts/schedule` | 인트리 cron 파서 |
| Edge 템플릿 | Rendu / Edge / Eta | 확장자로 자동 감지 |
| Inertia.js | Inertia.js v3 | 자체 지원 (React/Vue SSR) |

---

## 코드 비교: AdonisJS → NexusTS

### 컨트롤러

**AdonisJS:**

```ts
import { HttpContext } from '@adonisjs/core/http';

export default class UsersController {
  async index({ request }: HttpContext) {
    return User.all();
  }

  async show({ params }: HttpContext) {
    return User.find(params.id);
  }
}
```

**NexusTS:**

```ts
@Controller('/users')
export class UserController {
  @Inject(UserService) declare userService: UserService;

  @Get('/')
  async index(ctx: Context) {
    return this.userService.findAll();
  }

  @Get('/:id')
  async show(ctx: Context) {
    const id = Number(ctx.req.param('id'));
    return this.userService.findById(id);
  }
}
```

### 모델 / 리포지토리

**AdonisJS (Lucid):**

```ts
import { BaseModel, column } from '@adonisjs/lucid/orm';

export default class User extends BaseModel {
  @column({ isPrimary: true }) declare id: number;
  @column() declare email: string;
}
```

**NexusTS (Drizzle):**

```ts
export const users = sqliteTable('users', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  email: text('email').notNull().unique(),
});

@Injectable()
export class UserRepository extends DrizzleRepository<typeof users> {
  @Inject(DrizzleService.TOKEN) declare db: DrizzleService;
  protected readonly table = users;
}
```

### 서비스

**AdonisJS:**

```ts
export class UserService {
  async findAll() {
    return User.all();
  }
}
```

**NexusTS:**

```ts
@Injectable()
export class UserService {
  @Inject(UserRepository) declare userRepo: UserRepository;

  async findAll() {
    return this.userRepo.findAll();
  }
}
```

---

## 주요 차이점

### 표준 ES 데코레이터

NexusTS v0.9+는 **TC39 표준 ES 데코레이터** 사용. AdonisJS도 레거시 데코레이터를 사용하지만, NexusTS는 필드 인젝션을 추가로 지원합니다:

```ts
// AdonisJS — 생성자 인젝션
constructor(@inject() private userService: UserService) {}

// NexusTS — 필드 인젝션
@Inject(UserService) declare userService: UserService;
```

### 라우팅 방식

AdonisJS는 `start/routes.ts`에서 `Route.group()`/`Route.resource()`로 라우트를 정의합니다. NexusTS는 `@Controller()` 클래스 내부에서 데코레이터로 라우트를 정의하며, 세 가지 스타일을 혼용할 수 있습니다:

```ts
// 1. Nest 스타일 (데코레이터) — 권장
@Controller('/users')
class UserController { @Get('/') async index() {} }

// 2. Adonis 스타일 (라우트 테이블)
app.server.router.add('GET', '/users', UserController, 'index');

// 3. Functional 스타일 (Hono)
app.server.router.raw('GET', '/users', (c) => c.json([]));
```

### 뷰 엔진

AdonisJS는 Edge 템플릿을 사용합니다. NexusTS는 세 가지 엔진 지원:

| 엔진 | 확장자 | 설명 |
|-------|---------|------|
| **Rendu** (기본) | `.html`, `.rendu` | PHP 스타일 `<?= expr ?>` |
| **Edge** | `.edge` | Adonis 스타일 `{{ expr }}` |
| **Eta** | `.eta` | EJS 스타일 `<%= expr %>` |

확장자로 자동 감지됩니다.

### 아키텍처 차이

| 항목 | AdonisJS | NexusTS |
|-------|----------|---------|
| ORM | Lucid (Active Record) | Drizzle (Data Mapper) |
| 마이그레이션 | `node ace migration:run` | `nx db:migrate` |
| 검증 | VineJS | Zod |
| CLI | `node ace` | `nx` |
| 데코레이터 | 레거시 (`experimentalDecorators`) | 표준 (TC39) + 레거시 폴백 |

---

## AdonisJS에는 있고 NexusTS에는 없는 기능

| 기능 | 상태 | 대안 |
|------|------|------|
| Inspector / 디버그 툴바 | ❌ 예정 | Bun 내장 디버거 사용 |
| Admin 패널 | ❌ 미계획 | Nuxt / Next.js |
| 정적 사이트 생성 | ❌ 미계획 | 별도 SSG 도구 |

---

## 빠른 마이그레이션 체크리스트

1. **Bun** ≥ 1.3 설치
2. 라우트 파일 대신 `@Module({})` 클래스 생성
3. `Route.resource()` → `@Controller()` + `@Get`/`@Post`로 변경
4. Lucid 모델 → Drizzle 테이블 정의로 변경
5. VineJS → Zod 스키마로 변경
6. `@inject()` → `@Inject(Token) declare field: Type` 또는 `new Service()`
7. Edge 템플릿 → Rendu/Edge/Eta 뷰로 변경
8. `@adonisjs/*` → `@nexusts/*`로 교체
9. `bun run typecheck` 및 `bun run test` 실행

---

## 같이 보기

- [컨트롤러 & 데코레이터](../user-guide/controllers.md)
- [의존성 주입](../user-guide/dependency-injection.md)
- [Drizzle ORM 가이드](../user-guide/drizzle.md)
- [뷰 엔진](../user-guide/view-engines.md)
- [표준 데코레이터 마이그레이션](../design/standard-decorators-migration.ko.md)
