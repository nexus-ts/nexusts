# NestJS에서 NexusTS로 마이그레이션

> English version: [`nestjs-comparison.md`](./nestjs-comparison.md)

이 가이드는 NestJS 개발자가 NexusTS로 마이그레이션하는 방법을 설명합니다.
개념 매핑, 데코레이터 비교, 코드 예제 및 주요 차이점을 다룹니다.

---

## 마이그레이션 이유

| 이유 | 설명 |
|--------|--------|
| **Bun 네이티브** | 네이티브 TypeScript 실행, `tsc`/`swc` 불필요, 핫 리로드 |
| **표준 데코레이터** | TC39 표준 ES 데코레이터 — `experimentalDecorators` 불필요 |
| **32개 독립 모듈** | 필요한 것만 설치, 트리셰이크 가능 |
| **내장 생태계** | GraphQL, gRPC, WebSocket, Resilience 등 모두 자체 제공 |
| **`reflect-metadata` 제로** | ~16KB 번들 절약, 레거시 호환 시에만 로딩 |

---

## 개념 매핑

| NestJS | NexusTS | 비고 |
|--------|---------|------|
| `@Module({})` | `@Module({})` | 동일: `imports`, `controllers`, `providers`, `exports` |
| `@Injectable()` | `@Injectable()` | 동일. `{ scope: 'request' }` 지원 |
| `@Controller()` | `@Controller()` | 동일. Adonis/Functional 라우팅도 지원 |
| `@Inject()` (생성자) | `@Inject()` (필드) | 생성자 주입 → 필드 주입 |
| `@Get()`, `@Post()` 등 | `@Get()`, `@Post()` 등 | 동일 |
| `@Param('id')` | `ctx.req.param('id')` | 파라미터 데코레이터 → `ctx.req.*` 메서드 |
| `@Body()` | `await ctx.req.json()` | 파라미터 데코레이터 → 직접 body 접근 |
| `@Query('page')` | `ctx.req.query('page')` | 파라미터 데코레이터 → 직접 query 접근 |
| Guard (`@UseGuards`) | Guard (`@UseGuards`) | 동일 |
| Interceptor (`@UseInterceptors`) | Interceptor (`@UseInterceptors`) | 동일 |
| Exception Filter (`@UseFilters`) | Exception Filter (`@UseFilters`) | 동일 |
| Pipe (`@UsePipes`) | `schema.parse()` / `@Validate` | Zod 스키마 직접 사용 |
| `NestFactory.create()` | `new Application(AppModule)` | 팩토리 없이 직접 생성 |

---

## 코드 비교: NestJS → NexusTS

### 컨트롤러

**NestJS:**

```ts
@Controller('users')
export class UserController {
  constructor(private readonly userService: UserService) {}

  @Get(':id')
  async findOne(@Param('id') id: string) {
    return this.userService.findOne(id);
  }

  @Post()
  async create(@Body() dto: CreateUserDto) {
    return this.userService.create(dto);
  }
}
```

**NexusTS (표준 데코레이터):**

```ts
@Controller('/users')
export class UserController {
  @Inject(UserService) declare userService: UserService;

  @Get('/:id')
  async findOne(ctx: Context) {
    const id = ctx.req.param('id');
    return this.userService.findOne(id);
  }

  @Post('/')
  async create(ctx: Context) {
    const dto = await ctx.req.json() as CreateUserDto;
    return this.userService.create(dto);
  }
}
```

### 서비스

**NestJS:**

```ts
@Injectable()
export class UserService {
  constructor(@InjectRepository(User) private repo: Repository<User>) {}
}
```

**NexusTS:**

```ts
@Injectable()
export class UserService {
  @Inject(UserRepository) declare repo: UserRepository;
}
```

### 모듈

**NestJS:**

```ts
@Module({
  imports: [TypeOrmModule.forFeature([User])],
  controllers: [UserController],
  providers: [UserService],
})
export class UserModule {}
```

**NexusTS:**

```ts
@Module({
  imports: [DrizzleModule.forRoot({ dialect: 'postgres', connection: { url: '...' } })],
  controllers: [UserController],
  providers: [UserService, UserRepository],
})
export class UserModule {}
```

