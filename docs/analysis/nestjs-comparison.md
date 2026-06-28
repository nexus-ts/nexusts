# Migration from NestJS to NexusTS

> 한국어 버전: [`nestjs-comparison.ko.md`](./nestjs-comparison.ko.md)

This guide helps NestJS developers migrate to NexusTS. It maps concepts,
compares decorators, shows side-by-side code examples, and highlights
key differences.

---

## Why Migrate

| Reason | Detail |
|--------|--------|
| **Bun-native** | Native TypeScript execution, no `tsc`/`swc`/`ts-node`. Hot reload, fast startup. |
| **Standard decorators** | TC39 standard ES decorators — no `experimentalDecorators` or `reflect-metadata` required. Field injection instead of constructor injection. |
| **32 independent modules** | Install only what you import. Tree-shakeable, no dead code. |
| **Built-in ecosystem** | GraphQL, gRPC, WebSocket, SSE, resilience (retry/circuit/bulkhead), cache, queue, scheduler — all first-party, no community packages. |
| **Zero `reflect-metadata`** | Inline polyfill in `@nexusts/core/di/safe-reflect`. No external package needed. |

---

## Concept Mapping

| NestJS | NexusTS | Notes |
|--------|---------|-------|
| `@Module({})` | `@Module({})` | Same structure: `imports`, `controllers`, `providers`, `exports` |
| `@Injectable()` | `@Injectable()` | Same. Supports `{ scope: 'request' }` for request-scoped DI |
| `@Controller()` | `@Controller()` | Same. Also supports Adonis-style and functional routing |
| `@Inject()` (constructor) | `@Inject()` (field) | Constructor injection → field injection: `@Inject(Token) declare field: Type` |
| `@Get()`, `@Post()`, etc. | `@Get()`, `@Post()`, etc. | Identical |
| `@Param('id')` | `ctx.req.param('id')` | Parameter decorator → `ctx.req.*` methods in standard mode |
| `@Body()` | `await ctx.req.json()` | Parameter decorator → direct JSON body access |
| `@Query('page')` | `ctx.req.query('page')` | Parameter decorator → direct query access |
| `@Res()` | `ctx.res` | Response object on Hono Context |
| Guards (`@UseGuards`) | Guards (`@UseGuards`) | Same pattern |
| Interceptors (`@UseInterceptors`) | Interceptors (`@UseInterceptors`) | Same pattern |
| Exception Filters (`@UseFilters`) | Exception Filters (`@UseFilters`) | Same pattern |
| Pipes (`@UsePipes`) | `schema.parse()` / `@Validate` | Validation via Zod schema directly or `@Validate` decorator |
| `NestFactory.create()` | `new Application(AppModule)` | Direct instantiation, no factory |
| Dynamic modules | `forRoot()` static method | Same pattern |

---

## Side-by-Side: NestJS → NexusTS

### Controller

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

**NexusTS (standard decorators):**

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

### Service

**NestJS:**

```ts
@Injectable()
export class UserService {
  constructor(
    @InjectRepository(User) private repo: Repository<User>,
    private logger: Logger,
  ) {}
}
```

**NexusTS:**

```ts
@Injectable()
export class UserService {
  @Inject(UserRepository) declare repo: UserRepository;
  private logger = new Logger();
}
```

### Module

**NestJS:**

```ts
@Module({
  imports: [TypeOrmModule.forFeature([User])],
  controllers: [UserController],
  providers: [UserService],
  exports: [UserService],
})
export class UserModule {}
```

**NexusTS:**

```ts
@Module({
  imports: [DrizzleModule.forRoot({ dialect: 'postgres', connection: { url: '...' } })],
  controllers: [UserController],
  providers: [UserService, UserRepository],
  exports: [UserService],
})
export class UserModule {}
```

### Application Bootstrap

**NestJS:**

```ts
async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.useGlobalPipes(new ValidationPipe());
  await app.listen(3000);
}
bootstrap();
```

**NexusTS:**

```ts
const app = new Application(AppModule, { logging: true });
await app.listen(3000);
```

---

## What is Different

### Standard ES Decorators (No experimentalDecorators)

NexusTS v0.9+ uses **TC39 standard ES decorators**. This means:

- **Field injection** replaces constructor injection
- Controller methods receive `ctx: Context` instead of `@Param`/`@Body`/`@Query`
- No `experimentalDecorators` or `emitDecoratorMetadata` in tsconfig
- No `reflect-metadata` import (inline polyfill in safe-reflect.ts)

```ts
// NestJS — constructor injection
constructor(@Inject(Service) private service: Service) {}

// NexusTS — field injection  
@Inject(Service) declare service: Service;
```

The `@Validate` decorator and parameter decorators (`@Body`, `@Param`) still work with `experimentalDecorators: true` for backward compatibility, but the standard pattern is recommended.

### Built-in Modules, Not Community Packages

NestJS relies on `@nestjs/*` community packages. NexusTS ships equivalent functionality as first-party modules:

