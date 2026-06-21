# 횡단 관심사 · limiter, shield, cache, drive, mail

> English version: [`cross-cutting-features.md`](./cross-cutting-features.md)

v0.3에서 함께 출시되는 다섯 모듈 — `nexus/limiter`, `nexus/shield`,
`nexus/cache`, `nexus/drive`, `nexus/mail` — production stack을 완성한다.
모두 독립 번들이고, 모두 같은 `Module.forRoot({...})` DI 패턴을 사용하며,
모두 peer dependency(Redis, AWS SDK, nodemailer 등)를 강제하지 않도록
설계되었다 (필요 없는 프로젝트는 가볍게 유지).

---

## 1. `nexus/limiter` — rate limiting

세 가지 전략: `fixed-window`, `sliding-window` (기본),
`token-bucket`. 플러그 가능한 storage backend (기본 메모리).

### 전역 규칙

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

### 라우트별 decorator

```ts
import { RateLimit } from 'nexus/limiter';

@Controller('/auth')
class AuthController {
  @Post('/login')
  @RateLimit({ points: 5, duration: '1m', key: (c) => c.req.header('x-api-key') })
  login() {}
}
```

### 커스텀 storage

```ts
import { LimiterService } from 'nexus/limiter';

class RedisRateLimitStorage implements RateLimitStorage {
  async consume(key, points, limit, durationMs, strategy) {
    // 원자적 Lua 스크립트: INCR + EXPIRE
  }
  async reset(key) { /* ... */ }
}

LimiterModule.forRoot({ storage: new RedisRateLimitStorage(redis), rules: [...] });
```

### 응답 헤더

모든 제한 요청에 대해:

- `X-RateLimit-Limit` — 윈도우당 최대 포인트
- `X-RateLimit-Remaining` — 남은 포인트
- `X-RateLimit-Reset` — 윈도우 리셋 unix-seconds
- `Retry-After` — 429일 때만

### 거절 동작

```ts
{
  path: '/login',
  points: 5,
  duration: '1m',
  reject: (c, result) => c.json({ error: 'Slow down', retry: result.retryAfter }, 429),
}
```

---

## 2. `nexus/shield` — 보안 미들웨어 스위트

AdonisJS-Shield 형상. CSRF, 보안 헤더 (HSTS, X-Frame-Options,
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

### 폼에서 CSRF 사용

```html
<!-- 폼 템플릿 -->
<input type="hidden" name="_csrf" value="{{ csrfToken }}">

<!-- 또는 SPA용 meta 태그 -->
<meta name="csrf-token" content="{{ csrfToken }}">
```

```ts
// 모든 safe 요청에서 ShieldModule이 `nexus-csrf` 쿠키를 설정.
// 변경 요청은 서명된 토큰을 `X-CSRF-Token`에 echo해야 함.
```

### 컨트롤러에서 직접 shield 접근

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

## 3. `nexus/cache` — 애플리케이션 캐시

기본은 TTL이 있는 인메모리 LRU. 멀티 pod 배포를 위한 옵션 `RedisStore`.

```ts
@Module({
  imports: [
    CacheModule.forRoot({
      defaultTtl: 300,             // 5분
      prefix: 'myapp',
    }),
  ],
})
```

### 직접 사용

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

### Decorator

```ts
import { Cacheable, CacheInvalidate } from 'nexus/cache';

class UserService {
  @Cacheable('user', (id: string) => id, 60)
  async findById(id: string) { /* ... */ }

  @CacheInvalidate('user', (id: string) => id)
  async deleteById(id: string) { /* ... */ }
}
```

> Decorator는 메타데이터를 저장; `cache.applyDecorators(instance)`는
> DI 컨테이너가 서비스를 와이어링할 때 호출.

### 커스텀 store

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

## 4. `nexus/drive` — 파일 스토리지 추상화

`LocalDriver` (파일시스템), `MemoryDriver` (인프로세스),
`S3Driver` (AWS S3 / R2 / MinIO).

```ts
@Module({
  imports: [
    DriveModule.forRoot({
      driver: new LocalDriver({ root: '/var/data', publicUrlPrefix: '/files' }),
    }),
  ],
})

// S3:
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

### 사용

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

### 경로 안전성 (LocalDriver)

경로 traversal은 거부됨:

```ts
await drive.get('../etc/passwd'); // "Path traversal blocked" 예외
```

---

## 5. `nexus/mail` — 발신 이메일

`SmtpTransport` (nodemailer), `FileTransport` (개발용 .eml 파일),
`NullTransport` (테스트).

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

### 메일 발송

```ts
@Injectable()
class AuthMailer {
  constructor(@Inject(MailService.TOKEN) private mail: MailService) {}

  async sendWelcome(to: string, name: string) {
    await this.mail.send({
      to,
      subject: '환영합니다!',
      html: `<h1>안녕하세요 ${name}님!</h1><p>가입해주셔서 감사합니다.</p>`,
      text: `안녕하세요 ${name}님! 가입해주셔서 감사합니다.`,
      attachments: [
        { filename: 'logo.png', content: pngBuffer, cid: 'logo' },
      ],
    });
  }
}
```

### MJML 템플릿

```ts
const html = await mail.renderMjml(`
  <mjml>
    <mj-body>
      <mj-section>
        <mj-column>
          <mj-text>안녕하세요 {{name}}님</mj-text>
        </mj-column>
      </mj-section>
    </mj-body>
  </mjml>
`);
```

`mjml`은 **선택 peer dep** — 필요한 경우에만 설치.

### File transport (개발)

```ts
MailModule.forRoot({
  transport: new FileTransport({ dir: './tmp/mail' }),
});
// 발송된 모든 메일은 ./tmp/mail/<id>.eml에 기록됨
```

---

## 6. 선택 peer dependency

이 모듈들은 의존성을 **강제하지 않도록** 설계됨:

| 모듈 | 선택 peer dep | 설치 시점 |
| ------ | ----------------- | ------------- |
| `cache` | ioredis, @redis/client | 멀티 pod 캐시가 필요할 때 |
| `drive` | @aws-sdk/client-s3, @aws-sdk/s3-request-presigner | S3 / R2 사용 시 |
| `mail` | nodemailer, mjml | 실제로 메일 발송 / MJML 사용 시 |

설치하지 않으면 해당 기능은 런타임에 명확한 에러 메시지를 던진다.
이렇게 하면 메모리/in-memory 변형만 필요한 프로젝트의 번들을 가볍게 유지.

---

## 7. 종합 사용 예

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

## 8. 참고

- [`./production-basics.md`](./production-basics.md) — health / config / logger / static
- [`../design/architecture.md`](../design/architecture.md) — 전체 모듈 설계
- [`../analysis/nestjs-comparison.md`](../analysis/nestjs-comparison.md) — 격차 분석
- [`../analysis/adonisjs-comparison.md`](../analysis/adonisjs-comparison.md) — 격차 분석
