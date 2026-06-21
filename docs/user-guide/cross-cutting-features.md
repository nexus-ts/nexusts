# Cross-cutting features · limiter, shield, cache, drive, mail

> 한국어 버전: [`cross-cutting-features.ko.md`](./cross-cutting-features.ko.md)

The five modules shipped together in v0.3 — `nexus/limiter`,
`nexus/shield`, `nexus/cache`, `nexus/drive`, `nexus/mail` — round out
the production stack. They are all independent bundles, all use the
same `Module.forRoot({...})` DI pattern, and all are designed to work
without forcing peer dependencies (Redis, AWS SDK, nodemailer, etc.)
on projects that don't need them.

---

## 1. `nexus/limiter` — rate limiting

Three strategies: `fixed-window`, `sliding-window` (default),
`token-bucket`. Pluggable storage backend (memory by default).

### Global rules

```ts
@Module({
  imports: [
    LimiterModule.forRoot({
      rules: [
        { path: '/api/*',  points: 100, duration: '1m' },
        { path: '/login',  points: 5,   duration: '1m', methods: ['POST'] },
        { path: '/search', points: 10,  duration: '1s', strategy: 'token-bucket' },
      ],
    }),
  ],
})
```

### Per-route decorator

```ts
import { RateLimit } from 'nexus/limiter';

@Controller('/auth')
class AuthController {
  @Post('/login')
  @RateLimit({ points: 5, duration: '1m', key: (c) => c.req.header('x-api-key') })
  login() {}
}
```

### Custom storage

```ts
import { LimiterService } from 'nexus/limiter';

class RedisRateLimitStorage implements RateLimitStorage {
  async consume(key, points, limit, durationMs, strategy) {
    // Atomic Lua script: INCR + EXPIRE
  }
  async reset(key) { /* ... */ }
}

LimiterModule.forRoot({ storage: new RedisRateLimitStorage(redis), rules: [...] });
```

### Response headers

On every limited request:

- `X-RateLimit-Limit` — max points per window
- `X-RateLimit-Remaining` — points left
- `X-RateLimit-Reset` — unix-seconds when the window resets
- `Retry-After` — only on 429

### Reject behavior

```ts
{
  path: '/login',
  points: 5,
  duration: '1m',
  reject: (c, result) => c.json({ error: 'Slow down', retry: result.retryAfter }, 429),
}
```

---

## 2. `nexus/shield` — security middleware suite

AdonisJS-Shield-shaped. CSRF, security headers (HSTS, X-Frame-Options,
X-Content-Type-Options, Referrer-Policy, CSP).

```ts
import { ShieldModule } from 'nexus/shield';

@Module({
  imports: [
    ShieldModule.forRoot({
      csrf: {
        enabled: true,
        cookie: { secure: true, sameSite: 'Strict' },
        secret: process.env.SHIELD_SECRET!,
      },
      hsts: { maxAge: 31_536_000, includeSubDomains: true, preload: true },
      csp: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'", 'cdn.example.com'],
          imgSrc: ["'self'", 'data:'],
        },
        reportOnly: false,
      },
      xFrameOptions: 'DENY',
      xContentTypeOptions: true,
      referrerPolicy: 'strict-origin-when-cross-origin',
    }),
  ],
})
```

### CSRF usage in forms

```html
<!-- in your form template -->
<input type="hidden" name="_csrf" value="{{ csrfToken }}">

<!-- or as a meta tag for SPAs -->
<meta name="csrf-token" content="{{ csrfToken }}">
```

```ts
// On every safe request, ShieldModule sets the `nexus-csrf` cookie.
// Mutating requests must echo the signed token in `X-CSRF-Token`.
```

### Direct shield access in controllers

```ts
import { Inject } from 'nexus';
import { ShieldService } from 'nexus/shield';

class FormController {
  constructor(@Inject(ShieldService.TOKEN) private shield: ShieldService) {}

  @Get('/contact')
  contactPage(@Res() res: Response) {
    const t = this.shield.issueToken(res.headers);
    return { csrfToken: t.token };
  }
}
```

---

## 3. `nexus/cache` — application cache

In-memory LRU with TTL by default. Optional `RedisStore` for
multi-pod deployments.

```ts
@Module({
  imports: [
    CacheModule.forRoot({
      defaultTtl: 300,             // 5 min
      prefix: 'myapp',
    }),
  ],
})
```

### Direct usage

```ts
import { CacheService } from 'nexus/cache';

class UserService {
  constructor(@Inject(CacheService.TOKEN) private cache: CacheService) {}

  async findById(id: string) {
    return this.cache.wrap(
      `user:${id}`,
      () => this.db.query('SELECT * FROM users WHERE id = $1', [id]),
      60,                            // 60s TTL
    );
  }
}
```

### Decorators

```ts
import { Cacheable, CacheInvalidate } from 'nexus/cache';

class UserService {
  @Cacheable('user', (id: string) => id, 60)
  async findById(id: string) { /* ... */ }

  @CacheInvalidate('user', (id: string) => id)
  async deleteById(id: string) { /* ... */ }
}
```

> Decorators store metadata; `cache.applyDecorators(instance)` is called
> by the DI container when the service is wired.

### Custom store

