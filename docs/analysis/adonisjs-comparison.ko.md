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

### 내장 모듈 (Batteries Included)

AdonisJS는 "batteries included" 철학으로 유명합니다. NexusTS는 모든 배터리를 일치 또는 초과하는 first-party 모듈로 제공합니다:

| 필요 기능 | AdonisJS | NexusTS |
|-----------|----------|---------|
| HTTP 서버 | `@adonisjs/core` (HTTP + 라우터) | **Hono** (내장, Bun + Cloudflare Workers) |
| ORM | Lucid (`@adonisjs/lucid`) | `@nexusts/drizzle` (5개 방언) |
| 검증 | VineJS | Zod (직접 사용, 래퍼 불필요) |
| Auth | `@adonisjs/auth` | `@nexusts/auth` (better-auth) |
| 세션 | `@adonisjs/session` | `@nexusts/session` (cookie + memory + Drizzle) |
| 캐시 | `@adonisjs/cache` | `@nexusts/cache` (memory + Drizzle + Redis) |
| 로거 | `@adonisjs/logger` | `@nexusts/logger` (Pino, 요청 스코프) |
| 암호화 | `@adonisjs/encryption` | `@nexusts/crypto` (AES-256-GCM + HMAC + scrypt) |
| Hash | `@adonisjs/hash` | `@nexusts/crypto` (HashService) |
| Shield (CSRF/CORS) | `@adonisjs/shield` | `@nexusts/shield` (CSRF + HSTS + CSP) |
| Rate Limiting | `@adonisjs/throttler` | `@nexusts/limiter` (3 전략, Drizzle storage) |
| 메일 | `@adonisjs/mail` | `@nexusts/mail` (SMTP + File + Null, MJML) |
| Drive (파일 저장소) | `@adonisjs/drive` | `@nexusts/drive` (Local + S3 + R2 + memory) |
| Queue | `@adonisjs/queue` | `@nexusts/queue` (BullMQ + Cloudflare + memory) |
| 스케줄러 | `@adonisjs/scheduler` | `@nexusts/schedule` (인트리 cron 파서) |
| 이벤트 | `@adonisjs/events` | `@nexusts/events` (wildcard, 우선순위, 가드) |
| Static | `@adonisjs/static` | `@nexusts/static` (ETag, Range, SPA fallback) |
| Health check | `@adonisjs/health` | `@nexusts/health` (내장 indicator, 멀티 백엔드) |
| i18n | `@adonisjs/i18n` | `@nexusts/i18n` (`Intl` 기반, 복수형) |
| 뷰 템플릿 | `@adonisjs/view` (Edge) | Rendu / Edge / Eta (3개 엔진, 자동 감지) |
| Inertia | `@adonisjs/inertia` | `@nexusts/view` (Inertia v3, React/Vue SSR) |
| Config | `@adonisjs/config` | `@nexusts/config` (Zod 검증) |
| Bodyparser | `@adonisjs/bodyparser` | Hono 내장 + `@nexusts/upload` |
| CLI | Ace + `@adonisjs/assembler` | `@nexusts/cli` (`nx`, ACE 스타일) |
| REPL | `node ace repl` | `nx repl` (DI 해석, 인트로스펙션) |
| Testing | `@adonisjs/testing` | Vitest + `new Application()` |
| OpenAPI / Swagger | ❌ first-party 없음 | `@nexusts/openapi` (Zod → OpenAPI 3.1 + Scalar UI) |
| SSE | ❌ first-party 없음 | `@nexusts/sse` (내장) |
| GraphQL | ❌ first-party 없음 | `@nexusts/graphql` (SDL + code-first) |
| gRPC | ❌ first-party 없음 | `@nexusts/grpc` (4개 call 타입) |
| WebSocket | ❌ first-party 없음 | `@nexusts/ws` (Bun) |
| Metrics | ❌ first-party 없음 | `@nexusts/metrics` (Counter, Histogram, Summary) |
| Tracing | ❌ first-party 없음 | `@nexusts/tracing` (lazy SDK, 자동 HTTP, W3C/B3) |
| Feature flags | ❌ first-party 없음 | `@nexusts/feature-flag` (rollout, allowlist) |
| Resilience | ❌ first-party 없음 | `@nexusts/resilience` (retry + circuit + bulkhead) |

