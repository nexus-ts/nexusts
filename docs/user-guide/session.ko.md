# Session · 쿠키 / 메모리 / Redis

> English version: [`session.md`](./session.md)

NexusTS는 균일한 `SessionStorage` 인터페이스와 여러 백엔드를 가진 `@nexusts/session` 모듈을 제공한다.

- **cookie** — HMAC 서명, 상태 비저장, 엣지 친화적. 전체 세션 레코드가 단일 쿠키에 인코딩된다.
- **memory** — 인프로세스, 테스트 및 단일 인스턴스 개발용.
- **redis** — v0.2에서 예정 (인터페이스는 정의됨).

session 모듈은 **`@nexusts/core`와 분리**되어 있고, **`@nexusts/auth`와도 분리**되어 있다(better-auth는 자체 세션을 관리한다). 단, `AuthService.bindSession()`을 통해 **`@nexusts/auth`와 통합**된다.

---

## 1. 빠른 시작

```ts
// app/app.module.ts
import { Module } from '@nexusts/core';
import { SessionModule } from '@nexusts/session';

@Module({
  imports: [
    SessionModule.forRoot({
      backend: 'cookie',
      cookie: { secret: process.env.SESSION_SECRET! },
    }),
  ],
})
export class AppModule {}
```

```ts
// app/controllers/cart.controller.ts
import { Controller, Post, Body } from '@nexusts/core';
import { SessionService, Session } from '@nexusts/session';

@Controller('/cart')
export class CartController {
  @Post('/')
  async add(ctx: Context) {
    const session = ctx.var?.nexus?.session;
    const body = await ctx.req.json() as { item: string };
    const cart = (session?.data.cart ?? []) as string[];
    cart.push(body.item);
    return this.sessions.update(session.id, { dataPatch: { cart } });
  }
}
```

---

## 2. `SessionRecord` 형상

```ts
interface SessionRecord {
  id: string;                              // 랜덤 불투명 id
  userId: string | null;                    // 익명 세션의 경우 null
  data: Record<string, unknown>;            // 자유 형식 세션별 데이터
  createdAt: Date;
  lastSeenAt: Date;
  expiresAt: Date;
  absoluteExpiresAt?: Date;
  metadata?: { ipAddress?, userAgent?, ... };
}
```

`data`는 앱이 세션별 상태를 저장하는 곳이다 — 플래시 메시지, 게스트 장바구니, CSRF 토큰, OAuth 플로우 상태 등.

---

## 3. 스토리지 백엔드

### Cookie (엣지 / Workers 권장)

```ts
SessionModule.forRoot({
  backend: 'cookie',
  cookie: {
    secret: process.env.SESSION_SECRET!,     // 16자 이상
    cookieName: 'nexus.sess',                // 기본값
    defaultTtlSeconds: 60 * 60 * 24 * 7,     // 7일
    cookieOptions: {
      domain: '.example.com',                // 서브도메인용
      path: '/',
      httpOnly: true,
      secure: true,                           // 프로덕션
      sameSite: 'lax',                        // 'lax' | 'strict' | 'none'
      partitioned: false,
    },
  },
});
```

형식: `<base64url(payload)>.<base64url(HMAC-SHA256)>`. 상태 비저장 — 서버 측 상태 불필요. 공유 스토리지가 없는 Workers / Vercel 에 이상적.

### Redis (v0.5)

다중 pod 세션 스토리지(`@nexusts/redis` 경유). `client`는 `@nexusts/redis`의 `RedisClient`로, `@nexusts/cache` Redis 스토어와 Cloudflare KV 백엔드를 구동하는 같은 패키지.

```ts
import { SessionModule } from '@nexusts/session';
import { createRedisClient } from '@nexusts/redis';

SessionModule.forRoot({
  backend: 'redis',
  redis: {
    client: createRedisClient({ url: process.env.REDIS_URL! }),
    keyPrefix: 'sess:',
  },
});
```

### Cloudflare KV (v0.5)

Cloudflare Workers / Pages의 경우 Redis 어댑터 대신 `CloudflareKVAdapter` 전달. Redis 백엔드와 같은 코드 경로 — 프레임워크가 같은 스토리지 클래스를 다른 기본 클라이언트로 재사용.

