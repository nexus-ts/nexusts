# Session · cookie / memory / Redis

> 한국어 버전: [`session.ko.md`](./session.ko.md)

NexusTS ships a session module under `@nexusts/session` that provides a
uniform `SessionStorage` interface with multiple backends:

- **cookie** — HMAC-signed, stateless, edge-friendly. The entire
  session record is encoded in a single cookie.
- **memory** — in-process, for tests and single-instance dev.
- **redis** — planned for v0.2 (interface defined).

The session module is **separate from `@nexusts/core`**, **separate
from `@nexusts/auth`** (better-auth manages its own sessions), but
**integrates with `@nexusts/auth`** via `AuthService.bindSession()`.

---

## 1. Quick start

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
// app/main.ts — MUST register middleware via Application() options
import { Application } from '@nexusts/core';
import { SessionModule, SessionService, sessionMiddleware } from '@nexusts/session';

const app = new Application(AppModule, {
  middleware: [sessionMiddleware(sessions)],
});
```

```ts
// app/controllers/cart.controller.ts
import { Controller, Post } from '@nexusts/core';
import { SessionModule } from '@nexusts/session';
import type { Context } from 'hono';

@Controller('/cart')
export class CartController {
  @Post('/')
  async add(ctx: Context) {
    const cart = ctx.session.get('cart', []) as string[];
    cart.push(body.item);
    ctx.session.set('cart', cart);
    return { ok: true };
  }
}
```

---

## 2. The `SessionRecord` shape

```ts
interface SessionRecord {
  id: string;                              // random opaque id
  userId: string | null;                    // null for anonymous
  data: Record<string, unknown>;            // free-form per-session data
  createdAt: Date;
  lastSeenAt: Date;
  expiresAt: Date;
  absoluteExpiresAt?: Date;
  metadata?: { ipAddress?, userAgent?, ... };
}
```

`data` is where your app stores per-session state — flash messages,
guest cart contents, CSRF tokens, OAuth flow state, etc.

---

## 3. Storage backends

### Cookie (recommended for edge / Workers)

```ts
SessionModule.forRoot({
  backend: 'cookie',
  cookie: {
    secret: process.env.SESSION_SECRET!,     // 16+ chars
    cookieName: 'nexus.sess',                // default
    defaultTtlSeconds: 60 * 60 * 24 * 7,     // 7 days
    cookieOptions: {
      domain: '.example.com',                // for subdomains
      path: '/',
      httpOnly: true,
      secure: true,                           // production
      sameSite: 'lax',                        // 'lax' | 'strict' | 'none'
      partitioned: false,
    },
  },
});
```

Format: `<base64url(payload)>.<base64url(HMAC-SHA256)>`. Stateless —
no server-side state needed. Ideal for Workers / Vercel
Deploy where shared storage isn't available.

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

LRU-evicting `Map`. Good for tests, `bunx nx dev`, single-instance
deployments. GC runs on `setInterval`.

### Redis (v0.5)

Multi-pod session storage via `@nexusts/redis`. The `client` is a
`RedisClient` from `@nexusts/redis` — same package that powers the
`@nexusts/cache` Redis store and the Cloudflare KV backend.

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

For Cloudflare Workers / Pages, pass a `CloudflareKVAdapter`
instead of a Redis adapter. Same code path as the Redis backend —
the framework re-uses the same storage class with a different
underlying client.

```ts
import { SessionModule } from '@nexusts/session';
import { CloudflareKVAdapter } from '@nexusts/redis';

export default {
  async fetch(req: Request, env: Env) {
    return new SessionModule().forRoot({
      backend: 'cloudflare-kv',
      cloudflareKv: { client: new CloudflareKVAdapter({ kv: env.SESSIONS }) },
    });
    // ... continue with the session module
  },
};
```

If the `kv` field is omitted, the adapter auto-detects
`globalThis.env.KV` inside a Workers request handler.

---

## 4. Programmatic API

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

### Static helpers

You can encode/decode session cookies without instantiating the
service (useful in middleware):

```ts
import { SessionService } from '@nexusts/session';

const cookie = SessionService.encodeCookie(record, secret);
const record = SessionService.decodeCookie(cookieValue, secret);
```

---

## 5. `ctx.session` API (AdonisJS-style, recommended)

The session middleware provides an AdonisJS-style `ctx.session` API
with `get`/`set`/`forget`/`flash` methods. No decorator needed.

```ts
@Get('/profile')
profile(ctx: Context) {
  return ctx.session.all();
}

