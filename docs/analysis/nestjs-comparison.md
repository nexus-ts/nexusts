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
| **Zero `reflect-metadata`** | ~16KB bundle savings. Lazy-loaded only for legacy compatibility. |

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
- No `reflect-metadata` import (saves ~16KB)

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
| ORM | TypeORM / Prisma / MikroORM | `@nexusts/drizzle` (5 dialects) |
| GraphQL | `@nestjs/graphql` | `@nexusts/graphql` (SDL + code-first) |
| gRPC | `@nestjs/microservices` | `@nexusts/grpc` (reflection-based, 4 call types) |
| WebSocket | `@nestjs/websockets` + `@nestjs/platform-socket.io` | `@nexusts/ws` (Bun + Node) |
| SSE | Manual Hono adapter | `@nexusts/sse` |
| Queue | `@nestjs/bull` + BullMQ | `@nexusts/queue` (BullMQ + Cloudflare + memory) |
| Scheduler | `@nestjs/schedule` | `@nexusts/schedule` (in-tree cron parser) |
| Cache | `@nestjs/cache-manager` | `@nexusts/cache` (memory + Drizzle + Redis) |
| Rate Limiting | `@nestjs/throttler` | `@nexusts/limiter` (3 strategies, Drizzle storage) |
| Auth | `@nestjs/passport` + strategies | `@nexusts/auth` (better-auth) |
| Session | `@nestjs/session` | `@nexusts/session` (cookie + memory + Drizzle) |
| Config | `@nestjs/config` | `@nexusts/config` (Zod-validated) |
| Logger | `@nestjs/common` Logger | `@nexusts/logger` (Pino, structured) |
| OpenAPI | `@nestjs/swagger` | `@nexusts/openapi` (Zod → OpenAPI 3.1) |
| Metrics | `@willsoto/nestjs-prometheus` | `@nexusts/metrics` (Prometheus) |
| Tracing | `@nestjs/opentelemetry` | `@nexusts/tracing` (OpenTelemetry) |
| File upload | `@nestjs/platform-express` + multer | `@nexusts/upload` |
| i18n | `nestjs-i18n` | `@nexusts/i18n` |
| Resilience | `@nestjs/bull` (retry) or custom | `@nexusts/resilience` (retry + circuit + bulkhead) |

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
2. **Remove** `reflect-metadata` from dependencies — no longer needed
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
