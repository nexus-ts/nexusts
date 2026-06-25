# @nexusts/openapi — OpenAPI 3.1 + Scalar UI

> 한국어 버전: [`openapi.ko.md`](./openapi.ko.md)
> Added in **v0.4** (Tier 1 gap from NestJS / AdonisJS analyses).

`@nexusts/openapi` is the **default OpenAPI generator** for NexusTS. It
walks the framework's route table, reads `@ApiTags` /
`@ApiOperation` / `@ApiResponse` / `@ApiBody` / `@ApiParam` /
`@ApiQuery` / `@Validate` metadata, and produces a complete
**OpenAPI 3.1** document. The bundled Scalar UI serves it at
`/docs` — no asset bundling, no build step.

```
GET /openapi.json   →  the JSON spec
GET /docs           →  Scalar UI (CDN-loaded)
```

---

## 1. Quick start

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

After the framework router is built, hand the route list to the
service so it can emit the spec. The cleanest place is right after
`new Application(...)`:

```ts
const app = new Application(AppModule);
const openapi = app.container.resolve(OpenAPIService.TOKEN) as OpenAPIService;
openapi.setRoutes(app.server.getRoutes());
// Mount /openapi.json + /docs on the Hono app.
OpenAPIModule.mount(app.server.app, openapi, config);
await app.listen(3000);
```

Visit `http://localhost:3000/docs` for the Scalar UI.

---

## 2. Decorating a controller

```ts
import { z } from 'zod';
import { Controller, Get, Post, Inject } from '@nexusts/core';
import { ApiTags, ApiOperation, ApiResponse, ApiBody, ApiParam, ApiQuery } from '@nexusts/openapi';
import type { Context } from 'hono';

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
  @ApiOperation({ summary: 'List users', operationId: 'listUsers' })
  @ApiQuery({ name: 'limit', description: 'Max rows to return' })
  @ApiResponse(200, { description: 'OK', schema: z.array(UserSchema) })
  @ApiResponse(401, { description: 'Unauthenticated' })
  list(ctx: Context) {
    const limit = Number(ctx.req.query('limit'));
    return this.users.findAll({ limit });
  }

  @Get('/:id')
  @ApiOperation({ summary: 'Find a user' })
  @ApiParam({ name: 'id', description: 'User id', schema: { type: 'integer' } })
  @ApiResponse(200, { description: 'OK', schema: UserSchema })
  @ApiResponse(404, { description: 'Not found' })
  findById(ctx: Context) {
    const id = Number(ctx.req.param('id'));
    return this.users.findById(id);
  }

  @Post('/')
  @ApiOperation({ summary: 'Create a user' })
  @ApiBody({ description: 'New user payload', schema: CreateUserSchema })
  @ApiResponse(201, { description: 'Created', schema: UserSchema })
  @ApiResponse(400, { description: 'Validation error' })
  async create(ctx: Context) {
    const input = CreateUserSchema.parse(await ctx.req.json());
    return this.users.create(input);
  }
}
```

---

## 3. Zod → JSON Schema conversion

The `zodToJsonSchema()` helper handles the Zod patterns that show up
in real APIs:

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

For exotic Zod patterns (transforms, branded types, recursive
schemas), pass an explicit `JSONSchema` via the `schema:` field on
the decorator — the converter is a convenience, not a complete
codegen.

---

## 4. The OpenAPIService

The service is the spec builder. It walks the route list provided
by `setRoutes(...)` and produces a full OpenAPI 3.1 document.

```ts
class OpenAPIService {
  static readonly TOKEN: symbol;

  setRoutes(routes: RouteData[]): void;
  registerSchema(name: string, schema: JSONSchema): void;
  getSpec(): OpenAPIDocument;
}
```

You can also extend the spec by registering named component
schemas (for cross-referencing with `$ref`):

```ts
openapi.registerSchema('Error', {
  type: 'object',
  properties: { code: { type: 'string' }, message: { type: 'string' } },
  required: ['code', 'message'],
});

@ApiResponse(500, {
  description: 'Server error',
  schema: { $ref: '#/components/schemas/Error' },
})
```

---

## 5. Auto-derivation from `@Validate`

The framework's `@Validate({ body, query, params, headers })`
decorator already produces Zod schemas at runtime. The
`OpenAPIService` reads them and converts to JSON Schema
automatically. You don't have to repeat yourself in `@ApiBody` /
`@ApiQuery` / `@ApiParam` — those decorators **override** the
auto-derivation, not duplicate it.

```ts
// Auto-derives the request body schema from this Zod schema:
@Validate({ body: CreateUserSchema })
@Post('/')
create(@Body() input: z.infer<typeof CreateUserSchema>) { ... }

// Same operation, but with a custom description:
@Validate({ body: CreateUserSchema })
@ApiBody({ description: 'The new user to create' })
@Post('/')
create(@Body() input: z.infer<typeof CreateUserSchema>) { ... }
```

Path parameters are auto-derived from the route pattern
(`/users/:id` → `id` is a required `string` parameter). Override
with `@ApiParam` for a custom description or type.

---

## 6. Scalar UI

`@nexusts/openapi` ships a Scalar HTML page that loads the JS
client from `https://cdn.jsdelivr.net/npm/@scalar/api-reference@1.25.0`.
No assets are bundled. The default theme is Scalar's default; you
can switch themes by editing `src/openapi/scalar.ts`.

For a fully self-hosted deployment (e.g. air-gapped), drop the
Scalar assets into `public/scalar/` and edit the script tag in
`scalar.ts` to point at `/scalar/standalone.js` instead of the
CDN URL.

---

## 7. Tier comparison

| Framework | OpenAPI story | v0.4 |
| --- | --- | --- |
| NestJS | `@nestjs/swagger` (Zod support via `@anatine/zod-nestjs`) | ✅ closed — `@nexusts/openapi` |
| AdonisJS | Community packages (`adonis-autodoc`) | ✅ closed — `@nexusts/openapi` |

Per the v0.3 gap analyses (NestJS §3.1, AdonisJS §5.1), this was
the **highest-leverage Tier 1 feature** remaining. It now ships.

---

## 8. See also

- [Architecture decision: `docs/design/architecture.md`](../design/architecture.md)
- [Tier 1 / Tier 2 / Tier 3 gaps (NestJS)](../analysis/nestjs-comparison.md)
- [Tier 1 / Tier 2 / Tier 3 gaps (AdonisJS)](../analysis/adonisjs-comparison.md)
- [`@nestjs/swagger` docs](https://docs.nestjs.com/openapi/introduction) — the comparison baseline
- [Scalar documentation](https://github.com/scalar/scalar) — the UI library
- [OpenAPI 3.1 specification](https://spec.openapis.org/oas/v3.1.0)