### 주요 모듈 비교 예제

#### Health Check

**AdonisJS (`@adonisjs/health`):**

```ts
import { HealthCheckController } from '@adonisjs/health';
import { DiskHealthCheck } from '@adonisjs/health/drivers';

const controller = new HealthCheckController([new DiskHealthCheck({ threshold: 0.9 })]);
router.get('/health', ({ response }) => controller.run(response));
```

**NexusTS (`@nexusts/health`):**

```ts
import { Module } from '@nexusts/core';
import { HealthModule } from '@nexusts/health';

@Module({
  imports: [HealthModule.forRoot({ builtIn: { memory: true, disk: { threshold: 0.1 } } })],
})
export class AppModule {}
// 자동 등록: GET /health/live, /health/ready, /health/startup
```

---

#### 캐시

**AdonisJS (`@adonisjs/cache`):**

```ts
import { Cache } from '@adonisjs/cache/services/main';

class PostService {
  async find(id: number) {
    const cached = await Cache.get(`post:${id}`);
    if (cached) return cached;
    const post = await Post.find(id);
    await Cache.set(`post:${id}`, post);
    return post;
  }
}
```

**NexusTS (`@nexusts/cache`):**

```ts
import { Module } from '@nexusts/core';
import { CacheModule, CacheService } from '@nexusts/cache';

@Module({ imports: [CacheModule.forRoot({ defaultTtl: 60 })] })
export class AppModule {}

@Injectable()
class ProductService {
  @Inject(CacheService) declare cache: CacheService;

  async getProduct(id: number) {
    const cached = await this.cache.get(`product:${id}`);
    if (cached) return cached;
    const product = await this.db.findProduct(id);
    await this.cache.set(`product:${id}`, product);
    return product;
  }
}
```

태그 기반 무효화 내장:

```ts
this.cache.set('stats', data, { tags: ['dashboard'] });
this.cache.invalidateByTag('dashboard');
```

---

#### 메일

**AdonisJS (`@adonisjs/mail`):**

```ts
import { Mail } from '@adonisjs/mail/services/main';

class NotificationService {
  async sendWelcome(email: string) {
    await Mail.send((m) => m.to(email).subject('Welcome!').html('<h1>Hello</h1>'));
  }
}
```

**NexusTS (`@nexusts/mail`):**

```ts
import { Module } from '@nexusts/core';
import { MailModule, MailService, FileTransport } from '@nexusts/mail';

@Module({ imports: [MailModule.forRoot({ transport: new FileTransport({ dir: './outbox' }) })] })
export class AppModule {}

@Injectable()
class NotificationService {
  @Inject(MailService) declare mail: MailService;

  async sendWelcome(email: string) {
    await this.mail.send({ to: email, subject: 'Welcome!', html: '<h1>Hello</h1>' });
  }
}
```

---

#### 스케줄러

**AdonisJS (`@adonisjs/scheduler`):**

```ts
import Scheduler from '@adonisjs/scheduler/services/main';
Scheduler.command('*/5 * * * *', async () => { await cleanupExpiredTokens(); });
```

**NexusTS (`@nexusts/schedule`):**

```ts
import { Injectable } from '@nexusts/core';
import { Cron } from '@nexusts/schedule';

@Injectable()
class CleanupJob {
  @Cron('*/5 * * * *')
  async cleanupExpiredTokens() { /* ... */ }
}
```

---

#### Drive (파일 저장소)

**AdonisJS (`@adonisjs/drive`):**

```ts
import Drive from '@adonisjs/drive/services/main';
await Drive.put('avatars/1.jpg', file.content);
return Drive.getUrl('avatars/1.jpg');
```

**NexusTS (`@nexusts/drive`):**

```ts
import { Module } from '@nexusts/core';
import { DriveModule, DriveService } from '@nexusts/drive';

@Module({ imports: [DriveModule.forRoot({ driver: 'local', root: './storage' })] })
export class AppModule {}

@Injectable()
class AvatarService {
  @Inject(DriveService) declare drive: DriveService;

  async upload(file: Buffer) {
    await this.drive.put('avatars/1.jpg', file);
    return this.drive.url('avatars/1.jpg');
  }
}
```

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
