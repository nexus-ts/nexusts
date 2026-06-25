# OpenAPI Module — design

> 한국어 버전: [`openapi.ko.md`](./openapi.ko.md)

This document explains the architecture of `@nexusts/openapi`:
Zod-to-JSON-Schema transformation, decorator-based operation metadata,
Scalar UI integration, and the auto-generation pipeline.

## Goals

1. **Auto-generated OpenAPI 3.1 spec** from controllers + Zod schemas.
   No hand-written `openapi.json`.
2. **Zod as the source of truth.** The same Zod schemas used for
   request validation (`@Validate`) are reused for API documentation.
3. **Decorator-based operation metadata.** `@ApiOperation`,
   `@ApiResponse`, `@ApiParam`, `@ApiTags` — NestJS/Swagger-style.
4. **Built-in Scalar UI.** `/openapi` serves the JSON spec;
   `/openapi/ui` serves a beautiful interactive documentation UI
   powered by Scalar.
5. **Non-invasive.** Controllers without OpenAPI decorators still work;
   they just won't appear in the spec.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Controller                                │
│                                                             │
│  @Get('/users/:id')                                         │
│  @ApiOperation({ summary: 'Get user by ID' })               │
│  @ApiParam({ name: 'id', schema: z.string() })              │
│  @ApiResponse({ status: 200, schema: UserSchema })          │
│  @ApiTags('Users')                                          │
│  findById(ctx: Context) { const id = ctx.req.param('id'); ... }                  │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│         OpenAPIService                                       │
│                                                             │
│  1. Scan all registered controllers                         │
│  2. Read route metadata from the Hono router                │
│  3. Read decorator metadata per route                       │
│  4. Convert Zod schemas → JSON Schema (draft 2020-12)      │
│  5. Assemble OpenAPI 3.1 document                           │
│  6. Serve at GET /openapi (JSON)                            │
│  7. Serve Scalar UI at GET /openapi/ui (HTML)               │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│             Output                                          │
│                                                             │
│  GET /openapi         → application/vnd.oai.openapi+json    │
│  GET /openapi/ui      → text/html  (Scalar UI)              │
│  nx openapi:generate  → writes openapi.json to disk         │
└─────────────────────────────────────────────────────────────┘
```

## Zod to JSON Schema

The `zodToJsonSchema()` function converts Zod types to JSON Schema
(draft 2020-12, OpenAPI 3.1 compatible):

| Zod type | JSON Schema |
|----------|-------------|
| `z.string()` | `{ type: "string" }` |
| `z.number()` | `{ type: "number" }` |
| `z.boolean()` | `{ type: "boolean" }` |
| `z.object({...})` | `{ type: "object", properties: {...}, required: [...] }` |
| `z.array(z.string())` | `{ type: "array", items: { type: "string" } }` |
| `z.enum(["a", "b"])` | `{ type: "string", enum: ["a", "b"] }` |
| `z.optional(z.string())` | Not in `required` array |
| `z.nullable(z.string())` | `{ type: "string", nullable: true }` |
| `z.union([...])` | `{ anyOf: [...] }` |
| `z.intersection(...)` | `{ allOf: [...] }` |
| `z.string().email()` | adds `format: "email"` |
| `z.string().min(3)` | adds `minLength: 3` |
| `z.number().int()` | adds `type: "integer"` |
| `z.string().describe("...")` | adds `description` |
| Custom refinements | ignored (schema-level only) |

The converter handles recursive schemas via a `$defs` registry and
detects circular references with a visited-set.

## Decorator API

### Route-level

| Decorator | Attaches to | Stores |
|-----------|-------------|--------|
| `@ApiTags(...)` | Controller class | Tag names |
| `@ApiOperation({summary, description, deprecated, operationId})` | Method | Operation metadata |
| `@ApiParam({name, schema, description, required})` | Method parameter | Path parameters |
| `@ApiQuery({name, schema, description, required})` | Method | Query parameters |
| `@ApiBody({schema, description, required})` | Method | Request body |
| `@ApiResponse({status, schema, description})` | Method | Response schemas |
| `@ApiSecurity({name, scopes?})` | Method/class | Security requirements |
| `@ApiSchema({name, ...})` | Class | Schema definition (reusable) |
| `@ApiExclude()` | Method/controller | Exclude from spec |

### Schema-level

`@ApiProperty({description, example, deprecated})` on model classes
adds per-field metadata. Used when Zod schemas need extra
documentation hints.

### Grouping via `@ApiTags`

```ts
@Controller('/users')
@ApiTags('Users')
class UserController { ... }
```

Tags group endpoints in the Scalar UI sidebar. A controller can have
multiple tags (union).

## Scalar UI

The UI is rendered via `scalarHtml()`, which returns an inline HTML
page that loads Scalar's CDN-hosted JavaScript. The page:

1. Fetches the OpenAPI spec from `/openapi` (relative URL).
2. Renders the interactive documentation with dark mode, code samples,
   and Try-it-out.

```ts
// Customize
scalarHtml({
  title: 'My API',
  theme: 'purple',     // 'default' | 'purple' | 'moon' | 'solarized'
  layout: 'modern',     // 'modern' | 'classic'
})
```

## CLI integration

```sh
nx openapi:generate       # → openapi.json
nx openapi:generate --output ./docs/openapi.json
```

The CLI command calls `OpenAPIService.generate()` to build the spec
and writes it to disk. Useful for CI checks and publishing API docs.

## Generated spec format

```yaml
openapi: "3.1.0"
info:
  title: "NexusTS API"
  version: "1.0.0"
paths:
  /users/{id}:
    get:
      tags: ["Users"]
      summary: "Get user by ID"
      parameters:
        - name: id
          in: path
          required: true
          schema: { type: "string" }
      responses:
        200:
          description: "OK"
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/User"
components:
  schemas:
    User:
      type: object
      properties:
        id: { type: "integer" }
        name: { type: "string" }
```

## Future work

- **WebSocket endpoints** — document WS message schemas via decorators.
- **Authentication flows** — OAuth2 / OpenID Connect security scheme
  generation.
- **OpenAPI diff** — CLI command to compare spec versions (breaking
  change detection).
- **Request examples** — auto-generate from Zod schema defaults.
- **OpenAPI 3.0 compatibility** — optional downgrade mode for tools
  that don't support 3.1.

## See also

- [`../user-guide/openapi.md`](../user-guide/openapi.md) — user guide
- [`../user-guide/validation.md`](../user-guide/validation.md) — Zod validation (Zod schemas are the source of truth)
