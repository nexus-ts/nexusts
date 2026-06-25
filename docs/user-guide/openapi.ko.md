# @nexusts/openapi — OpenAPI 3.1 + Scalar UI

> English version: [`openapi.md`](./openapi.md)
> **v0.4**에서 추가됨 (NestJS / AdonisJS 분석의 Tier 1 격차).

`@nexusts/openapi`는 NexusTS의 **기본 OpenAPI 생성기**다. 프레임워크의
라우트 테이블을 워크하고, `@ApiTags` / `@ApiOperation` / `@ApiResponse` /
`@ApiBody` / `@ApiParam` / `@ApiQuery` / `@Validate` 메타데이터를 읽어
완전한 **OpenAPI 3.1** 문서를 생성한다. 번들된 Scalar UI가 `/docs`에서
이를 서비스한다 — 에셋 번들링, 빌드 단계 없음.

```
GET /openapi.json   →  JSON spec
GET /docs           →  Scalar UI (CDN 로드)
```

---

## 1. 빠른 시작

```bash
bun add @nexusts/openapi
```

```ts
// app/app.module.ts
import { Module } from '@nexusts/core';
import { OpenAPIModule } from '@nexusts/openapi';

@Module({
  imports: [
    OpenAPIModule.forRoot({
      info: {
        title: 'My API',
        version: '1.0.0',
        description: 'Service for X',
        contact: { name: 'Team', email: 'team@example.com' },
      },
      servers: [
        { url: 'http://localhost:3000', description: 'Local' },
        { url: 'https://api.example.com', description: 'Production' },
      ],
    }),
  ],
})
export class AppModule {}
```

프레임워크 라우터가 빌드된 후 라우트 리스트를 서비스에 전달한다.
가장 깔끔한 위치는 `new Application(...)` 직후다:

```ts
const app = new Application(AppModule);
const openapi = app.container.resolve(OpenAPIService.TOKEN) as OpenAPIService;
openapi.setRoutes(app.server.getRoutes());
// /openapi.json + /docs 마운트
OpenAPIModule.mount(app.server.app, openapi, config);
await app.listen(3000);
```

`http://localhost:3000/docs`에서 Scalar UI를 확인한다.

---

## 2. Controller 데코레이션

```ts
import { z } from 'zod';
import { Body, Controller, Delete, Get, Inject, Param, Post, Put, Query, Validate } from '@nexusts/core';
import { ApiTags, ApiOperation, ApiResponse, ApiBody, ApiParam, ApiQuery } from '@nexusts/openapi';

const CreateUserSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1),
  role: z.enum(['admin', 'user']).default('user'),
});

const UserSchema = z.object({
  id: z.number(),
  email: z.string().email(),
  name: z.string(),
  role: z.enum(['admin', 'user']),
  createdAt: z.string().datetime(),
});

@ApiTags('Users')
@Controller('/users')
class UserController {
  @Inject('UserService') declare users: any;

  @Get('/')
  @ApiOperation({ summary: '사용자 목록', operationId: 'listUsers' })
  @ApiQuery({ name: 'limit', description: '반환할 최대 행 수' })
  @ApiResponse(200, { description: 'OK', schema: z.array(UserSchema) })
  @ApiResponse(401, { description: '인증되지 않음' })
  list(ctx: Context) {
    const limit = Number(ctx.req.query('limit'));
    return this.users.findAll({ limit });
  }

  @Get('/:id')
  @ApiOperation({ summary: '사용자 조회' })
  @ApiParam({ name: 'id', description: '사용자 ID', schema: { type: 'integer' } })
  @ApiResponse(200, { description: 'OK', schema: UserSchema })
  @ApiResponse(404, { description: '찾을 수 없음' })
  findById(ctx: Context) {
    const id = Number(ctx.req.param('id'));
    return this.users.findById(id);
  }

  @Post('/')
  @ApiOperation({ summary: '사용자 생성' })
  @ApiBody({ description: '새 사용자 페이로드', schema: CreateUserSchema })
  @ApiResponse(201, { description: '생성됨', schema: UserSchema })
  @ApiResponse(400, { description: '검증 오류' })
  @Validate({ body: CreateUserSchema })
  async create(ctx: Context) {
    const input = CreateUserSchema.parse(await ctx.req.json());
    return this.users.create(input);
  }
}
```

---

## 3. Zod → JSON Schema 변환

`zodToJsonSchema()` 헬퍼는 실제 API에서 자주 보이는 Zod 패턴을 처리한다:

