# Migration from AdonisJS to NexusTS

> 한국어 버전: [`adonisjs-comparison.ko.md`](./adonisjs-comparison.ko.md)

This guide helps AdonisJS developers migrate to NexusTS. It maps concepts,
compares APIs, shows side-by-side code examples, and highlights key differences.

---

## Why Migrate

| Reason | Detail |
|--------|--------|
| **Bun-native** | Native TypeScript execution, no `tsc`/`ts-node`. Hot reload, fast startup. |
| **Standard decorators** | TC39 standard ES decorators — no `experimentalDecorators` required. |
| **32 independent modules** | Install only what you import. Tree-shakeable, no dead code. |
| **Built-in ecosystem** | GraphQL, gRPC, WebSocket, SSE, resilience, cache, queue — all first-party. |
| **Hono performance** | Hono-based HTTP layer — edge-performance, Cloudflare Workers support. |

---

## Concept Mapping

| AdonisJS | NexusTS | Notes |
|----------|---------|-------|
| `Route.group()` | `@Module({ controllers: [...] })` | Module-based routing, not route files |
| `Route.resource()` | `@Controller()` + `@Get`/`@Post`/etc. | Decorator-based route definition |
| `HttpContext` | `ctx: Context` (Hono) | Controller method receives Hono Context |
| Lucid ORM | `@nexusts/drizzle` | Drizzle ORM with `DrizzleRepository` |
| VineJS validation | Zod | Zod schemas directly, `schema.parse()` |
| Ace commands | `nx` CLI | ACE-style command runner |
| `@adonisjs/session` | `@nexusts/session` | Cookie/memory/Drizzle backends |
| `@adonisjs/shield` | `@nexusts/shield` | CSRF + security headers |
| `@adonisjs/auth` | `@nexusts/auth` | better-auth based |
| `@adonisjs/logger` | `@nexusts/logger` | Pino-based structured logging |
| `@adonisjs/cache` | `@nexusts/cache` | Memory/Drizzle/Redis backends |
| `@adonisjs/drive` | `@nexusts/drive` | Local/S3/R2/memory storage |
| `@adonisjs/mail` | `@nexusts/mail` | SMTP/File/Null transports |
| `@adonisjs/queue` | `@nexusts/queue` | BullMQ/Cloudflare/memory |
| `@adonisjs/scheduler` | `@nexusts/schedule` | In-tree cron parser |
| Edge templates | Rendu / Edge / Eta | Three view engines, auto-detected by extension |
| Inertia.js | Inertia.js v3 adapter | First-party Inertia support (React/Vue SSR) |

---

## Side-by-Side: AdonisJS → NexusTS

### Controller

**AdonisJS:**

```ts
import { HttpContext } from '@adonisjs/core/http';

export default class UsersController {
  async index({ request }: HttpContext) {
    const page = request.input('page', 1);
    return User.all();
  }

  async show({ params }: HttpContext) {
    return User.find(params.id);
  }

  async store({ request }: HttpContext) {
    const data = request.only(['name', 'email']);
    return User.create(data);
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
    const page = Number(ctx.req.query('page') ?? '1');
    return this.userService.findAll(page);
  }

  @Get('/:id')
  async show(ctx: Context) {
    const id = Number(ctx.req.param('id'));
    return this.userService.findById(id);
  }

  @Post('/')
  async store(ctx: Context) {
    const data = await ctx.req.json() as { name: string; email: string };
    return this.userService.create(data);
  }
}
```

### Model / Repository

**AdonisJS (Lucid):**

```ts
import { DateTime } from 'luxon';
import { BaseModel, column } from '@adonisjs/lucid/orm';

export default class User extends BaseModel {
  @column({ isPrimary: true })
  declare id: number;

  @column()
  declare email: string;

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime;
}
```

**NexusTS (Drizzle):**

```ts
import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';

export const users = sqliteTable('users', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  email: text('email').notNull().unique(),
  createdAt: text('created_at').default('CURRENT_TIMESTAMP'),
});

@Injectable()
export class UserRepository extends DrizzleRepository<typeof users> {
  @Inject(DrizzleService.TOKEN) declare db: DrizzleService;
  protected readonly table = users;
}
```

### Service

**AdonisJS:**

```ts
export class UserService {
  async findAll(page: number) {
    return User.query().paginate(page, 20);
  }
}
```

**NexusTS:**

```ts
@Injectable()
export class UserService {
  @Inject(UserRepository) declare userRepo: UserRepository;

  async findAll(page: number) {
    return this.userRepo.findAll({ limit: 20, offset: (page - 1) * 20 });
  }
}
```