```ts
import { SessionModule } from '@nexusts/session';
import { CloudflareKVAdapter } from '@nexusts/redis';

export default {
  async fetch(req: Request, env: Env) {
    return new SessionModule().forRoot({
      backend: 'cloudflare-kv',
      cloudflareKv: { client: new CloudflareKVAdapter({ kv: env.SESSIONS }) },
    });
  },
};
```

`kv` 필드가 생략되면 Workers 요청 핸들러 내에서 어댑터가 `globalThis.env.KV`를 자동 감지.

### Memory

```ts
SessionModule.forRoot({
  backend: 'memory',
  memory: {
    gcIntervalMs: 60_000,
    maxSessions: 100_000,
  },
});
```

LRU 축출 `Map`. 테스트, `bunx nx dev`, 단일 인스턴스 배포에 적합. GC는 `setInterval`에서 실행.

### Redis (v0.2)

예정. 인터페이스는 이미 정의됨; 백엔드 구현만 누락.

---

## 4. 프로그래매틱 API

```ts
class MyService {
  @Inject(SessionService.TOKEN) declare sessions: SessionService;

  async login(userId: string) {
    const s = await this.sessions.create({
      ttlSeconds: 60 * 60 * 24 * 30,
      metadata: { ipAddress: '...' },
    });
    (s as { userId: string }).userId = userId;
    return s;
  }

  async logout(sessionId: string) {
    return this.sessions.destroy(sessionId, 'logout');
  }

  async readSession(sessionId: string) {
    return this.sessions.read(sessionId);
  }

  async updateCart(sessionId: string, cart: string[]) {
    return this.sessions.update(sessionId, { dataPatch: { cart } });
  }
}
```

### 정적 헬퍼

서비스 인스턴스 없이 세션 쿠키를 인코딩/디코딩 가능 (미들웨어에서 유용):

```ts
import { SessionService } from '@nexusts/session';

const cookie = SessionService.encodeCookie(record, secret);
const record = SessionService.decodeCookie(cookieValue, secret);
```

---

## 5. `ctx.session` API (AdonisJS 스타일, 권장)

세션 미들웨어는 AdonisJS 스타일의 `ctx.session` API를 제공합니다.
`get`/`set`/`forget`/`flash` 메서드로 세션 데이터를 읽고 쓸 수 있습니다.

```ts
@Get('/profile')
profile(ctx: Context) {
  return ctx.session.all();
}

@Post('/cart/add')
async add(ctx: Context) {
  const cart = ctx.session.get('cart', []) as string[];
  cart.push(await ctx.req.json());
  ctx.session.set('cart', cart);
  return { ok: true };
}
```

### SessionContext API

| 메서드 | 설명 |
|--------|------|
| `get(key, default?)` | 세션 데이터 읽기 |
| `set(key, value)` | 값 쓰기 |
| `forget(key)` | 키 삭제 |
| `flash(key, value)` | 일회성 값 (읽힌 후 자동 삭제) |
| `all()` | 전체 데이터를 객체로 반환 |
| `id` | 세션 ID |
| `userId` | 사용자 ID |

### 미들웨어 등록

세션 미들웨어는 반드시 `Application()` 옵션으로 등록해야 합니다:

```ts
// main.ts
import { Application } from '@nexusts/core';
import { SessionModule, SessionService, sessionMiddleware } from '@nexusts/session';

const app = new Application(AppModule, {
  middleware: [sessionMiddleware(sessions)],
});
```

### 레거시: `@Session()` 데코레이터

`@Session()` 파라미터 데코레이터는 레거시 모드(`experimentalDecorators: true`)에서
계속 동작합니다. 표준 데코레이터 모드에서는 `ctx.session`을 사용하세요.

---

## 6. 쿠키 발행

백엔드가 `cookie`일 때 `SessionService`는 `Set-Cookie` 헤더를 빌드하는 헬퍼를 제공한다.

```ts
class AuthController {
  @Post('/login')
  async login(ctx: Context) {
    const body = await ctx.req.json() as { userId: string };
    const s = await this.sessions.create({ data: { userId: body.userId } });
    (s as { userId: string }).userId = body.userId;
    const setCookie = this.sessions.buildSetCookie(s);
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { 'set-cookie': setCookie ?? '' },
    });
  }

  @Post('/logout')
  async logout(@Session() session) {
    await this.sessions.destroy(session.id, 'logout');
    const clearCookie = this.sessions.buildClearCookie();
    return new Response(null, {
      status: 204,
      headers: { 'set-cookie': clearCookie ?? '' },
    });
  }
}
```