### 애플리케이션 부트스트랩

**NestJS:**

```ts
async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.useGlobalPipes(new ValidationPipe());
  await app.listen(3000);
}
```

**NexusTS:**

```ts
const app = new Application(AppModule, { logging: true });
await app.listen(3000);
```

---

## 주요 차이점

### 표준 ES 데코레이터

NexusTS v0.9+는 **TC39 표준 ES 데코레이터**를 사용합니다:

```ts
// NestJS — 생성자 주입
constructor(@Inject(Service) private service: Service) {}

// NexusTS — 필드 주입
@Inject(Service) declare service: Service;
```

`experimentalDecorators: true` 설정 시 레거시 `@Body`/`@Param`도 계속 동작합니다.

### 내장 모듈 (서드파티 불필요)

NestJS가 `@nestjs/*` 커뮤니티 패키지에 의존하는 반면, NexusTS는 동등한 기능을 자체 모듈로 제공합니다:

| 필요 기능 | NestJS | NexusTS |
|-----------|--------|---------|
| HTTP 프레임워크 | Express / Fastify (플랫폼 어댑터) | **Hono** (내장, Bun/Node/Workers) |
| ORM | TypeORM / Prisma / MikroORM / Mongoose / Sequelize | `@nexusts/drizzle` (5개 방언) |
| GraphQL | `@nestjs/graphql` + `@nestjs/apollo` | `@nexusts/graphql` (SDL + code-first) |
| gRPC | `@nestjs/microservices` | `@nexusts/grpc` (리플렉션 기반, 4가지 call 타입) |
| WebSocket | `@nestjs/websockets` + `@nestjs/platform-socket.io` | `@nexusts/ws` (Bun + Node) |
| SSE | Express/Hono 수동 구현 | `@nexusts/sse` (내장) |
| Queue | `@nestjs/bull` / `@nestjs/bullmq` | `@nexusts/queue` (BullMQ + Cloudflare + memory) |
| Scheduler | `@nestjs/schedule` | `@nexusts/schedule` (인트리 cron 파서) |
| Cache | `@nestjs/cache-manager` | `@nexusts/cache` (memory + Drizzle + Redis) |
| Rate Limiting | `@nestjs/throttler` | `@nexusts/limiter` (3가지 전략, Drizzle storage) |
| Auth | `@nestjs/passport` + `@nestjs/jwt` | `@nexusts/auth` (better-auth, 올인원) |
| Session | `@nestjs/session` | `@nexusts/session` (cookie + memory + Drizzle) |
| Config | `@nestjs/config` | `@nexusts/config` (Zod 검증) |
| Logger | `@nestjs/common` Logger | `@nexusts/logger` (Pino, 구조화, 요청 스코프) |
| OpenAPI | `@nestjs/swagger` | `@nexusts/openapi` (Zod → OpenAPI 3.1 + Scalar UI) |
| Health check | `@nestjs/terminus` | `@nexusts/health` (내장 indicator) |
| Static files | `@nestjs/serve-static` | `@nexusts/static` (ETag, Range, SPA fallback) |
| Email | `@nestjs/mailer` | `@nexusts/mail` (SMTP + File + Null, MJML) |
| File upload | `@nestjs/platform-express` + multer | `@nexusts/upload` (`@Upload` / `@UploadedFile`) |
| Events | `@nestjs/event-emitter` | `@nexusts/events` (wildcard, 우선순위, 가드) |
| i18n | `nestjs-i18n` | `@nexusts/i18n` (`Intl` 기반, 복수형) |
| Metrics | `@willsoto/nestjs-prometheus` | `@nexusts/metrics` (Counter, Histogram, Summary) |
| Tracing | `@nestjs/opentelemetry` | `@nexusts/tracing` (lazy SDK, 자동 HTTP, W3C/B3) |
| Resilience | `@nestjs/bull` (retry) 또는 DIY | `@nexusts/resilience` (retry + circuit + bulkhead) |
| Compression | `@nestjs/compression` | Hono `compress()` 미들웨어 |
| CORS | `@nestjs/common` CORS 옵션 | Hono `cors()` 미들웨어 |
| Testing | `@nestjs/testing` | Vitest + `new Application()` (테스트 모듈 불필요) |
| HTTP client | `@nestjs/axios` | Fetch API (Bun/Node 내장) |

