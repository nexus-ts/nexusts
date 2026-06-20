# Authentication · Session, JWT, OAuth, Passkey

> 한국어 버전: [`auth.ko.md`](./auth.ko.md)

NexusJS ships an auth module that wraps [`better-auth`](https://www.better-auth.com/),
giving you email/password, OAuth, JWT, and Passkey out of the box — all
adapted to NexusJS's DI / decorator model.

The auth module lives at `nexus/auth` and is **separate from `nexus/core`**.
It is added to the bundle as a separate entry point so consumers who don't
need it pay no cost.

---

## 1. Install

```bash
bun add nexus better-auth
# Better-auth also needs its peers; the CLI's `nx make:auth` will
# generate a .env.example with all required keys.
```

Generate a secret:

```bash
openssl rand -base64 32
```

Put it in `.env`:

```env
BETTER_AUTH_SECRET=<the-secret-you-generated>
BETTER_AUTH_URL=http://localhost:3000
```

---

## 2. Quick start (scaffold)

The fastest path:

```bash
bunx nx make:auth --provider github --jwt
```

This generates:

- `src/auth/auth.ts` — better-auth instance with the providers you asked for
- `.env.example` — every env var you need (with provider entries)

Then wire it up:

```ts
// src/app/app.module.ts
import { Module } from 'nexus';
import { AuthModule } from 'nexus/auth';

@Module({
  imports: [
    AuthModule.forRoot({
      emailAndPassword: { enabled: true },
      socialProviders: {
        github: {
          clientId: process.env.GITHUB_CLIENT_ID!,
          clientSecret: process.env.GITHUB_CLIENT_SECRET!,
        },
      },
      jwt: { enabled: true },
    }),
  ],
})
export class AppModule {}
```

Run:

```bash
bun --hot src/app/main.ts
```

That's it. The auth endpoints are now live at `/api/auth/*`.

---

## 3. What's wired up

`AuthModule.forRoot(config)` registers:

| Token | Provider | Use |
| ----- | -------- | --- |
| `AuthService` (class) | the service class | Nest-style DI |
| `AuthService.TOKEN` (Symbol) | same instance via `useExisting` | `@Inject(AuthService.TOKEN)` |
| `'AUTH_CONFIG'` | `useValue: config` | constructor injection |
| `AuthController` | registered controller | `/api/auth/*` routes |

The controller exposes:

| Method | Path | Purpose |
| ------ | ---- | ------- |
| GET | `/api/auth/session` | Current session (or null) |
| POST | `/api/auth/sign-up/email` | Email/password registration |
| POST | `/api/auth/sign-in/email` | Email/password login |
| POST | `/api/auth/sign-out` | Invalidate current session |
| GET | `/api/auth/sign-in/:provider` | Start OAuth flow |
| GET | `/api/auth/callback/:provider` | OAuth callback |
| POST | `/api/auth/jwt` | Issue JWT (requires JWT plugin) |
| POST | `/api/auth/passkey/register` | Start passkey registration |
| POST | `/api/auth/passkey/authenticate` | Complete passkey auth |

Better-auth's own catch-all handler (`auth.handler`) is also available
for any endpoints not covered by the controller.

---

## 4. Sessions

```ts
import { Inject } from 'nexus';
import { AuthService, CurrentUser } from 'nexus/auth';
import type { AuthUser } from 'nexus/auth';
import { Controller, Get, Req } from 'nexus';
import type { Context } from 'hono';

@Controller('/me')
export class MeController {
  constructor(@Inject(AuthService.TOKEN) private auth: AuthService) {}

  @Get('/')
  async me(@Req() c: Context) {
    const session = await this.auth.getSession({ headers: c.req.raw.headers });
    if (!session) return c.json({ user: null }, 401);
    return c.json(session);
  }
}
```

Or with the `@CurrentUser()` decorator:

```ts
@Get('/profile')
profile(@CurrentUser() user: AuthUser) {
  return user;
}
```

`@CurrentUser({ required: true })` returns 401 if no user is present —
the handler is never invoked.

---

## 5. JWT

Enable in `nx.config.ts` (or pass `jwt: { enabled: true }` to `forRoot`):

```ts
AuthModule.forRoot({
  jwt: {
    enabled: true,
    issuer: 'https://api.example.com',
    audience: 'https://example.com',
    expiresIn: 60 * 15, // 15 min
  },
});
```

Issue a token from a controller:

```ts
@Post('/token')
async token(@CurrentUser({ required: true }) user: AuthUser) {
  const { token, expiresAt } = await this.auth.issueJwt({ userId: user.id });
  return { token, expiresAt };
}
```

The JWKS endpoint is automatically exposed at `/api/auth/jwks`.

---

## 6. OAuth

```ts
AuthModule.forRoot({
  socialProviders: {
    github:    { clientId: '...', clientSecret: '...' },
    google:    { clientId: '...', clientSecret: '...' },
    discord:   { clientId: '...', clientSecret: '...' },
    microsoft: { clientId: '...', clientSecret: '...' },
    apple:     { clientId: '...', clientSecret: '...' },
  },
});
```

Flow:

1. Client hits `GET /api/auth/sign-in/github?callbackURL=/dashboard`.
2. Server returns the OAuth URL.
3. User authorizes on GitHub.
4. GitHub redirects to `GET /api/auth/callback/github?code=...`.
5. Better-auth exchanges the code, sets the session cookie.
6. User is redirected to `callbackURL`.

---

## 7. Passkey (WebAuthn)

```ts
AuthModule.forRoot({
  passkey: {
    enabled: true,
    rpName: 'My App',
    rpId:   'example.com',          // domain
    origin: ['https://example.com'],
  },
});
```

- `rpId` must be a registrable domain (no protocol).
- `origin` must use https in production.

Endpoints:

- `POST /api/auth/passkey/register` — start registration, returns challenge
- `POST /api/auth/passkey/authenticate` — finish with the credential

---

## 8. Middleware

The `authMiddleware` populates `c.var.user` and `c.var.session`:

```ts
import { Hono } from 'hono';
import { authMiddleware, type AuthVariables } from 'nexus/auth';
import { auth } from './auth.js';

const app = new Hono<{ Variables: AuthVariables }>();

// Optional: attach user/session to every request (no enforcement)
app.use('*', authMiddleware(auth, { mode: 'optional' }));

// Required: 401 on /protected/* when no session
app.use('/protected/*', authMiddleware(auth, { mode: 'required' }));

// Scoped: protect only certain paths
app.use(
  '*',
  authMiddleware(auth, {
    mode: 'scoped',
    protectedPaths: ['^/api/secure', '^/admin'],
  }),
);

// Skip auth entirely on certain paths (e.g. health checks)
app.use(
  '*',
  authMiddleware(auth, {
    mode: 'required',
    ignoredPaths: ['^/health$', '^/metrics$'],
  }),
);
```

Type-augmented `c.var.user` / `c.var.session` works automatically when
you use `Hono<{ Variables: AuthVariables }>`.

---

## 9. Custom endpoints

The `AuthService` exposes the higher-level operations:

```ts
class SignupController {
  constructor(@Inject(AuthService.TOKEN) private auth: AuthService) {}

  @Post('/register')
  async register(@Body() body: SignupDto) {
    const result = await this.auth.signUp({
      email: body.email,
      password: body.password,
      name: body.name,
    });
    return this.auth.redirect('/onboarding', 303);
  }
}
```

Methods on `AuthService`:

- `getSession({ headers })` → `AuthSession | null`
- `signUp({ email, password, name, ... })`
- `signIn({ email, password, callbackURL? })`
- `signOut({ headers })`
- `getOAuthUrl({ provider, callbackURL? })`
- `handleOAuthCallback({ headers, query })`
- `issueJwt({ userId })` (JWT plugin only)
- `registerPasskey({ headers })` (passkey plugin only)
- `authenticatePasskey({ headers, body })` (passkey plugin only)
- `redirect(to, status?)` — `Response` with `Location` header
- `toContextVariables(session)` — for `c.var` typing

---

## 10. Cookies & CORS

For cross-origin SPAs (e.g. Vite on `:3001`, API on `:3000`):

```ts
AuthModule.forRoot({
  cookieSameSite: 'none',         // cross-site
  cookieSecure: true,              // https
  cookieDomain: '.example.com',    // for subdomains
  crossSubDomainCookies: {
    enabled: true,
    domain: '.example.com',
  },
});
```

Mount CORS **before** the auth handler:

```ts
import { cors } from 'hono/cors';

app.use('/api/auth/*', cors({
  origin: 'http://localhost:3001',
  credentials: true,
  allowHeaders: ['Content-Type', 'Authorization'],
}));

app.all('/api/auth/*', authHandler(auth));
```

---

## 11. Database

Better-auth persists users + sessions. Configure via the `database`
option in `createAuth()`:

```ts
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { db } from './db';

export const auth = createAuth({
  database: drizzleAdapter(db, { provider: 'sqlite' }),
  // ...
});
```

For a full list of adapters, see
[better-auth databases](https://www.better-auth.com/docs/adapters/other-relational-databases).

---

## 12. Testing

The auth module is unit-testable. Inject a mock:

```ts
import { AuthService } from 'nexus/auth';

const mockAuth = {
  getSession: async () => ({ user: { id: '1' }, session: { id: 's' } }),
  signIn: async () => ({ user: { id: '1' } }),
  // ...
} as unknown as AuthService;

// Override the provider in your test module
@Module({
  providers: [{ provide: AuthService.TOKEN, useValue: mockAuth }],
})
class TestModule {}
```

---

## 13. CLI: `nx make:auth`

The CLI scaffolds a working auth setup:

```bash
nx make:auth --provider github --jwt
nx make:auth --provider github,google,discord --jwt --passkey --rp-id example.com
```

Flags:

| Flag | Effect |
| ---- | ------ |
| `--provider <list>` | Comma-separated OAuth providers |
| `--jwt` | Enable the JWT plugin |
| `--passkey` | Enable the Passkey plugin |
| `--rp-id <id>` | Passkey RP ID (default: `localhost`) |
| `--rp-name <name>` | Passkey RP display name |
| `--origin <url>` | Passkey origin |

Generates `src/auth/auth.ts` and `.env.example`, then prints wiring
instructions.

---

## 14. Known issues

- **Vitest + better-auth zod conflict.** Better-auth pulls in
  `zod v4` via `@better-auth/core`. When running tests in the same
  process as tests that import the top-level `zod` (v3), you may see
  `TypeError: undefined is not an object (evaluating 'z.object')`.
  Workaround: run auth tests separately
  (`bunx vitest run tests/auth/`), or upgrade the project to `zod v4`.
  See [`../design/auth.md`](../design/auth.md) for the full diagnosis.

---

## 15. See also

- [`../design/auth.md`](../design/auth.md) — architecture, decisions
- [Better-auth docs](https://www.better-auth.com/docs/installation)
- [`./controllers.md`](./controllers.md) — how `@CurrentUser()` plugs into controllers
- [`./dependency-injection.md`](./dependency-injection.md) — `AuthModule.forRoot()` and DI
