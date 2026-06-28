# Session Module Design

> 한국어 버전: [`session.ko.md`](./session.ko.md)

## 1. Goal

Provide a uniform session-storage abstraction that:

1. **Works on every runtime** — Bun / Node / Cloudflare Workers /
   Vercel .
2. **Integrates with `@nexusts/auth`** without forcing it — better-auth
   manages its own DB-backed sessions; `SessionService` manages
   transient state (flash messages, guest carts, OAuth flow state).
3. **Doesn't re-invent the wheel** — encode/decode/verify the cookie
   via a tiny in-tree HMAC, no `cookie` or `iron-session` dep.

## 2. Why a separate module?

`@nexusts/auth` already provides session management via better-auth's
DB-backed sessions. So why a `@nexusts/session`?

| Need | Why `@nexusts/auth` alone isn't enough |
| ---- | ----------------------------------- |
| **Edge runtimes** | Better-auth's DB sessions need a database. Workers often can't reach one. Cookie sessions work with zero infrastructure. |
| **Pre-auth state** | Guest carts, OAuth flow state, CSRF tokens — these need to exist *before* a user signs in. Better-auth's sessions are always tied to a user. |
| **Flash messages** | One request sets a message, the next renders it. Cleaner than threading it through URL params. |
| **Custom TTL** | Some sessions need 30-day TTL, some 5-minute TTL. Cookie storage lets us decide per-session. |
| **Shared cookies** | Auth cookie + session cookie on the same request — they should coexist without one overwriting the other. |

So we ship a thin cookie (and memory, and soon Redis) layer that
sits *alongside* `@nexusts/auth`. Users who don't need it pay no cost
(the entry point is separate). Users who need both call
`AuthService.bindSession(sessions)` to wire them up.

## 3. Architecture

```
┌──────────────────────────────────────────────────────────────┐
│                      User code                                │
│   ctx.session.get('cart') / .set('key', val)                   │
│   sessions.update(id, { dataPatch: { cart } })               │
└──────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌──────────────────────────────────────────────────────────────┐
│              @nexusts/session  (separate entry point)           │
│                                                              │
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────┐ │
│  │  SessionService  │  │ @Session  │  │  cookieName  │ │
│  │  (DI facade)      │  │ decorator        │  │  buildSet... │ │
│  └──────────────────┘  └──────────────────┘  └──────────────┘ │
│                              │                               │
│                              ▼                               │
│                    ┌──────────────────────┐                   │
│                    │   SessionStorage     │                   │
│                    │   (interface)        │                   │
│                    └──────────────────────┘                   │
│                              │                               │
│        ┌─────────────────────┼─────────────────────┐         │
│        ▼                     ▼                     ▼         │
│  ┌──────────┐          ┌──────────┐          ┌──────────┐    │
│  │  cookie  │          │ memory   │          │  redis   │    │
│  │(stateless│          │(in-proc) │          │ (v0.2)   │    │
│  │  HMAC)   │          │  + LRU   │          │          │    │
│  └──────────┘          └──────────┘          └──────────┘    │
└──────────────────────────────────────────────────────────────┘
                              │
                              ▼
            Auth integration: AuthService.bindSession(sessions)
                              │
                              ▼
                   ┌──────────────────────┐
                   │  @nexusts/auth (better-auth) │
                   │  user identity + DB sessions │
                   └──────────────────────┘
```

The facade (`SessionService`) is the only thing user code talks to.
Backends are swappable; changing `backend: 'cookie'` to `'memory'`
in `nx.config.ts` doesn't touch controllers.

## 4. Module separation

`@nexusts/session` is a separate entry point:

```json
"exports": {
  ".":       { ... },
  "./cli":   { ... },
  "./auth":  { ... },
  "./queue": { ... },
  "./schedule":{ ... },
  "./events": { ... },
  "./session":{ ... }
}
```

Build script bundles `src/session/index.ts` as its own artifact
under `dist/session/`. No peer deps for the cookie backend; Redis
backend (v0.2) requires `ioredis`.

## 5. The cookie format

```
Cookie value = base64url(payload) + "." + base64url(hmac)
```

- **payload** — `JSON.stringify(SessionRecord)`. The whole record,
  including `data`, `metadata`, timestamps.
- **hmac** — `HMAC-SHA256(secret, payload)`. Constant-time compared
  on decode via `crypto.timingSafeEqual`.

No session record is stored server-side. The cookie is the source
of truth. Stateless = edge-friendly.

```ts
const cookie = encodeSessionCookie(record, secret);
const decoded = decodeSessionCookie(cookie, secret);
// → record or null (on tamper / wrong secret / expired)
```

The expiry is checked after decode (`expiresAt.getTime() <= Date.now()`).
Tampering makes the HMAC mismatch; the wrong secret makes it match
the wrong HMAC. Both produce `null`.

## 6. SessionStorage interface

Every backend implements:

```ts
interface SessionStorage {
  readonly name: 'cookie' | 'memory' | 'redis' | 'database';
  create(opts): Promise<SessionRecord>;
  read(id): Promise<SessionRecord | null>;
  readMany(query?): Promise<SessionRecord[]>;
  update(id, opts): Promise<SessionRecord | null>;
  destroy(id): Promise<boolean>;
  destroyMany(query): Promise<number>;
  touch(id): Promise<SessionRecord | null>;
  gc(): Promise<number>;
  clear(): Promise<void>;
  stop?(): Promise<void>;
}
```

