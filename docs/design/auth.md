# Auth Module Design

> 한국어 버전: [`auth.ko.md`](./auth.ko.md)

## 1. Goal

Provide session, JWT, OAuth, and passkey authentication out of the box
**without** rolling our own crypto, password hashing, OAuth dance, or
WebAuthn ceremony. The `@nexusts/auth` module wraps
[`better-auth`](https://www.better-auth.com/) — a TypeScript-native
auth library with first-class Hono integration — and adapts it to
NexusTS's DI / decorator model.

## 2. Why better-auth (not roll-your-own)?

| Concern | Roll-your-own | better-auth |
| ------- | ------------- | ----------- |
| Password hashing | bcrypt/argon2 manual | argon2id, automatic |
| OAuth dance | 200+ lines per provider | ~10 lines per provider |
| WebAuthn / Passkey | complex ceremony | first-class plugin |
| Session token rotation | easy to get wrong | done for you |
| Email verification | manual email templates | built-in |
| Account linking | rewrite from scratch | built-in |
| Plugin system | n/a | drop-in plugins |

Better-auth has a Hono integration doc, TypeScript-native API, and a
plugin system for the things we care about (JWT, Passkey). Reusing it
saves ~3,000 lines of security-sensitive code we'd otherwise have to
maintain.

## 3. Architecture

```
┌──────────────────────────────────────────────────────────────┐
│                      User code                                │
│   @Controller('/me')    @CurrentUser()    auth.handler        │
└──────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌──────────────────────────────────────────────────────────────┐
│            @nexusts/auth  (separate entry point)                │
│                                                              │
│  ┌────────────────┐  ┌────────────────┐  ┌───────────────┐  │
│  │ AuthService    │  │ AuthController │  │ authMiddleware│  │
│  │ (DI wrapper)   │  │ (/api/auth/*)  │  │ c.var.user    │  │
│  └────────────────┘  └────────────────┘  └───────────────┘  │
│            │                  │                  │            │
│            └──────────────────┼──────────────────┘            │
│                               ▼                               │
│                  ┌──────────────────────┐                    │
│                  │  AuthModule.forRoot()│                    │
│                  │  builds instance +   │                    │
│                  │  registers everything │                    │
│                  └──────────────────────┘                    │
└──────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌──────────────────────────────────────────────────────────────┐
│                       better-auth                             │
│   betterAuth({...})   →   auth.handler / auth.api            │
│   + jwt plugin   + passkey plugin   + socialProviders         │
└──────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌──────────────────────────────────────────────────────────────┐
│                       Runtime                                  │
│   Hono context (c.var.user / c.var.session)                  │
│   cookies / headers / database (drizzle, prisma, ...)        │
└──────────────────────────────────────────────────────────────┘
```

The auth module sits **between** user code and better-auth. It:

1. Translates the user's `AuthConfig` (NexusTS-shaped) into
   better-auth's option object.
2. Provides a DI-friendly `AuthService` so controllers can call
   `signUp` / `signIn` / `issueJwt` without knowing better-auth's API.
3. Provides `authMiddleware` that populates `c.var.user` /
   `c.var.session` from the request.
4. Provides `authHandler` to mount better-auth's catch-all.
5. Provides `@CurrentUser()` so controllers don't need to call
   `getSession` themselves.

## 4. Module separation

`@nexusts/auth` is a **separate entry point** in `package.json`:

```json
"exports": {
  ".":               { ... },
  "./cli":           { ... },
  "./auth":          { ... }
}
```

Build script (`build.ts`) bundles `src/auth/index.ts` as its own
artifact under `dist/auth/`. Consumers who don't use auth pay no
bundle-size cost.

At runtime, the auth module imports from `better-auth`. We don't
re-export better-auth; users who need low-level access can import it
directly.

## 5. DI integration

```
ApplicationContainer
  ├── UserModule
  │     └── ...
  └── ConfiguredAuthModule (returned by AuthModule.forRoot(config))
        ├── AuthController  (registers /api/auth/*)
        ├── AuthService     (the wrapper)
        ├── AuthService.TOKEN (Symbol alias)
        └── 'AUTH_CONFIG'  (useValue: config)
```

`AuthService.TOKEN` is a Symbol so it doesn't collide with class
tokens. The `useExisting` alias binds it to the same instance as the
class token, so consumers can use either:

```ts
@Inject(AuthService) declare auth: AuthService;
@Inject(AuthService.TOKEN) declare auth: AuthService;
```

Both work and return the same instance.

## 6. Configuration shape

User-facing config is intentionally simple — a flat object that maps
1:1 onto better-auth options:

```ts
interface AuthConfig {
  basePath?: string;
  emailAndPassword?: { enabled?: boolean; requireEmailVerification?: boolean; ... };
  socialProviders?: Record<string, { clientId: string; clientSecret: string }>;
  jwt?: { enabled: boolean; jwksPath?: string; ... };
  passkey?: { enabled: boolean; rpName: string; rpId: string; origin: string | string[] };
  sessionExpiresInSeconds?: number;
  cookieDomain?: string;
  crossSubDomainCookies?: { enabled: boolean; domain?: string };
  cookieSameSite?: 'lax' | 'strict' | 'none';
  cookieSecure?: boolean;
  secret?: string;     // defaults to process.env.BETTER_AUTH_SECRET
  baseUrl?: string;    // defaults to process.env.BETTER_AUTH_URL
}
```

`createAuth(config)` reads `BETTER_AUTH_SECRET` and `BETTER_AUTH_URL`
from env when not provided. This mirrors better-auth's expectations.

The CLI's `nx.config.ts` has an `auth` section that's parsed by the
CLI into the same shape. Decoupling the user's `nx.config.ts` from
better-auth's API means a better-auth upgrade can change internals
without touching user config.

## 7. Session strategy

| Cookie attribute | Default | Use |
| ---------------- | ------- | --- |
| `SameSite`       | `lax`   | Same-site requests + top-level navigations |
| `Secure`         | true in production | HTTPS only |
| `Domain`         | unset   | Current host only |
| `Path`           | `/`     | All routes |

For cross-origin SPAs (Vite on `:3001`, API on `:3000`), users set:

```ts
cookieSameSite: 'none',
cookieSecure: true,
cookieDomain: '.example.com',
```

Better-auth handles the rest — including `__Host-` cookie namespacing
when needed.

## 8. Token model

| Token | Lifetime | Storage | Issued by |
| ----- | -------- | ------- | --------- |
| Session cookie | 7 days (configurable) | HTTP-only cookie | better-auth on sign-in |
| Session row | matches cookie | DB | better-auth on sign-in |
| JWT (Bearer) | 15 min (configurable) | `Authorization` header | `auth.issueJwt()` |
| Passkey credential | permanent | Public key in DB | `auth.registerPasskey()` |

JWTs are **secondary** to sessions. They're useful for service-to-service
calls or short-lived tokens where cookie-based sessions don't work.

## 9. OAuth flow

1. **Client** redirects to `GET /api/auth/sign-in/github?callbackURL=/dashboard`.
2. **Server** returns `{ url: 'https://github.com/...' }`.
3. **Client** redirects the browser to that URL.
4. **GitHub** authenticates the user and redirects to
   `GET /api/auth/callback/github?code=...`.
5. **Server** (better-auth) exchanges the code, fetches the user,
   creates a session row, sets the session cookie.
6. **Browser** follows the cookie to the original request URL.

`AuthService.getOAuthUrl` and `AuthService.handleOAuthCallback` are
the two halves of this dance, exposed for custom flows.

## 10. Passkey flow

1. **Client** calls `POST /api/auth/passkey/register`. Server returns
   a challenge.
2. **Client** invokes `navigator.credentials.create()` with the challenge.
3. **Client** sends the resulting credential back to
   `POST /api/auth/passkey/register` (verify-and-store).
4. **Server** stores the public key + credential ID.

Authentication:

1. **Client** calls `POST /api/auth/passkey/authenticate` to start.
   Server returns a challenge.
2. **Client** invokes `navigator.credentials.get()` with the challenge.
3. **Client** sends the assertion to
   `POST /api/auth/passkey/authenticate`. Server verifies the
   signature against the stored public key, creates a session.

The `passkey` plugin in better-auth implements this ceremony.

## 11. Cookies / CORS

For a SPA on a different origin:

```ts
import { cors } from 'hono/cors';
import { authMiddleware } from '@nexusts/auth';

// 1. CORS first
app.use('/api/auth/*', cors({
  origin: 'http://localhost:3001',
  credentials: true,
  allowHeaders: ['Content-Type', 'Authorization'],
}));

// 2. Auth catch-all
app.all('/api/auth/*', authHandler(auth));

// 3. Middleware populates c.var.user / c.var.session
app.use('*', authMiddleware(auth, { mode: 'optional' }));
```

The auth module exports `authHandler` for step 2 so users don't have to
write `app.on(['POST', 'GET'], ...)` boilerplate.

## 12. Type safety

`AuthUser`, `AuthSession`, `AuthSessionRecord` are re-defined locally
(rather than re-exported from better-auth) so we can:

- Keep our public surface stable across better-auth upgrades.
- Add fields (`AuthVariables.user` / `session`) that users type-augment
  their Hono context with.
- Document the shape in one place.

`c.var.user` and `c.var.session` are typed via `AuthVariables`:

```ts
import type { AuthVariables } from '@nexusts/auth';
const app = new Hono<{ Variables: AuthVariables }>();
```

## 13. Testing strategy

- **Unit tests** for `createAuth` — config validation, defaults, env
  fallback.
- **Integration tests** for `AuthService` — DI resolution,
  `getSession`, `redirect`.
- **Middleware tests** for `authMiddleware` — required vs optional,
  ignored paths.
- **HTTP tests** for `AuthController` — `/api/auth/session` returns 200
  with `user=null` for unauthenticated requests.

We don't test better-auth itself — that's their responsibility.

For controller tests that use `AuthService`, mock the service and
inject via DI:

```ts
@Module({
  providers: [{ provide: AuthService.TOKEN, useValue: mockAuth }],
})
class TestModule {}
```

## 14. Known issues

### Vitest + zod race condition

Better-auth pulls in `zod v4` via `@better-auth/core`. When the test
suite runs both auth tests (which import `better-auth`) and the
existing validator tests (which import the top-level `zod` v3) in the
same process, `z.object` can become `undefined` due to module init
race conditions.

**Workarounds:**

- Run auth tests in isolation: `bunx vitest run tests/auth/`.
- Upgrade the project to `zod v4`.

A full fix (upgrading to `zod v4` or pinning the resolution) is tracked
separately.

## 15. Future work

- **Magic links** — better-auth supports this; just needs a CLI flag.
- **Two-factor auth** — better-auth has a 2FA plugin.
- **Account linking UI** — better-auth exposes endpoints; we wrap them
  in NexusTS controllers.
- **Rate limiting** — wrap better-auth's hooks.
- **Audit log** — better-auth emits events; we surface them to
  NexusTS's event system (v0.2).

## 16. See also

- [`auth.md`](../user-guide/auth.md) — user-facing guide
- [Better-auth docs](https://www.better-auth.com/docs/installation)
- [`di-container.md`](./di-container.md) — how `useExisting` works
