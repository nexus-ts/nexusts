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
  imports: [DrizzleModule.forRoot({ dialect: 'sqlite', connection: { filename: 'app.db' } })],
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

### Built-in Modules, Not Community Packages

AdonisJS is known for its "batteries included" philosophy. NexusTS matches or exceeds every battery with first-party modules:

| What you need | AdonisJS | NexusTS |
|---------------|----------|---------|
| HTTP server | `@adonisjs/core` (HTTP + router) | **Hono** (built-in, Bun + Cloudflare Workers) |
| ORM | Lucid (`@adonisjs/lucid`) | `@nexusts/drizzle` (5 dialects) |
| Validation | VineJS | Zod (directly, no wrapper) |
| Auth | `@adonisjs/auth` | `@nexusts/auth` (better-auth) |
| Session | `@adonisjs/session` | `@nexusts/session` (cookie + memory + Drizzle) |
| Cache | `@adonisjs/cache` | `@nexusts/cache` (memory + Drizzle + Redis) |
| Logger | `@adonisjs/logger` | `@nexusts/logger` (Pino, request-scoped) |
| Encryption | `@adonisjs/encryption` | `@nexusts/crypto` (AES-256-GCM + HMAC + scrypt) |
| Hash | `@adonisjs/hash` | `@nexusts/crypto` (HashService) |
| Shield (CSRF / CORS) | `@adonisjs/shield` | `@nexusts/shield` (CSRF + HSTS + CSP) |
| Rate Limiting | `@adonisjs/throttler` | `@nexusts/limiter` (3 strategies, Drizzle storage) |
| Mail | `@adonisjs/mail` | `@nexusts/mail` (SMTP + File + Null, MJML) |
| Drive (file storage) | `@adonisjs/drive` | `@nexusts/drive` (Local + S3 + R2 + memory) |
| Queue | `@adonisjs/queue` | `@nexusts/queue` (BullMQ + Cloudflare + memory) |
| Scheduler | `@adonisjs/scheduler` | `@nexusts/schedule` (in-tree cron parser) |
| Events | `@adonisjs/events` | `@nexusts/events` (wildcards, priorities, guards) |
| Static files | `@adonisjs/static` | `@nexusts/static` (ETag, Range, SPA fallback) |
| Health checks | `@adonisjs/health` | `@nexusts/health` (built-in indicators, multi-backend) |
| i18n | `@adonisjs/i18n` | `@nexusts/i18n` (`Intl`-based, pluralization) |
| Edge templates | `@adonisjs/view` (Edge) | Rendu / Edge / Eta (3 engines, auto-detected) |
| Inertia | `@adonisjs/inertia` | `@nexusts/view` (Inertia v3, React/Vue SSR) |
| Config / Env | `@adonisjs/config` | `@nexusts/config` (Zod-validated) |
| Bodyparser | `@adonisjs/bodyparser` | Built into Hono + `@nexusts/upload` |
| Compiler / CLI | `@adonisjs/assembler` + Ace | `@nexusts/cli` (`nx`, ACE-style) |
| REPL | `node ace repl` | `nx repl` (DI-resolved, introspection) |
| Testing | `@adonisjs/testing` | Vitest + `new Application()` |
| OpenAPI / Swagger | ❌ No first-party | `@nexusts/openapi` (Zod → OpenAPI 3.1 + Scalar UI) |
| SSE | ❌ No first-party | `@nexusts/sse` (built-in) |
| GraphQL | ❌ No first-party | `@nexusts/graphql` (SDL + code-first) |
| gRPC | ❌ No first-party | `@nexusts/grpc` (4 call types) |
| WebSocket | ❌ No first-party | `@nexusts/ws` (Bun) |
| Metrics / Prometheus | ❌ No first-party | `@nexusts/metrics` (Counters, Histograms, Summaries) |
| Tracing / OpenTelemetry | ❌ No first-party | `@nexusts/tracing` (lazy SDK, auto-HTTP, W3C/B3) |
| Feature flags | ❌ No first-party | `@nexusts/feature-flag` (rollout, allowlist) |
| Resilience | ❌ No first-party | `@nexusts/resilience` (retry + circuit + bulkhead) |

### Side-by-Side: Common Module Examples

#### Health Check

**AdonisJS (`@adonisjs/health`):**

```ts
import { HealthCheckController } from '@adonisjs/health';
import { DiskHealthCheck } from '@adonisjs/health/drivers';

// config/health.ts
const healthCheckController = new HealthCheckController([
  new DiskHealthCheck({ threshold: 0.9 }),
]);

// start/routes.ts
router.get('/health', ({ response }) => healthCheckController.run(response));
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

// Auto-registered endpoints:
// GET /health/live, GET /health/ready, GET /health/startup
```

---

#### Cache

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

@Module({
  imports: [CacheModule.forRoot({ defaultTtl: 60 })],
})
export class AppModule {}

@Injectable()
class PostService {
  @Inject(CacheService) declare cache: CacheService;

  async find(id: number) {
    const cached = await this.cache.get(`post:${id}`);
    if (cached) return cached;
    const post = await this.db.find(id);
    await this.cache.set(`post:${id}`, post);
    return post;
  }
}
```

Tag-based invalidation is built in — bust related caches at once:

```ts
await this.cache.set('dashboard:stats', data, { tags: ['dashboard'] });
await this.cache.invalidateByTag('dashboard');
```

---

#### Mail

**AdonisJS (`@adonisjs/mail`):**

```ts
import { Mail } from '@adonisjs/mail/services/main';

class NotificationService {
  async sendWelcome(email: string) {
    await Mail.send((message) => {
      message.to(email).subject('Welcome!').html('<h1>Hello</h1>');
    });
  }
}
```

**NexusTS (`@nexusts/mail`):**

```ts
import { Module } from '@nexusts/core';
import { MailModule, MailService, FileTransport } from '@nexusts/mail';

@Module({
  imports: [
    MailModule.forRoot({
      transport: new FileTransport({ dir: './outbox' }),
    }),
  ],
})
export class AppModule {}

@Injectable()
class NotificationService {
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

#### Scheduler

**AdonisJS (`@adonisjs/scheduler`):**

```ts
// start/scheduler.ts
import Scheduler from '@adonisjs/scheduler/services/main';

Scheduler.command('*/5 * * * *', async () => {
  await cleanupExpiredTokens();
});
```

**NexusTS (`@nexusts/schedule`):**

```ts
import { Injectable } from '@nexusts/core';
import { Cron } from '@nexusts/schedule';

@Injectable()
class CleanupJob {
  @Cron('*/5 * * * *')
  async cleanupExpiredTokens() {
    // ...
  }
}
```

---

#### Drive (File Storage)

**AdonisJS (`@adonisjs/drive`):**

```ts
import Drive from '@adonisjs/drive/services/main';

class AvatarService {
  async upload(file: MultipartFile) {
    await Drive.put('avatars/1.jpg', file.content);
    return Drive.getUrl('avatars/1.jpg');
  }
}
```

**NexusTS (`@nexusts/drive`):**

```ts
import { Module } from '@nexusts/core';
import { DriveModule, DriveService } from '@nexusts/drive';

@Module({
  imports: [DriveModule.forRoot({ driver: 'local', root: './storage' })],
})
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