**NexusTS에는 있고 NestJS에는 없는 기능**:

| 기능 | NexusTS | NestJS 대안 |
|------|---------|------------|
| Feature flags / canary | `@nexusts/feature-flag` | ❌ first-party 없음 |
| File storage (S3/R2/Local) | `@nexusts/drive` | ❌ first-party 없음 (multer/S3 SDK 수동) |
| Encryption / hashing | `@nexusts/crypto` | ❌ first-party 없음 (DIY `crypto` 또는 `bcrypt`) |
| Redis client | `@nexusts/redis` (멀티 런타임) | ❌ first-party 없음 (`ioredis` 직접 사용) |
| Runtime | Bun / Node / Cloudflare Workers | ❌ Express / Fastify만 |

### 요청 본문 접근 (Request Body Access)

NestJS에서는 `@Body()` 또는 `@Body('field')` 데코레이터를 사용합니다. NexusTS 표준 모드에서는 body를 직접 접근합니다:

```ts
// NestJS
@Post()
async create(@Body() dto: CreateUserDto) {}

// NexusTS
@Post('/')
async create(ctx: Context) {
  const dto = await ctx.req.json() as CreateUserDto;
}
```

검증은 Zod의 `parse()`를 직접 사용합니다:

```ts
const dto = CreateUserSchema.parse(await ctx.req.json());
```

### 의존성 주입 (Dependency Injection)

NexusTS는 두 가지 DI 패턴을 지원합니다:

| 패턴 | 사용 시기 | 예제 |
|------|----------|------|
| **필드 인젝션** (권장) | 표준 데코레이터 | `@Inject(Service) declare service: Service;` |
| **생성자 인젝션** (레거시) | `experimentalDecorators: true` | `constructor(@Inject(Service) private service: Service) {}` |
| **직접 생성** | DI 불필요 시 | `private service = new Service();` |

### Hono Context 사용 (Express 대신)

NexusTS는 Hono 기반. Express 대신 Hono Context를 사용합니다:

| NestJS (Express) | NexusTS (Hono) |
|------------------|----------------|
| `req.params.id` | `ctx.req.param('id')` |
| `req.query.page` | `ctx.req.query('page')` |
| `req.body` | `await ctx.req.json()` |
| `req.headers` | `ctx.req.header('name')` |
| `res.status(200).json(...)` | `ctx.json(data)` |
| `res.status(404).send(...)` | `ctx.text('Not found', 404)` |

### 의존성 주입 토큰

Bun이 `design:paramtypes`를 내보내지 않으므로 명시적 `@Inject(Token)` 또는 필드 인젝션이 필요합니다:

```ts
// NestJS — @Inject 없이 동작 (design:paramtypes)
constructor(private readonly service: UserService) {}

// NexusTS — 명시적 @Inject 필요  필드 인젝션
@Inject(UserService) declare service: UserService;

// 또는 직접 생성 (DI 불필요)
private service = new UserService();
```

---




### 주요 모듈 비교 예제

#### Health Check

**NestJS (`@nestjs/terminus`):**

```ts
import { Module } from '@nestjs/common';
import { TerminusModule } from '@nestjs/terminus';
import { HealthController } from './health.controller';

@Module({
  imports: [TerminusModule],
  controllers: [HealthController],
})
export class HealthModule {}
```

**NexusTS (`@nexusts/health`):**

```ts
import { Module } from '@nexusts/core';
import { HealthModule } from '@nexusts/health';

@Module({
  imports: [
    HealthModule.forRoot({
      builtIn: { memory: true, disk: { threshold: 0.1 } },
    }),
  ],
})
export class AppModule {}

// 자동 등록되는 엔드포인트:
// GET /health/live     → liveness probe
// GET /health/ready    → readiness probe
// GET /health/startup  → startup probe
```

---

#### 설정 (Configuration)

**NestJS (`@nestjs/config`):**

```ts
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true })],
})
export class AppModule {}

@Injectable()
export class DatabaseService {
  constructor(private configService: ConfigService) {
    const host = this.configService.get<string>('DB_HOST');
    const port = this.configService.get<number>('DB_PORT', 5432);
  }
}
```