| Zod | JSON Schema |
| --- | --- |
| `z.string()` | `{ type: 'string' }` |
| `z.string().email()` | `{ type: 'string', format: 'email' }` |
| `z.string().uuid()` | `{ type: 'string', format: 'uuid' }` |
| `z.string().min(2).max(50)` | `{ type: 'string', minLength: 2, maxLength: 50 }` |
| `z.string().regex(/^[a-z]+$/)` | `{ type: 'string', pattern: '^[a-z]+$' }` |
| `z.number()` | `{ type: 'number' }` |
| `z.number().int().min(0)` | `{ type: 'integer', minimum: 0 }` |
| `z.boolean()` | `{ type: 'boolean' }` |
| `z.date()` | `{ type: 'string', format: 'date-time' }` |
| `z.literal('active')` | `{ type: 'string', enum: ['active'] }` |
| `z.enum(['a', 'b'])` | `{ type: 'string', enum: ['a', 'b'] }` |
| `z.object({ a: z.string() })` | `{ type: 'object', properties: { a: { type: 'string' } }, required: ['a'] }` |
| `z.array(z.string())` | `{ type: 'array', items: { type: 'string' } }` |
| `z.union([a, b])` | `{ oneOf: [...] }` |
| `z.string().nullable()` | `{ type: 'string', nullable: true }` |
| `z.record(z.string())` | `{ type: 'object', additionalProperties: { type: 'string' } }` |

exotic한 Zod 패턴(transforms, branded types, 재귀 스키마)의 경우,
decorator의 `schema:` 필드를 통해 명시적인 `JSONSchema`를 전달한다 —
이 컨버터는 편의 기능이지 완전한 codegen이 아니다.

---

## 4. OpenAPIService

서비스가 spec 빌더다. `setRoutes(...)`로 제공된 라우트 리스트를
워크하고 완전한 OpenAPI 3.1 문서를 생성한다.

```ts
class OpenAPIService {
  static readonly TOKEN: symbol;

  setRoutes(routes: RouteData[]): void;
  registerSchema(name: string, schema: JSONSchema): void;
  getSpec(): OpenAPIDocument;
}
```

명명된 component 스키마를 등록해 spec을 확장할 수도 있다
(`$ref`로 cross-referencing):

```ts
openapi.registerSchema('Error', {
  type: 'object',
  properties: { code: { type: 'string' }, message: { type: 'string' } },
  required: ['code', 'message'],
});

@ApiResponse(500, {
  description: '서버 오류',
  schema: { $ref: '#/components/schemas/Error' },
})
```

---

## 5. `@Validate`에서의 자동 도출

프레임워크의 `@Validate({ body, query, params, headers })` 데코레이터는
런타임에 Zod 스키마를 생성한다. `OpenAPIService`가 이를 읽어 자동으로
JSON Schema로 변환한다. `@ApiBody` / `@ApiQuery` / `@ApiParam`에서
반복할 필요 없다 — 이 데코레이터들은 자동 도출을 **override**하지
중복하지 않는다.

```ts
// 이 Zod 스키마에서 request body 스키마를 자동 도출:
@Validate({ body: CreateUserSchema })
@Post('/')
async create(ctx: Context) {
    const input = CreateUserSchema.parse(await ctx.req.json()); ... }

// 같은 operation이지만 커스텀 description:
@Validate({ body: CreateUserSchema })
@ApiBody({ description: '생성할 새 사용자' })
@Post('/')
async create(ctx: Context) {
    const input = CreateUserSchema.parse(await ctx.req.json()); ... }
```

Path parameter는 라우트 패턴에서 자동 도출된다
(`/users/:id` → `id`는 required `string` parameter). 커스텀 description이나
타입이 필요하면 `@ApiParam`으로 override한다.

---

## 6. Scalar UI

`@nexusts/openapi`는 `https://cdn.jsdelivr.net/npm/@scalar/api-reference@1.25.0`에서
JS 클라이언트를 로드하는 Scalar HTML 페이지를 제공한다. 에셋이 번들되지
않는다. 기본 테마는 Scalar의 default다; `src/openapi/scalar.ts`를 수정해
테마를 변경할 수 있다.

에어갭 배포처럼 fully self-hosted가 필요한 경우, Scalar 에셋을
`public/scalar/`에 두고 `scalar.ts`의 script 태그를 CDN URL 대신
`/scalar/standalone.js`로 가리키게 한다.

---

## 7. Tier 비교

| 프레임워크 | OpenAPI | v0.4 |
| --- | --- | --- |
| NestJS | `@nestjs/swagger` (Zod 지원은 `@anatine/zod-nestjs` 통해) | ✅ 해소 — `@nexusts/openapi` |
| AdonisJS | 커뮤니티 패키지 (`adonis-autodoc`) | ✅ 해소 — `@nexusts/openapi` |

v0.3 격차 분석(NestJS §3.1, AdonisJS §5.1)에 따르면, 이것이 가장
가성비 높은 잔여 Tier 1 기능이었다. 이제 출시되었다.

---

## 8. 참고

- [Architecture decision: `docs/design/architecture.md`](../design/architecture.md)
- [Tier 1 / Tier 2 / Tier 3 격차 (NestJS)](../analysis/nestjs-comparison.md)
- [Tier 1 / Tier 2 / Tier 3 격차 (AdonisJS)](../analysis/adonisjs-comparison.md)
- [`@nestjs/swagger` 문서](https://docs.nestjs.com/openapi/introduction) — 비교 기준
- [Scalar 문서](https://github.com/scalar/scalar) — UI 라이브러리
- [OpenAPI 3.1 명세](https://spec.openapis.org/oas/v3.1.0)