```ts
import { CacheService, CacheStore } from 'nexus/cache';

class RedisStore implements CacheStore {
  readonly kind = 'redis';
  async get<T>(key: string) { /* ... */ }
  async set<T>(key: string, value: T, opts?: CacheSetOptions) { /* ... */ }
  // ...
}

CacheModule.forRoot({ store: new RedisStore(redis) });
```

---

## 4. `nexus/drive` — file storage abstraction

`LocalDriver` (filesystem), `MemoryDriver` (in-process),
`S3Driver` (AWS S3 / R2 / MinIO).

```ts
@Module({
  imports: [
    DriveModule.forRoot({
      driver: new LocalDriver({ root: '/var/data', publicUrlPrefix: '/files' }),
    }),
  ],
})

// For S3:
DriveModule.forRoot({
  driver: new S3Driver({
    bucket: 'my-bucket',
    region: 'us-east-1',
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
    },
  }),
});
```

### Usage

```ts
@Injectable()
class AvatarService {
  constructor(@Inject(DriveService.TOKEN) private drive: DriveService) {}

  async upload(userId: string, bytes: Buffer) {
    const key = `avatars/${userId}.png`;
    await this.drive.put(key, bytes, {
      contentType: 'image/png',
      cacheControl: 'public, max-age=86400',
    });
    return this.drive.getSignedUrl(key, { expiresIn: 3600 });
  }

  async getUrl(key: string) {
    return this.drive.getSignedUrl(key);
  }

  async list(prefix: string) {
    return this.drive.list({ prefix, limit: 100 });
  }
}
```

### Path safety (LocalDriver)

Path traversal is rejected:

```ts
await drive.get('../etc/passwd'); // throws "Path traversal blocked"
```

---

## 5. `nexus/mail` — outbound email

`SmtpTransport` (nodemailer), `FileTransport` (.eml files for dev),
`NullTransport` (tests).

```ts
@Module({
  imports: [
    MailModule.forRoot({
      transport: new SmtpTransport({
        host: 'smtp.gmail.com',
        port: 465,
        secure: true,
        auth: { user: process.env.SMTP_USER!, pass: process.env.SMTP_PASS! },
      }),
      defaultFrom: 'no-reply@example.com',
    }),
  ],
})
```

### Sending mail

```ts
@Injectable()
class AuthMailer {
  constructor(@Inject(MailService.TOKEN) private mail: MailService) {}

  async sendWelcome(to: string, name: string) {
    await this.mail.send({
      to,
      subject: 'Welcome!',
      html: `<h1>Hi ${name}!</h1><p>Thanks for joining.</p>`,
      text: `Hi ${name}! Thanks for joining.`,
      attachments: [
        { filename: 'logo.png', content: pngBuffer, cid: 'logo' },
      ],
    });
  }
}
```

### MJML templates

```ts
const html = await mail.renderMjml(`
  <mjml>
    <mj-body>
      <mj-section>
        <mj-column>
          <mj-text>Hello {{name}}</mj-text>
        </mj-column>
      </mj-section>
    </mj-body>
  </mjml>
`);
```

`mjml` is an **optional peer dep** — install only if you need it.

### File transport (dev)

```ts
MailModule.forRoot({
  transport: new FileTransport({ dir: './tmp/mail' }),
});
// All sent mail is written to ./tmp/mail/<id>.eml
```

---

## 6. Optional peer dependencies

These modules are designed to **not force dependencies** on you:

| Module | Optional peer dep | Install when… |
| ------ | ----------------- | ------------- |
| `cache` | ioredis, @redis/client | you need multi-pod cache |
| `drive` | @aws-sdk/client-s3, @aws-sdk/s3-request-presigner | you use S3 / R2 |
| `mail` | nodemailer, mjml | you actually send mail / use MJML |

If you don't install the dep, the corresponding feature throws a clear
error message at runtime. This keeps the bundle lean for projects that
only need the memory/in-memory variants.

---

## 7. Combined usage

```ts
@Module({
  imports: [
    // basics
    ConfigModule.forRoot({ schema: configSchema, exitOnError: true }),
    LoggerModule.forRoot({ pretty: process.env.NODE_ENV !== 'production' }),
    HealthModule.forRoot({ builtIn: { memory: true, disk: { threshold: 0.1 } } }),

    // cross-cutting
    LimiterModule.forRoot({
      rules: [
        { path: '/api/*', points: 100, duration: '1m' },
        { path: '/auth/*', points: 10, duration: '1m' },
      ],
    }),
    ShieldModule.forRoot({
      csrf: { enabled: true },
      hsts: { maxAge: 31_536_000, includeSubDomains: true },
    }),
    CacheModule.forRoot({ defaultTtl: 60 }),
    DriveModule.forRoot({ driver: new LocalDriver({ root: '/var/data' }) }),
    MailModule.forRoot({
      transport: new SmtpTransport({ host: 'smtp.example.com' }),
      defaultFrom: 'no-reply@example.com',
    }),
  ],
})
export class AppModule {}
```

---

## 8. See also

- [`./production-basics.md`](./production-basics.md) — health / config / logger / static
- [`../design/architecture.md`](../design/architecture.md) — overall module design
- [`../analysis/nestjs-comparison.md`](../analysis/nestjs-comparison.md) — gap analysis
- [`../analysis/adonisjs-comparison.md`](../analysis/adonisjs-comparison.md) — gap analysis
