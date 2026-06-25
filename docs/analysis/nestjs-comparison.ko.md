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

| 필요 기능 | NestJS | NexusTS |
|-----------|--------|---------|
| ORM | TypeORM / Prisma | `@nexusts/drizzle` |
| GraphQL | `@nestjs/graphql` | `@nexusts/graphql` |
| gRPC | `@nestjs/microservices` | `@nexusts/grpc` |
| WebSocket | `@nestjs/websockets` | `@nexusts/ws` |
| Queue | `@nestjs/bull` | `@nexusts/queue` |
| Scheduler | `@nestjs/schedule` | `@nexusts/schedule` |
| Cache | `@nestjs/cache-manager` | `@nexusts/cache` |
| Auth | `@nestjs/passport` | `@nexusts/auth` |

### 의존성 주입 토큰

Bun이 `design:paramtypes`를 내보내지 않으므로 명시적 `@Inject(Token)`이 필요합니다:

```ts
// NestJS — @Inject 없이 동작
constructor(private readonly service: UserService) {}

// NexusTS — 명시적 @Inject 필요
@Inject(UserService) declare service: UserService;

// 또는 직접 생성 (DI 불필요)
private service = new UserService();
```

### Hono Context 사용

NexusTS는 Hono 기반. Express 대신 Hono Context 사용:

| NestJS (Express) | NexusTS (Hono) |
|------------------|----------------|
| `req.params.id` | `ctx.req.param('id')` |
| `req.query.page` | `ctx.req.query('page')` |
| `req.body` | `await ctx.req.json()` |
| `res.status(200).json(...)` | `ctx.json(data)` |

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