| What you need | NestJS | NexusTS |
|---------------|--------|---------|
| HTTP framework | Express / Fastify (via platform adapter) | **Hono** (built-in, Bun + Cloudflare Workers) |
| ORM | TypeORM / Prisma / MikroORM / Mongoose / Sequelize | `@nexusts/drizzle` (5 dialects) + `@nexusts/kysely` (typed SQL builder) |
| GraphQL | `@nestjs/graphql` + `@nestjs/apollo` | `@nexusts/graphql` (SDL + code-first) |
| gRPC | `@nestjs/microservices` | `@nexusts/grpc` (reflection-based, 4 call types) |
| WebSocket | `@nestjs/websockets` + `@nestjs/platform-socket.io` | `@nexusts/ws` (Bun) |
| SSE | Manual Hono / Express adapter | `@nexusts/sse` (built-in) |
| Queue / Jobs | `@nestjs/bull` / `@nestjs/bullmq` | `@nexusts/queue` (BullMQ + Cloudflare + memory) |
| Scheduler / Cron | `@nestjs/schedule` | `@nexusts/schedule` (in-tree cron parser) |
| Cache | `@nestjs/cache-manager` | `@nexusts/cache` (memory + Drizzle + Redis) |
| Rate Limiting | `@nestjs/throttler` | `@nexusts/limiter` (3 strategies, Drizzle storage) |
| Auth | `@nestjs/passport` + `@nestjs/jwt` + strategies | `@nexusts/auth` (better-auth, all-in-one) |
| Session | `@nestjs/session` | `@nexusts/session` (cookie + memory + Drizzle) |
| Config / Env | `@nestjs/config` | `@nexusts/config` (Zod-validated) |
| Logger | `@nestjs/common` Logger | `@nexusts/logger` (Pino, structured, request-scoped) |
| OpenAPI / Swagger | `@nestjs/swagger` | `@nexusts/openapi` (Zod → OpenAPI 3.1 + Scalar UI) |
| Health checks | `@nestjs/terminus` | `@nexusts/health` (built-in indicators) |
| Static files | `@nestjs/serve-static` | `@nexusts/static` (ETag, Range, SPA fallback) |
| Email | `@nestjs/mailer` | `@nexusts/mail` (SMTP + File + Null, MJML) |
| File upload | `@nestjs/platform-express` + multer | `@nexusts/upload` (`@Upload` / `@UploadedFile`) |
| Events | `@nestjs/event-emitter` | `@nexusts/events` (wildcards, priorities, guards) |
| i18n | `nestjs-i18n` | `@nexusts/i18n` (`Intl`-based, pluralization) |
| Metrics / Prometheus | `@willsoto/nestjs-prometheus` | `@nexusts/metrics` (Counters, Histograms, Summaries) |
| Tracing / OpenTelemetry | `@nestjs/opentelemetry` | `@nexusts/tracing` (lazy SDK, auto-HTTP, W3C/B3) |
| Resilience | `@nestjs/bull` (retry only) or DIY | `@nexusts/resilience` (retry + circuit + bulkhead) |
| Compression | `@nestjs/compression` | Hono's `compress()` middleware |
| CORS | `@nestjs/common` CORS option | Hono's `cors()` middleware |
| Testing | `@nestjs/testing` | Vitest + `new Application()` (no test module needed) |
| HTTP client | `@nestjs/axios` | Fetch API (built-in Bun) |

**What NestJS lacks that NexusTS provides**:

| Feature | NexusTS | NestJS alternative |
|---------|---------|-------------------|
| Feature flags / canary | `@nexusts/feature-flag` | ❌ No first-party support |
| File storage (S3/R2/Local) | `@nexusts/drive` | ❌ No first-party support (DIY multer/S3 SDK) |
| Encryption / hashing | `@nexusts/crypto` | ❌ No first-party support (DIY `crypto` or `bcrypt`) |
| Redis client | `@nexusts/redis` (multi-runtime) | ❌ No first-party (use `ioredis` directly) |
| Runtime adapters | Bun + Cloudflare Workers | ❌ Express / Fastify only |

### Side-by-Side: Common Module Examples

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

// health.controller.ts
import { Controller, Get } from '@nestjs/common';
import { HealthCheckService, HttpHealthIndicator } from '@nestjs/terminus';

@Controller('health')
export class HealthController {
  constructor(
    private health: HealthCheckService,
    private http: HttpHealthIndicator,
  ) {}

  @Get()
  check() {
    return this.health.check([
      () => this.http.pingCheck('nestjs-docs', 'https://docs.nestjs.com'),
    ]);
  }
}
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

// Endpoints auto-registered:
// GET /health/live     → liveness probe
// GET /health/ready    → readiness probe (checks DB, cache, etc.)
// GET /health/startup  → startup probe
```

---

#### Configuration

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

// Validation at boot — invalid env fails fast.
@Injectable()
export class DatabaseService {
  @Inject(ConfigService) declare config: ConfigService;

  getHost() { return this.config.get('DB_HOST'); }
}
```

---

#### Static File Serving

**NestJS (`@nestjs/serve-static`):**

