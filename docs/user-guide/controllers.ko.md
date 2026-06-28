# 컨트롤러 & 데코레이터

> English version: [`controllers.md`](./controllers.md)

컨트롤러는 HTTP 요청의 진입점입니다. URL을 메서드에 매핑하고, 입력을 검증하며, 응답(JSON, 뷰, 또는 Inertia 페이지)을 반환합니다.

## 0. 표준 데코레이터 모드 (v0.9+)

NexusTS v0.9는 **TC39 표준 ES 데코레이터**를 기본으로 사용합니다.
컨트롤러 메서드는 Hono `Context`를 직접 받고, `ctx.req.*` 메서드로
요청 데이터에 접근합니다 (`@Body`/`@Param` 파라미터 데코레이터 대신).

### 표준 컨트롤러 패턴

```ts
import { Controller, Get, Post, Inject } from '@nexusts/core';
import { UserService } from '../services/user.service.js';
import type { Context } from 'hono';
import { z } from 'zod';

const CreateUserSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
});

@Controller('/users')
export class UserController {
  @Inject(UserService) declare users: UserService;

  @Get('/')
  async index(ctx: Context) {
    const q = ctx.req.query('q');
    const limit = Number(ctx.req.query('limit') ?? '10');
    return this.users.findAll({ q, limit });
  }

  @Get('/:id')
  async show(ctx: Context) {
    const id = Number(ctx.req.param('id'));
    return this.users.findById(id);
  }

  @Post('/')
  async create(ctx: Context) {
    const body = CreateUserSchema.parse(await ctx.req.json());
    return this.users.create(body);
  }
}
```

### 주요 차이점

| 항목 | 레거시 (v0.8) | 표준 (v0.9+) |
|--------|--------------|------------------|
| 인젝션 | `constructor(@Inject(Svc) private svc: Svc)` | `@Inject(Svc) declare svc: Svc` |
| 경로 파라미터 | `@Param('id') id: string` | `ctx.req.param('id')` |
| 쿼리 파라미터 | `@Query('q') q: string` | `ctx.req.query('q')` |
| 요청 본문 | `@Body() body: DTO` | `await ctx.req.json()` |
| Hono context | `@Ctx() c: Context` | `ctx: Context` (첫 번째 인자) |

> **하위 호환**: 레거시 파라미터 데코레이터(`@Body`, `@Param`, `@Query`, `@Ctx`)는
> `experimentalDecorators: true` 설정 시 계속 동작합니다. 라우터가
> `paramMeta.length`를 확인하여 모드를 자동 감지합니다.

---

NexusTS는 **세 가지** 스타일을 나란히 지원합니다 — 각 라우트에 맞는 것을 선택하세요.

> **⚠ Bun 주의 — 파일당 하나의 `@Controller`**: 한 `.ts` 파일에 여러
> `@Controller` 클래스를 정의하면 Bun이 decorator 실행 순서를 잘못
> 처리하여 일부 라우트가 등록되지 않을 수 있습니다. 각 컨트롤러를
> 별도 파일로 분리하세요. 자세한 내용:

### 1.1 Nest 스타일 (클래스 데코레이터)

```ts
import { z } from 'zod';
import { Body, Controller, Delete, Get, Inject, Param, Post, Put, Query, Validate } from '@nexusts/core';
import { UserService } from '../services/user.service.js';

const CreateUserSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
});

@Controller('/users')
export class UserController {
  @Inject(UserService) declare private readonly users: UserService;

  @Get('/')
  @Validate({
    query: z.object({ q: z.string().optional(), limit: z.coerce.number().int().max(100).optional() }),
  })
  async index(@Query() query: { q?: string; limit?: number }) {
    return this.users.findAll(query);
  }

  @Get('/:id')
  show(@Param('id') id: string) {
    return this.users.findOne(Number(id));
  }

  @Post('/')
  @Validate({ body: CreateUserSchema })
  async create(@Body() body: z.infer<typeof CreateUserSchema>) {
    return { status: 201, body: this.users.create(body) };
  }

  @Put('/:id')
  @Validate({ body: CreateUserSchema.partial() })
  async update(@Param('id') id: string, @Body() body: Partial<z.infer<typeof CreateUserSchema>>) {
    return this.users.update(Number(id), body);
  }

  @Delete('/:id')
  async destroy(@Param('id') id: string) {
    return this.users.delete(Number(id));
  }
}
```

> **ℹ 표준 데코레이터 모드 (v0.9+)**
>
> 생성자 인젝션 대신 필드 인젝션(`@Inject(Svc) declare svc: Svc`)을
> 사용하세요. 표준 ES 데코레이터 모드에서 안정적으로 동작합니다.

### 1.2 Adonis 스타일