`read()` defaults to "sliding" expiry — touching a record extends its
`expiresAt`. Backends that can't update atomically (like cookie
storage, which is read-only) return `null` from `update()` and the
caller re-encodes the cookie with the new value.

## 7. Memory backend

LRU-evicting `Map`. `read()` refreshes `lastSeenAt` and the entry's
position. `gc()` runs on a `setInterval` (default 60s) and removes
expired entries. Max size 100,000 by default — older entries
evicted FIFO.

The interval is `unref()`-ed so tests don't keep Node alive.

## 8. Cookie backend

Stateless. `read()` returns `null` because there is no server-side
state. `decode(value)` and `encode(record)` are exposed for the
controller to set / clear cookies via `Set-Cookie`.

The cookie name and `SameSite` / `Secure` attributes come from the
config. Cross-origin SPAs use `sameSite: 'none'`, `secure: true`,
`crossSubDomainCookies: { enabled: true, domain: '.example.com' }`
to match better-auth's defaults.

## 9. AuthService integration

`AuthService.bindSession(svc)` sets a `SessionService` reference.
After binding, `AuthService.getSession()`:

1. Reads the session cookie via `svc.decodeCookie(...)`.
2. If a `userId` is present, queries better-auth for the user /
   session record (so the returned shape matches `AuthSession`).
3. Falls back to better-auth's own session lookup if no cookie
   session is present.

This way the session package is **type-only imported** by auth
(it's an optional peer). If you don't install it, nothing breaks.
If you do install it, you get cross-system session continuity.

```ts
import type { SessionService } from '../session/index.js';

@Injectable()
export class AuthService {
  #sessionService: SessionService | null = null;
  bindSession(svc: SessionService): this {
    this.#sessionService = svc;
    return this;
  }
}
```

`SessionService` is imported with `import type` only, so it's erased
at build time and doesn't appear in the auth bundle's runtime deps.

## 10. Session rotation

`SessionService.rotate(id)` is the session-fixation defense. After
authentication, the pre-auth id is replaced with a fresh one. The
old id becomes invalid. The user's data + metadata carry over.

This pattern is so important that we expose it as a one-liner
instead of a three-step create+update+destroy dance.

## 11. Events

Every state change emits:

| Kind | When |
| ---- | ---- |
| `session:created` | After `create()` |
| `session:read` | After `read()` |
| `session:updated` | After `update()` |
| `session:destroyed` | After `destroy()` / `destroyMany()` (with reason) |
| `session:expired` | When GC removes an expired entry |
| `session:rotated` | When `rotate()` swaps an id |

Listeners subscribe via `sessions.on(listener)`. The integration
point for analytics (Datadog / Prometheus), security audits, or
cache invalidation.

## 12. CLI integration

`nx make:session <Name>` generates:

- `src/session/services/<name>.session.ts` — `@Injectable` skeleton
  with typed accessor methods (`getCurrent`, `update`, `destroy`).

The template wraps methods in best-practice comments so the user
knows where to put their code.

## 13. DI integration

```
ApplicationContainer
  └── ConfiguredSessionModule (returned by SessionModule.forRoot(config))
        ├── SessionService
        ├── SessionService.TOKEN (useExisting alias)
        └── 'SESSION_CONFIG' (useValue)
```

Same pattern as `AuthModule`, `QueueModule`, `ScheduleModule`. The
service is registered under both tokens so users can inject with
either.

## 14. Testing

- **Unit tests** for `encodeSessionCookie` / `decodeSessionCookie`
  (round-trip, tampering, wrong secret, malformed cookie).
- **Unit tests** for `MemorySessionStorage` (CRUD, GC, LRU,
  query filtering).
- **Unit tests** for `CookieSessionStorage` (Set-Cookie header
  shape, secret validation, encode/decode round-trip).
- **Integration tests** for `SessionService` DI under both tokens.
- **Integration tests** for `AuthService.bindSession` + cookie
  round-trip.

## 15. Future work

- **Redis backend** — the most-requested backend. Same interface;
  wraps `ioredis` with `SETEX` + `GET` + pipelined `MGET` for
  `readMany`.
- **Database backend** — for Drizzle / Kysely users who already
  have a DB. (Better-auth's table can be reused.)
- **Distributed rotation** — when rotating on a multi-instance
  deploy, propagate the new id to all instances via pub/sub.
- **CSRF token integration** — automatically bind a CSRF token to
  the session and verify on form posts.
- **Flash middleware** — auto-pop `data.flash` and clear it on
  read, mirroring Rails / AdonisJS.

## 16. v0.2 changes

- **Renamed** `@CurrentSession` → `@Session` to match the
  short-form convention used by `@Req()` / `@Body()` / `@Ctx()`.
  The old name still works as a thin alias (deprecated, will be
  removed in v0.4).
- **Renamed** `CurrentSessionOptions` → `SessionOptions`.
- **Renamed** `BackendKind = 'redis'` v0.2 → 'redis' v0.3 (the Redis
  backend ships in v0.3, not v0.2).
- The auth-integration model is unchanged — `AuthService.bindSession()`
  still binds an optional `SessionService`.

## 17. See also

- [`session.md`](../user-guide/session.md) — user guide
- [`auth.md`](../user-guide/auth.md) — better-auth integration
- [`queue.md`](../user-guide/queue.md) — sibling design doc (same pattern)
- [iron-session](https://github.com/vvo/iron-session) — inspiration