```ts
import { Module } from '@nestjs/common';
import { ServeStaticModule } from '@nestjs/serve-static';
import { join } from 'path';

@Module({
  imports: [
    ServeStaticModule.forRoot({
      rootPath: join(__dirname, '..', 'public'),
    }),
  ],
})
export class AppModule {}
```

**NexusTS (`@nexusts/static`):**

```ts
import { Module } from '@nexusts/core';
import { StaticModule } from '@nexusts/static';

const staticMiddleware = StaticModule.mount({
  root: './public',
  prefix: '/static',
});

const app = new Application(AppModule, {
  middleware: [staticMiddleware],
});
```

`StaticModule.mount()` returns a Hono middleware with ETag, Range
request support, and SPA fallback for client-side routing.

---

#### Cache

**NestJS (`@nestjs/cache-manager`):**

```ts
import { Module } from '@nestjs/common';
import { CacheModule } from '@nestjs/cache-manager';

@Module({
  imports: [CacheModule.register({ ttl: 60 })],
})
export class AppModule {}

@Injectable()
export class ProductService {
  constructor(@Inject(CACHE_MANAGER) private cache: Cache) {}

  async getProduct(id: number) {
    const cached = await this.cache.get(`product:${id}`);
    if (cached) return cached;
    const product = await this.db.findProduct(id);
    await this.cache.set(`product:${id}`, product, 60);
    return product;
  }
}
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

Tag-based invalidation is built in:

```ts
await this.cache.set('dashboard:stats', data, { tags: ['dashboard'] });
await this.cache.invalidateByTag('dashboard'); // busts all dashboard caches
```

---

#### Email

**NestJS (`@nestjs/mailer`):**

```ts
import { Module } from '@nestjs/common';
import { MailerModule } from '@nestjs-modules/mailer';
import { PugAdapter } from '@nestjs-modules/mailer/dist/adapters/pug.adapter';

@Module({
  imports: [
    MailerModule.forRoot({
      transport: 'smtps://user@example.com:pass@smtp.example.com',
      defaults: { from: '"No Reply" <noreply@example.com>' },
      template: { adapter: new PugAdapter(), dir: 'templates' },
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

### Request Body Access

In NestJS, you use `@Body()` or `@Body('field')` decorators. In NexusTS standard mode, you access the body directly:

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

For validation, use Zod's `parse()` directly:

```ts
const dto = CreateUserSchema.parse(await ctx.req.json());
```

### Dependency Injection

NexusTS supports two DI patterns:

| Pattern | When to use | Example |
|---------|------------|---------|
| **Field injection** (recommended) | Standard decorators | `@Inject(Service) declare service: Service;` |
| **Constructor injection** (legacy) | `experimentalDecorators: true` | `constructor(@Inject(Service) private service: Service) {}` |
| **Direct instantiation** | No DI needed | `private logger = new Logger();` |

### Hono Context Instead of Express/Fastify

NexusTS uses Hono internally. The `ctx` parameter is a Hono `Context`, not Express `Request`/`Response`:

| NestJS (Express) | NexusTS (Hono) |
|------------------|----------------|
| `req.params.id` | `ctx.req.param('id')` |
| `req.query.page` | `ctx.req.query('page')` |
| `req.body` | `await ctx.req.json()` |
| `req.headers` | `ctx.req.header('name')` |
| `res.status(200).json(...)` | `ctx.json(data)` |
| `res.status(404).send(...)` | `ctx.text('Not found', 404)` |

### Dependency Injection Tokens

In NestJS, `@Inject()` is often optional because `design:paramtypes` provides constructor parameter types. In NexusTS with standard decorators, Bun does not emit `design:paramtypes`, so you must use explicit `@Inject(Token)` or field injection.

```ts
// NestJS — works without @Inject (design:paramtypes)
constructor(private readonly service: UserService) {}

// NexusTS — explicit @Inject required  field injection
@Inject(UserService) declare service: UserService;

// Or direct instantiation (no DI)
private service = new UserService();
```

---

## Quick Migration Checklist

1. **Install Bun** ≥ 1.3 — `curl -fsSL https://bun.sh/install | bash`
2. **Remove** `reflect-metadata` from dependencies — inline polyfill handles it
3. **Update tsconfig** — remove `experimentalDecorators` and `emitDecoratorMetadata`
4. **Replace** `@Param`/`@Body`/`@Query` with `ctx.req.param()`/`await ctx.req.json()`/`ctx.req.query()`
5. **Replace** constructor injection with field injection: `constructor(@Inject(S) private s: S) {}` → `@Inject(S) declare s: S;`
6. **Replace** Express `Request`/`Response` types with Hono `Context`
7. **Replace** TypeORM with `@nexusts/drizzle` — see [drizzle guide](../user-guide/drizzle.md)
8. **Replace** third-party packages with `@nexusts/*` equivalents
9. **Run** `bun run typecheck` and `bun run test`
10. **Verify** with `bun run dev` — hot reload works out of the box

---

## See Also

- [Controllers & decorators](../user-guide/controllers.md)
- [Dependency injection](../user-guide/dependency-injection.md)
- [Drizzle ORM guide](../user-guide/drizzle.md)
- [Standard decorator migration](../design/standard-decorators-migration.md)