```ts
import { app } from '../main.js';
import { UserController } from '../controllers/user.controller.js';

app.server.router.add('GET',    '/users',      UserController, 'index');
app.server.router.add('POST',   '/users',      UserController, 'create');
app.server.router.add('GET',    '/users/:id',  UserController, 'show');
app.server.router.add('PUT',    '/users/:id',  UserController, 'update');
app.server.router.add('DELETE', '/users/:id',  UserController, 'destroy');
```

### 1.3 Functional 스타일 (Hono 네이티브)

```ts
import { app } from '../main.js';

app.server.router.raw('GET', '/health', (c) => c.json({ ok: true }));

app.server.router.raw('POST', '/webhooks/stripe', async (c) => {
  const event = await c.req.json();
  // ...
  return c.json({ received: true });
});
```

Functional 스타일은 **이스케이프 해치**입니다 — Hono가 할 수 있는 모든 것을 여기서 할 수 있습니다. 웹훅, SSE, 또는 컨트롤러 형태에 맞지 않는 모든 것에 사용하세요.

---

## 2. 클래스 데코레이터

| 데코레이터 | 대상 | 효과 |
| --------- | ------ | ------ |
| `@Module({...})` | class | 모듈 루트를 표시하고 `imports`, `controllers`, `providers`, `exports`를 선언 |
| `@Controller(prefix)` | class | 컨트롤러를 표시하고 라우트 prefix를 설정 |
| `@Injectable()` | class | 서비스 / 리포지토리 / 프로바이더를 DI 관리 대상으로 표시 |
| `@Repository()` | class | `@Injectable()`과 동일, 리포지토리에 적합한 이름 |

```ts
import { Module } from '@nexusts/core';
import { UserController } from './controllers/user.controller.js';
import { UserService } from './services/user.service.js';
import { UserRepository } from './repositories/user.repository.js';

@Module({
  imports: [],                         // 다른 모듈
  controllers: [UserController],
  providers: [UserService, UserRepository],
  exports: [UserService],              // import하는 모듈과 공유할 토큰
})
export class UserModule {}
```

---

## 3. 메서드 데코레이터

| 데코레이터 | 효과 |
| --------- | ------ |
| `@Get(path?)` | `GET`을 이 메서드에 매핑 |
| `@Post(path?)` | `POST`을 이 메서드에 매핑 |
| `@Put(path?)` | `PUT`을 이 메서드에 매핑 |
| `@Delete(path?)` | `DELETE`을 이 메서드에 매핑 |
| `@Patch(path?)` | `PATCH`을 이 메서드에 매핑 |
| `@Options(path?)` | `OPTIONS`을 이 메서드에 매핑 |
| `@Head(path?)` | `HEAD`을 이 메서드에 매핑 |

`path` 인자는 컨트롤러 prefix에 **추가**됩니다.

```ts
@Controller('/users')       // prefix: /users
class UserController {
  @Get('/')                  // → GET /users
  list() {}

  @Get('/:id')               // → GET /users/:id
  show(@Param('id') id: string) {}
}
```

`path`가 생략되면 기본값은 `/`입니다.

---

## 4. 파라미터 데코레이터

| 데코레이터 | 읽기 |
| --------- | ----- |
| `@Body(key?)` | 파싱된 요청 본문 (JSON / form / multipart) |
| `@Query(key?)` | URL 쿼리 스트링 |
| `@Param(key?)` | 경로 파라미터 |
| `@Headers(key?)` | 요청 헤더 |
| `@Req()` / `@Ctx()` | Hono 컨텍스트 |
| `@Res()` | Hono 응답 헬퍼 |
| `@Next()` | 미들웨어 스타일 핸들러를 위한 `next()` 콜백 |
| `@User()` | 인증된 사용자 (auth 미들웨어가 설정) |

키 인자가 없는 파라미터(`@Body()`, `@Query()`)는 **전체** 파싱된 객체가 주입됩니다. 키가 있으면(`@Param('id')`) 해당 프로퍼티만 주입됩니다.

```ts
@Get('/:id')
show(
  @Param('id') id: string,       // 단일 경로 파라미터
  @Query('verbose') verbose: boolean | undefined,  // 단일 쿼리 값
) {
  // ...
}
```

---

## 5. 응답 반환

컨트롤러 메서드는 다음을 반환할 수 있습니다.

| 반환 타입 | 동작 |
| ----------- | --------- |
| 일반 객체 | `Content-Type: application/json`으로 JSON 직렬화 |
| 배열 | JSON 배열로 직렬화 |
| `string` | `text/plain`으로 전송 |
| `Response` (Hono/표준) | 그대로 전송 |
| `InertiaResponse` | Inertia 파이프라인으로 라우팅 |
| `Promise<...>` | await 후 직렬화 |
| `void` / `undefined` | `204 No Content` |
| `{ status, body }` | 명시적 status + body |

