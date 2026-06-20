# 인증 · Session, JWT, OAuth, Passkey

> English version: [`auth.md`](./auth.md)

NexusJS는 [`better-auth`](https://www.better-auth.com/)를 감싸는 auth 모듈을 제공하여
이메일/비밀번호, OAuth, JWT, Passkey를 즉시 사용할 수 있게 합니다 — 모두 NexusJS의 DI / 데코레이터 모델에 맞게 조정되었습니다.

auth 모듈은 `nexus/auth`에 살고 **`nexus/core`와 분리**되어 있습니다. 별도 진입점으로 번들되므로필요 없는 소비자는 비용을 지불하지 않습니다.

---

## 1. 설치

```bash
bun add nexus better-auth
# Better-auth는 peer 의존성도 필요합니다; CLI의 `nx make:auth`는
# 모든 필수 키가 포함된 .env.example을 생성합니다.
```

시크릿 생성:

```bash
openssl rand -base64 32
```

`.env`에 추가:

```env
BETTER_AUTH_SECRET=<생성한-시크릿>
BETTER_AUTH_URL=http://localhost:3000
```

---

## 2. 빠른 시작 (scaffold)

가장 빠른 경로:

```bash
bunx nx make:auth --provider github --jwt
```

이 명령은 다음을 생성합니다.

- `src/auth/auth.ts` — 요청한 프로바이더가 포함된 better-auth 인스턴스
- `.env.example` — 필요한 모든 env 변수 (프로바이더 항목 포함)

그 다음 연결:

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

실행:

```bash
bun --hot src/app/main.ts
```

이것으로 끝입니다. auth 엔드포인트가 `/api/auth/*`에서 살아있습니다.

---

## 3. 무엇이 와이어업 되는가

`AuthModule.forRoot(config)`는 다음을 등록합니다.

| 토큰 | 프로바이더 | 용도 |
| ----- | -------- | --- |
| `AuthService` (class) | 서비스 클래스 | Nest 스타일 DI |
| `AuthService.TOKEN` (Symbol) | `useExisting`으로 같은 인스턴스 | `@Inject(AuthService.TOKEN)` |
| `'AUTH_CONFIG'` | `useValue: config` | 생성자 주입 |
| `AuthController` | 등록된 컨트롤러 | `/api/auth/*` 라우트 |

컨트롤러가 노출하는 것:

| 메서드 | 경로 | 목적 |
| ------ | ---- | ------- |
| GET | `/api/auth/session` | 현재 세션 (또는 null) |
| POST | `/api/auth/sign-up/email` | 이메일/비밀번호 등록 |
| POST | `/api/auth/sign-in/email` | 이메일/비밀번호 로그인 |
| POST | `/api/auth/sign-out` | 현재 세션 무효화 |
| GET | `/api/auth/sign-in/:provider` | OAuth 흐름 시작 |
| GET | `/api/auth/callback/:provider` | OAuth 콜백 |
| POST | `/api/auth/jwt` | JWT 발급 (JWT 플러그인 필요) |
| POST | `/api/auth/passkey/register` | Passkey 등록 시작 |
| POST | `/api/auth/passkey/authenticate` | Passkey 인증 완료 |

better-auth 자체의 catch-all 핸들러(`auth.handler`)도 컨트롤러가 커버하지 않는 모든 엔드포인트에 사용할 수 있습니다.

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

또는 `@CurrentUser()` 데코레이터 사용:

```ts
@Get('/profile')
profile(@CurrentUser() user: AuthUser) {
  return user;
}
```

`@CurrentUser({ required: true })`은 사용자가 없으면 401을 반환합니다 — 핸들러는 호출되지 않습니다.

---

## 5. JWT

`nx.config.ts`에서 활성화 (또는 `forRoot`에 `jwt: { enabled: true }` 전달):

```ts
AuthModule.forRoot({
  jwt: {
    enabled: true,
    issuer: 'https://api.example.com',
    audience: 'https://example.com',
    expiresIn: 60 * 15, // 15분
  },
});
```

컨트롤러에서 토큰 발급:

```ts
@Post('/token')
async token(@CurrentUser({ required: true }) user: AuthUser) {
  const { token, expiresAt } = await this.auth.issueJwt({ userId: user.id });
  return { token, expiresAt };
}
```

JWKS 엔드포인트가 `/api/auth/jwks`에 자동으로 노출됩니다.

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

흐름:

1. 클라이언트가 `GET /api/auth/sign-in/github?callbackURL=/dashboard`를 호출.
2. 서버가 OAuth URL을 반환.
3. 사용자가 GitHub에서 권한 부여.
4. GitHub이 `GET /api/auth/callback/github?code=...`로 리다이렉트.
5. better-auth가 코드를 교환하고 세션 쿠키를 설정.
6. 사용자가 `callbackURL`로 리다이렉트됨.

---

## 7. Passkey (WebAuthn)

```ts
AuthModule.forRoot({
  passkey: {
    enabled: true,
    rpName: 'My App',
    rpId:   'example.com',          // 도메인
    origin: ['https://example.com'],
  },
});
```

- `rpId`는 등록 가능한 도메인이어야 합니다 (프로토콜 없음).
- `origin`은 프로덕션에서 https를 사용해야 합니다.

엔드포인트:

- `POST /api/auth/passkey/register` — 등록 시작, challenge 반환
- `POST /api/auth/passkey/authenticate` — credential로 완료

---

## 8. 미들웨어

`authMiddleware`는 `c.var.user`와 `c.var.session`을 채웁니다.

```ts
import { Hono } from 'hono';
import { authMiddleware, type AuthVariables } from 'nexus/auth';
import { auth } from './auth.js';

const app = new Hono<{ Variables: AuthVariables }>();

// Optional: 모든 요청에 user/session 부착 (강제하지 않음)
app.use('*', authMiddleware(auth, { mode: 'optional' }));

// Required: /protected/*에 세션이 없으면 401
app.use('/protected/*', authMiddleware(auth, { mode: 'required' }));

// Scoped: 특정 경로만 보호
app.use(
  '*',
  authMiddleware(auth, {
    mode: 'scoped',
    protectedPaths: ['^/api/secure', '^/admin'],
  }),
);

// 특정 경로에서 auth 완전 건너뜀 (예: health check)
app.use(
  '*',
  authMiddleware(auth, {
    mode: 'required',
    ignoredPaths: ['^/health$', '^/metrics$'],
  }),
);
```

`Hono<{ Variables: AuthVariables }>`를 사용하면 타입이 확장된 `c.var.user` / `c.var.session`이 자동으로 동작합니다.

---

## 9. 커스텀 엔드포인트

`AuthService`는 상위 수준 작업을 노출합니다.

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

`AuthService`의 메서드:

- `getSession({ headers })` → `AuthSession | null`
- `signUp({ email, password, name, ... })`
- `signIn({ email, password, callbackURL? })`
- `signOut({ headers })`
- `getOAuthUrl({ provider, callbackURL? })`
- `handleOAuthCallback({ headers, query })`
- `issueJwt({ userId })` (JWT 플러그인만)
- `registerPasskey({ headers })` (passkey 플러그인만)
- `authenticatePasskey({ headers, body })` (passkey 플러그인만)
- `redirect(to, status?)` — `Location` 헤더를 가진 `Response`
- `toContextVariables(session)` — `c.var` 타이핑용

---

## 10. 쿠키 & CORS

크로스 오리진 SPA용 (예: Vite는 `:3001`, API는 `:3000`):

```ts
AuthModule.forRoot({
  cookieSameSite: 'none',         // cross-site
  cookieSecure: true,              // https
  cookieDomain: '.example.com',    // 서브도메인용
  crossSubDomainCookies: {
    enabled: true,
    domain: '.example.com',
  },
});
```

auth 핸들러 **전에** CORS를 마운트:

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

## 11. 데이터베이스

better-auth는 사용자 + 세션을 영구 저장합니다. `createAuth()`의 `database` 옵션으로 설정:

```ts
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { db } from './db';

export const auth = createAuth({
  database: drizzleAdapter(db, { provider: 'sqlite' }),
  // ...
});
```

전체 어댑터 목록은 [better-auth databases](https://www.better-auth.com/docs/adapters/other-relational-databases) 참조.

---

## 12. 테스트

auth 모듈은 단위 테스트 가능합니다. mock 주입:

```ts
import { AuthService } from 'nexus/auth';

const mockAuth = {
  getSession: async () => ({ user: { id: '1' }, session: { id: 's' } }),
  signIn: async () => ({ user: { id: '1' } }),
  // ...
} as unknown as AuthService;

// 테스트 모듈에서 프로바이더 오버라이드
@Module({
  providers: [{ provide: AuthService.TOKEN, useValue: mockAuth }],
})
class TestModule {}
```

---

## 13. CLI: `nx make:auth`

CLI가 동작하는 auth 설정을 scaffold합니다.

```bash
nx make:auth --provider github --jwt
nx make:auth --provider github,google,discord --jwt --passkey --rp-id example.com
```

플래그:

| 플래그 | 효과 |
| ---- | ------ |
| `--provider <list>` | 쉼표 구분 OAuth 프로바이더 |
| `--jwt` | JWT 플러그인 활성화 |
| `--passkey` | Passkey 플러그인 활성화 |
| `--rp-id <id>` | Passkey RP ID (기본값: `localhost`) |
| `--rp-name <name>` | Passkey RP 표시 이름 |
| `--origin <url>` | Passkey origin |

`src/auth/auth.ts`와 `.env.example`을 생성한 다음 연결 지침을 출력합니다.

---

## 14. 알려진 이슈

- **Vitest + better-auth zod 충돌.** better-auth가 `@better-auth/core`를 통해
  `zod v4`를 가져옵니다. 최상위 `zod`(v3)를 import하는 테스트와 같은 프로세스에서
  실행하면 `TypeError: undefined is not an object (evaluating 'z.object')`가
  발생할 수 있습니다. 우회: auth 테스트를 별도로 실행
  (`bunx vitest run tests/auth/`), 또는 프로젝트를 `zod v4`로 업그레이드.
  자세한 진단은 [`../design/auth.md`](../design/auth.md) 참조.

---

## 15. 참고

- [`../design/auth.md`](../design/auth.md) — 아키텍처, 결정
- [Better-auth 문서](https://www.better-auth.com/docs/installation)
- [`./controllers.md`](./controllers.md) — `@CurrentUser()`가 컨트롤러에 연결되는 방식
- [`./dependency-injection.md`](./dependency-injection.md) — `AuthModule.forRoot()`와 DI