**NexusTS (`@nexusts/config`):**

```ts
import { z } from 'zod';
import { Module } from '@nexusts/core';
import { ConfigModule } from '@nexusts/config';

const schema = z.object({
  DB_HOST: z.string().default('localhost'),
  DB_PORT: z.coerce.number().default(5432),
  DATABASE_URL: z.string(),
});

@Module({
  imports: [ConfigModule.forRoot({ schema, exitOnError: true })],
})
export class AppModule {}

@Injectable()
export class DatabaseService {
  @Inject(ConfigService) declare config: ConfigService;

  getHost() { return this.config.get('DB_HOST'); }
}
```

---

#### 정적 파일 서빙

**NestJS (`@nestjs/serve-static`):**

```ts
import { Module } from '@nestjs/common';
import { ServeStaticModule } from '@nestjs/serve-static';
import { join } from 'path';

@Module({
  imports: [
    ServeStaticModule.forRoot({ rootPath: join(__dirname, '..', 'public') }),
  ],
})
export class AppModule {}
```

**NexusTS (`@nexusts/static`):**

```ts
import { StaticModule } from '@nexusts/static';

const staticMiddleware = StaticModule.mount({
  root: './public',
  prefix: '/static',
});

const app = new Application(AppModule, {
  middleware: [staticMiddleware],
});
```

---

#### 캐시

**NestJS (`@nestjs/cache-manager`):**

```ts
import { Module } from '@nestjs/common';
import { CacheModule } from '@nestjs/cache-manager';

@Module({
  imports: [CacheModule.register({ ttl: 60 })],
})
export class AppModule {}
```

**NexusTS (`@nexusts/cache`):**

```ts
import { Module } from '@nexusts/core';
import { CacheModule } from '@nexusts/cache';

@Module({
  imports: [CacheModule.forRoot({ defaultTtl: 60 })],
})
export class AppModule {}

@Injectable()
export class ProductService {
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
await this.cache.set('dashboard:stats', data, { tags: ['dashboard'] });
await this.cache.invalidateByTag('dashboard');
```

---

#### 이메일

**NestJS (`@nestjs/mailer`):**

```ts
import { Module } from '@nestjs/common';
import { MailerModule } from '@nestjs-modules/mailer';

@Module({
  imports: [
    MailerModule.forRoot({
      transport: 'smtps://user@example.com:pass@smtp.example.com',
      defaults: { from: '"No Reply" <noreply@example.com>' },
    }),
  ],
})
export class AppModule {}
```

**NexusTS (`@nexusts/mail`):**

```ts
import { Module } from '@nexusts/core';
import { MailModule, FileTransport } from '@nexusts/mail';

@Module({
  imports: [
    MailModule.forRoot({
      transport: new FileTransport({ dir: './outbox' }),
      defaults: { from: '"No Reply" <noreply@example.com>' },
    }),
  ],
})
export class AppModule {}

@Injectable()
export class NotificationService {
  @Inject(MailService) declare mail: MailService;

  async sendWelcome(email: string) {
    await this.mail.send({
      to: email,
      subject: 'Welcome!',
      html: '<h1>Hello</h1>',
    });
  }
}
```

---


## 빠른 마이그레이션 체크리스트

1. **Bun** ≥ 1.3 설치
2. `reflect-metadata` 의존성 제거
3. tsconfig에서 `experimentalDecorators`/`emitDecoratorMetadata` 제거
4. `@Param`/`@Body`/`@Query` → `ctx.req.param()`/`ctx.req.json()`/`ctx.req.query()`
5. 생성자 주입 → 필드 주입으로 변경
6. TypeORM → `@nexusts/drizzle`로 교체
7. 서드파티 패키지를 `@nexusts/*`로 교체
8. `bun run typecheck` 및 `bun run test` 실행

---

## 같이 보기

- [컨트롤러 & 데코레이터](../user-guide/controllers.md)
- [의존성 주입](../user-guide/dependency-injection.md)
- [Drizzle ORM 가이드](../user-guide/drizzle.md)
- [표준 데코레이터 마이그레이션](../design/standard-decorators-migration.ko.md)