```ts
@Get('/plain')
plain() {
  return { hello: 'world' };
}

@Get('/with-status')
withStatus() {
  return { status: 201, body: { created: true } };
}

@Get('/empty')
empty() {
  // 204
}

@Get('/inertia')
inertia(@Inject(Inertia.TOKEN) inertia: Inertia) {
  return inertia.render('Dashboard', { ... });
}
```

---

## 6. 검증

검증은 `@Validate({...})` 데코레이터를 통해 옵트인입니다. 핸들러가 호출되기 **전에** 실행됩니다. 자세한 가이드는 **[validation.md](./validation.md)**를 참조하세요.

```ts
@Post('/')
@Validate({
  body: z.object({ name: z.string(), email: z.string().email() }),
  query: z.object({ dryRun: z.coerce.boolean().optional() }),
  params: z.object({ id: z.coerce.number() }),
})
async create(@Body() body, @Query() query, @Param() params) { ... }
```

검증 실패 시 세부 정보와 함께 **400**을 반환합니다.

```json
{
  "error": "Validation failed",
  "issues": [
    { "code": "invalid_string", "validation": "email", "path": ["email"], "message": "Invalid email" }
  ]
}
```

---

## 7. 뷰 반환

템플릿을 렌더링하려면 뷰 디스크립터를 반환하거나 `Application.render` 헬퍼를 사용하세요. 자세한 가이드는 **[view-engines.md](./view-engines.md)**를 참조하세요.

```ts
@Get('/about')
async about() {
  return {
    view: 'pages/about.edge',
    data: { team: 'Nexus' },
  };
}
```

또는 헬퍼를 직접 사용:

```ts
@Get('/about')
async about() {
  const html = await app.render('pages/about.edge', { team: 'Nexus' });
  return new Response(html, { headers: { 'Content-Type': 'text/html' } });
}
```

---

## 8. 에러 처리

표준 에러를 던지면 프레임워크가 JSON 응답으로 변환합니다.

```ts
@Get('/:id')
show(@Param('id') id: string) {
  const user = this.users.findOne(Number(id));
  if (!user) {
    throw new HttpError(404, 'User not found');
  }
  return user;
}
```

`HttpError`(및 모든 서브클래스)는 `{ status, message }`로 렌더링됩니다. 향후 릴리스에서는 세밀한 제어를 위해 NestJS 스타일의 exception filter(`@Catch(HttpError)`)가 추가될 예정입니다.

---

## 9. 비동기 핸들러

핸들러는 `async`일 수 있습니다. 라우터는 직렬화 전에 반환 값을 await합니다.

```ts
@Get('/slow')
async slow() {
  const data = await this.api.fetchSomething();
  return data;
}
```

비동기 핸들러는 **요청당** 실행됩니다 — 싱글톤 서비스에 두지 않는 한 요청 간 공유 상태는 없습니다.

---

## 10. 라우팅 팁

- **순서는 동률에만 영향을 줍니다.** 리터럴 세그먼트가 파라미터보다, 파라미터가 와일드카드보다 우선합니다.
- **`{id}`가 아닌 `:id`를 사용하세요.** 라우터는 Hono / Express 스타일의 콜론 파라미터를 기대합니다.
- **후행 슬래시는 정규화됩니다.** `/users`와 `/users/`는 같은 라우트로 해석됩니다.
- **CORS 사전 요청** — `OPTIONS`는 CORS 미들웨어가 설치된 경우 Hono에 의해 자동으로 처리됩니다.
  `app.server.app.use('*', cors())`로 추가하세요.

---

## 11. 종합

DI, 검증, 에러 처리를 갖춘 완전한 컨트롤러:

```ts
import { z } from 'zod';
import { Body, Controller, Get, Inject, Param, Post, Validate } from '@nexusts/core';
import { UserService } from '../services/user.service.js';

const CreateUserSchema = z.object({
  name: z.string().min(2).max(50),
  email: z.string().email(),
  age: z.number().int().min(0).max(150).optional(),
});

@Controller('/users')
export class UserController {
  @Inject(UserService) declare private readonly users: UserService;

  @Get('/')
  list() {
    return this.users.findAll();
  }

  @Get('/:id')
  show(@Param('id') id: string) {
    const u = this.users.findOne(Number(id));
    if (!u) throw new Error(`User ${id} not found`);
    return u;
  }

  @Post('/')
  @Validate({ body: CreateUserSchema })
  create(@Body() body: z.infer<typeof CreateUserSchema>) {
    return { status: 201, body: this.users.create(body) };
  }
}
```

```ts
// user.module.ts
import { Module } from '@nexusts/core';
import { UserController } from '../controllers/user.controller.js';
import { UserService } from '../services/user.service.js';

@Module({
  controllers: [UserController],
  providers: [UserService],
  exports: [UserService],
})
export class UserModule {}
```