---

## 7. 세션 회전 (session-fixation 방어)

인증 후 세션 id를 회전시켜 이전 (인증되지 않은) id를 재사용할 수 없게 한다.

```ts
@Post('/login')
async login(ctx: Context) {
    const body = await ctx.req.json();
  const fresh = await this.sessions.rotate(session.id);
  (fresh as { userId: string }).userId = body.userId;
  return new Response(null, {
    status: 200,
    headers: { 'set-cookie': this.sessions.buildSetCookie(fresh) ?? '' },
  });
}
```

`rotate()`는 동일한 데이터/메타데이터로 새 레코드를 생성하고 이전 것을 destroy한다. 이전 id는 무효화된다.

---

## 8. `@nexusts/auth`와의 통합

`AuthService.bindSession(service)`은 `SessionService`를 auth 흐름에 연결한다. 바인딩 후 `AuthService.getSession()`은 먼저 세션 쿠키를 참조한 다음(플래시 메시지 같은 비-better-auth 상태를 위해) better-auth로 폴백한다.

```ts
const AppSessionModule = SessionModule.forRoot({
  backend: 'cookie',
  cookie: { secret: process.env.SESSION_SECRET! },
});

@Module({
  imports: [AppAuthModule, AppSessionModule],
})
class AppModule {}

// app/main.ts
const app = new Application(AppModule);
const auth = app.container.resolve(AuthService);
const sessions = app.container.resolve(SessionService);
auth.bindSession(sessions);
```

왜 이렇게 하고 싶은가?

- **모듈 간 단일 사인온** — 한 모듈에서 설정한 플래시 메시지가 다른 모듈에 보인다.
- **사전 인증 세션 상태** — 게스트 장바구니, OAuth 플로우 상태.
- **엣지 배포** — 쿠키 세션은 Workers에서 DB 액세스 없이 작동; better-auth의 DB 기반 세션도 마찬가지.

두 시스템은 공존한다: better-auth는 사용자 신원을 관리; `SessionService`는 일시적 상태를 관리. 쿠키를 공유한다.

---

## 9. 이벤트

```ts
sessions.on((event) => {
  switch (event.kind) {
    case 'session:created':    // { id, userId }
    case 'session:read':
    case 'session:updated':
    case 'session:destroyed':  // { id, userId, reason: 'logout' | 'expired' | 'admin' | 'unknown' }
    case 'session:expired':
    case 'session:rotated':    // { oldId, newId }
  }
});
```

분석, 보안 감사, 세션이 destroy될 때 캐시 무효화에 유용하다.

---

## 10. 설정

```ts
SessionModule.forRoot({
  backend: 'cookie',                       // 'cookie' | 'memory' | 'redis'
  defaults: {
    ttlSeconds: 60 * 60 * 24 * 7,         // 7일
    absoluteTtlSeconds: 60 * 60 * 24 * 30, // 30일 하드 캡
  },
  cookie: { /* ... */ },
  memory: { /* ... */ },
  redis:  { /* ... */ },
});
```

---

## 11. CLI: `nx make:session`

```bash
nx make:session Cart
nx make:session Flash
```

`app/session/services/<name>.session.ts`를 생성한다 — 타입이 지정된 접근자 메서드가 있는 `@Injectable` 스켈레톤.

---

## 12. 테스트

```ts
const backend = new MemorySessionStorage();
const s = await backend.create({ data: { cart: [] } });
const r = await backend.read(s.id);
expect(r?.id).toBe(s.id);
```

쿠키 라운드트립:

```ts
const storage = new CookieSessionStorage({ secret: SECRET });
const record = { id: 's', userId: null, data: {}, createdAt: new Date(), lastSeenAt: new Date(), expiresAt: new Date(Date.now() + 60_000) };
const cookie = storage.encode(record);
expect(storage.decode(cookie)?.id).toBe('s');
expect(storage.decode('tampered')).toBeNull();
```

---

## 13. 참고

- [`../design/session.md`](../design/session.md) — 아키텍처
- [`./auth.md`](./auth.md) — better-auth 통합
- [`./cli.md`](./cli.md) — `nx make:session` 레퍼런스
- [`iron-session`](https://github.com/vvo/iron-session) — 영감