@Get('/admin')
admin(ctx: Context) {
  if (!ctx.session.get('role')) return ctx.json({ error: 'Forbidden' }, 403);
  return ctx.session.get('data');
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

| Method | Description |
|--------|-------------|
| `get(key, default?)` | Read a value from session data |
| `set(key, value)` | Write a value |
| `forget(key)` | Remove a key |
| `flash(key, value)` | Set a one-time value (auto-removed after read) |
| `all()` | Get all session data as object |
| `id` | Current session ID (string) |
| `userId` | Current user ID (string or null) |

### Middleware registration

The session middleware MUST be registered via `Application()` options
because Hono processes middleware in registration order:

```ts
// ✅ Correct — registered BEFORE routes
const app = new Application(AppModule, {
  middleware: [sessionMiddleware(sessions)],
});

// ❌ Won't work — `app.server.app.use()` runs AFTER routes
app.server.app.use("*", sessionMiddleware(sessions));
```

### Legacy: `@Session()` decorator (parameter decorator)

The `@Session()` parameter decorator continues to work in legacy mode
(`experimentalDecorators: true`). In standard decorator mode, use
`ctx.session` instead.

```ts
@Get('/profile')
profile(@Session() session: SessionRecord) {
  return session.data;
}
```

Options: `required`, `assert`, `touch` — see `SessionOptions` type.

---

## 6. Cookie issuance

When the backend is `cookie`, the `SessionService` exposes helpers
to build a `Set-Cookie` header. The middleware sets this automatically
via `sessionCtx.save(c)`, but you can also do it manually:

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
  async logout(ctx: Context) {
    await this.sessions.destroy(ctx.session.id, 'logout');
    const clearCookie = this.sessions.buildClearCookie();
    return new Response(null, {
      status: 204,
      headers: { 'set-cookie': clearCookie ?? '' },
    });
  }
}
```

---

## 7. Session rotation (session-fixation defense)

After authentication, rotate the session id so the previous
(unauthenticated) id can't be reused:

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

`rotate()` creates a new record with the same data / metadata and
destroys the old one. The old id becomes invalid.

---

## 8. Integration with `@nexusts/auth`

`AuthService.bindSession(service)` links a `SessionService` to the
auth flow. After binding, `AuthService.getSession()` consults the
session cookie first (to surface non-better-auth state like flash
messages), then falls back to better-auth.

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

Why would you want this?

- **Single sign-on across modules** — flash messages set by one
  module are visible to another.
- **Pre-auth session state** — guest carts, OAuth flow state.
- **Edge deploys** — cookie sessions work on Workers without DB
  access; better-auth's DB-backed sessions do too.

Both systems coexist: better-auth manages user identity;
`SessionService` manages transient state. They share the cookie.

---

## 9. Events

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

Handy for analytics, security audits, or invalidating caches when a
session is destroyed.

---

## 10. Configuration

```ts
SessionModule.forRoot({
  backend: 'cookie',                       // 'cookie' | 'memory' | 'redis'
  defaults: {
    ttlSeconds: 60 * 60 * 24 * 7,         // 7 days
    absoluteTtlSeconds: 60 * 60 * 24 * 30, // 30-day hard cap
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

Generates `app/session/services/<name>.session.ts` — an `@Injectable`
skeleton with typed accessor methods.

---

## 12. Testing

```ts
const backend = new MemorySessionStorage();
const s = await backend.create({ data: { cart: [] } });
const r = await backend.read(s.id);
expect(r?.id).toBe(s.id);
```

For cookie round-trip:

```ts
const storage = new CookieSessionStorage({ secret: SECRET });
const record = { id: 's', userId: null, data: {}, createdAt: new Date(), lastSeenAt: new Date(), expiresAt: new Date(Date.now() + 60_000) };
const cookie = storage.encode(record);
expect(storage.decode(cookie)?.id).toBe('s');
expect(storage.decode('tampered')).toBeNull();
```

---

## 13. See also

- [`../design/session.md`](../design/session.md) — architecture
- [`./auth.md`](./auth.md) — better-auth integration
- [`./cli.md`](./cli.md) — `nx make:session` reference
- [`iron-session`](https://github.com/vvo/iron-session) — inspiration