### Routing

**AdonisJS:**

```ts
import router from '@adonisjs/core/services/router';

router.group(() => {
  router.resource('users', () => import('#controllers/users_controller'));
}).prefix('/api');
```

**NexusTS:**

```ts
// Nest style (decorator-based)
@Controller('/api/users')
export class UserController { ... }

// Or Adonis style (route table)
app.server.router.add('GET', '/api/users', UserController, 'index');

// Or functional style (Hono-native)
app.server.router.raw('GET', '/api/users', (c) => c.json([]));
```

### Module Setup

**AdonisJS:**

```ts
// start/routes.ts — route definition files
// config/app.ts — configuration
// providers/ — service providers
```

**NexusTS:**

```ts
@Module({
  imports: [DrizzleModule.forRoot({ dialect: 'bun-sqlite', connection: { filename: 'app.db' } })],
  controllers: [UserController],
  providers: [UserService, UserRepository],
  exports: [UserService],
})
export class UserModule {}
```

---

## What is Different

### Standard ES Decorators (No experimentalDecorators)

NexusTS v0.9+ uses **TC39 standard ES decorators**. AdonisJS also uses legacy decorators (`experimentalDecorators: true`). Both frameworks require explicit `@Inject` tokens, but NexusTS adds field injection support:

```ts
// AdonisJS — constructor injection
constructor(@inject() private userService: UserService) {}

// NexusTS — field injection
@Inject(UserService) declare userService: UserService;
```

### Module-Based Organization Instead of Route Files

AdonisJS organizes routes in `start/routes.ts` with `Route.group()` and `Route.resource()`. NexusTS uses **decorator-based routing** inside `@Controller()` classes, similar to NestJS. This keeps routes co-located with their handler logic.

NexusTS also supports **Adonis-style route tables** (`router.add()`) and **functional Hono-style routes** (`router.raw()`) — you can mix all three in the same app.

### View Engines

AdonisJS uses Edge templates. NexusTS supports three engines:

| Engine | Extension | Description |
|--------|-----------|-------------|
| **Rendu** (default) | `.html`, `.rendu` | PHP-style `<?= expr ?>` — works everywhere |
| **Edge** | `.edge` | Adonis-style `{{ expr }}` — familiar for Adonis migrants |
| **Eta** | `.eta` | EJS-style `<%= expr %>` |

Auto-detected by file extension — just return `{ view: 'users.html', data }` from your controller.

### Entity Differences

| Feature | AdonisJS | NexusTS |
|---------|----------|---------|
| ORM | Lucid (Active Record) | Drizzle (Data Mapper) |
| Migrations | `node ace migration:run` | `nx db:migrate` |
| Validation | VineJS (Zod-inspired) | Zod directly |
| CLI | `node ace` | `nx` |
| Decorators | Legacy (`experimentalDecorators`) | Standard (TC39) + legacy fallback |
| Session | Cookie-based | Cookie/memory/Drizzle backends |
| Inertia | `@adonisjs/inertia` | Built-in `@nexusts/view` + `Inertia` |

---

## What AdonisJS Has That NexusTS Does Not

| Feature | Status | Alternative |
|---------|--------|-------------|
| Inspector / Debug toolbar | ❌ Planned | Use Bun's built-in debugger |
| Admin panel | ❌ Not planned | Nuxt / Next.js admin |
| Static site generation | ❌ Not planned | Separate SSG tool |

---

## Quick Migration Checklist

1. **Install Bun** ≥ 1.3 — `curl -fsSL https://bun.sh/install | bash`
2. **Create** `@Module({})` class to replace route files
3. **Replace** `Route.resource()` with `@Controller()` + `@Get`/`@Post` decorators
4. **Replace** Lucid models with Drizzle table definitions
5. **Replace** VineJS with Zod schemas
6. **Replace** `@inject()` with `@Inject(Token) declare field: Type` or `new Service()`
7. **Replace** Edge templates with Rendu/Edge/Eta views
8. **Replace** `@adonisjs/*` packages with `@nexusts/*` equivalents
9. **Run** `bun run typecheck` and `bun run test`

---

## See Also

- [Controllers & decorators](../user-guide/controllers.md)
- [Dependency injection](../user-guide/dependency-injection.md)
- [Drizzle ORM guide](../user-guide/drizzle.md)
- [View engines](../user-guide/view-engines.md)
- [Standard decorator migration](../design/standard-decorators-migration.md)
