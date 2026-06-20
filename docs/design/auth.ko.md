# Auth 모듈 설계

> 최종 업데이트: v0.1
> English version: [`auth.md`](./auth.md)

## 1. 목표

직접 작성한 crypto, 비밀번호 해싱, OAuth 댄스, WebAuthn 의식 없이도 세션, JWT, OAuth, 패스키 인증을 즉시 제공한다. `nexus/auth` 모듈은 [`better-auth`](https://www.better-auth.com/)를 감싼다 — Hono 통합을 일급으로 지원하는 TypeScript 네이티브 auth 라이브러리 — 그리고 NexusJS의 DI / 데코레이터 모델에 맞춘다.

## 2. 왜 better-auth인가? (직접 작성 X)

| 관심사 | 직접 작성 | better-auth |
| ------- | ------------- | ----------- |
| 비밀번호 해싱 | bcrypt/argon2 수동 | argon2id, 자동 |
| OAuth 댄스 | 프로바이더당 200+ 줄 | 프로바이더당 ~10 줄 |
| WebAuthn / 패스키 | 복잡한 의식 | 일급 플러그인 |
| 세션 토큰 회전 | 잘못하기 쉬움 | 자동으로 처리 |
| 이메일 인증 | 수동 이메일 템플릿 | 내장 |
| 계정 연결 | 처음부터 다시 작성 | 내장 |
| 플러그인 시스템 | n/a | 드롭인 플러그인 |

better-auth는 Hono 통합 문서, TypeScript 네이티브 API, 그리고 우리가 관심 있는 것들(JWT, 패스키)을 위한 플러그인 시스템을 가지고 있다. 이를 재사용하면 우리가 유지보수해야 할 약 3,000 줄의 보안 민감 코드를 절약할 수 있다.

## 3. 아키텍처

```
┌──────────────────────────────────────────────────────────────┐
│                      사용자 코드                              │
│   @Controller('/me')    @CurrentUser()    auth.handler        │
└──────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌──────────────────────────────────────────────────────────────┐
│            nexus/auth  (별도 진입점)                          │
│                                                              │
│  ┌────────────────┐  ┌────────────────┐  ┌───────────────┐  │
│  │ AuthService    │  │ AuthController │  │ authMiddleware│  │
│  │ (DI 래퍼)      │  │ (/api/auth/*)  │  │ c.var.user    │  │
│  └────────────────┘  └────────────────┘  └───────────────┘  │
│            │                  │                  │            │
│            └──────────────────┼──────────────────┘            │
│                               ▼                               │
│                  ┌──────────────────────┐                    │
│                  │  AuthModule.forRoot()│                    │
│                  │  인스턴스 빌드 +       │                    │
│                  │  모두 등록             │                    │
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
│                       런타임                                  │
│   Hono context (c.var.user / c.var.session)                  │
│   cookies / headers / database (drizzle, prisma, ...)        │
└──────────────────────────────────────────────────────────────┘
```

auth 모듈은 사용자 코드와 better-auth **사이에** 있다. 다음과 같이 한다.

1. 사용자의 `AuthConfig`(NexusJS 형상)를 better-auth 옵션 객체로 변환.
2. DI 친화적인 `AuthService`를 제공하여 컨트롤러가 better-auth API를 모르고도
   `signUp` / `signIn` / `issueJwt`를 호출할 수 있게 한다.
3. 요청에서 `c.var.user` / `c.var.session`을 채우는 `authMiddleware` 제공.
4. better-auth의 catch-all을 마운트하는 `authHandler` 제공.
5. 컨트롤러가 `getSession`을 직접 호출할 필요 없는 `@CurrentUser()` 제공.

## 4. 모듈 분리

`nexus/auth`는 `package.json`에서 **별도 진입점**이다.

```json
"exports": {
  ".":               { ... },
  "./cli":           { ... },
  "./auth":          { ... }
}
```

빌드 스크립트(`build.ts`)는 `src/auth/index.ts`를 `dist/auth/` 아래 자체 아티팩트로 번들한다. auth를 사용하지 않는 소비자는 번들 크기 비용을 지불하지 않는다.

런타임에 auth 모듈은 `better-auth`를 import한다. 우리는 better-auth를 재export하지 않는다. 저수준 접근이 필요한 사용자는 직접 import할 수 있다.

## 5. DI 통합

```
ApplicationContainer
  ├── UserModule
  │     └── ...
  └── ConfiguredAuthModule (AuthModule.forRoot(config)가 반환)
        ├── AuthController  (/api/auth/* 등록)
        ├── AuthService     (래퍼)
        ├── AuthService.TOKEN (Symbol 별칭)
        └── 'AUTH_CONFIG'  (useValue: config)
```

`AuthService.TOKEN`은 Symbol이므로 클래스 토큰과 충돌하지 않는다. `useExisting` 별칭이 이를 클래스 토큰과 같은 인스턴스로 묶어 소비자가 어느 쪽이든 사용할 수 있게 한다.

```ts
constructor(@Inject(AuthService) private auth: AuthService) {}
constructor(@Inject(AuthService.TOKEN) private auth: AuthService) {}
```

둘 다 동작하며 같은 인스턴스를 반환한다.

## 6. 설정 형상

사용자 대상 설정은 의도적으로 단순하다 — better-auth 옵션에 1:1로 매핑되는 평면 객체.

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
  secret?: string;     // 기본값은 process.env.BETTER_AUTH_SECRET
  baseUrl?: string;    // 기본값은 process.env.BETTER_AUTH_URL
}
```

`createAuth(config)`는 제공되지 않으면 `BETTER_AUTH_SECRET`와 `BETTER_AUTH_URL`을 env에서 읽는다. 이는 better-auth의 기대와 일치한다.

CLI의 `nx.config.ts`는 같은 형상으로 CLI에 의해 파싱되는 `auth` 섹션을 가진다. better-auth 업그레이드가 사용자 설정을 건드리지 않고 내부를 변경할 수 있도록 사용자의 `nx.config.ts`를 better-auth API에서 분리한다.

## 7. 세션 전략

| 쿠키 속성 | 기본값 | 사용 |
| ---------------- | ------- | --- |
| `SameSite`       | `lax`   | Same-site 요청 + 최상위 네비게이션 |
| `Secure`         | 프로덕션에서 true | HTTPS 전용 |
| `Domain`         | 미설정  | 현재 호스트만 |
| `Path`           | `/`     | 모든 라우트 |

크로스 오리진 SPA용(Vite `:3001`, API `:3000`) 사용자는 다음을 설정:

```ts
cookieSameSite: 'none',
cookieSecure: true,
cookieDomain: '.example.com',
```

better-auth가 나머지를 처리한다 — 필요할 때 `__Host-` 쿠키 네임스페이싱 포함.

## 8. 토큰 모델

| 토큰 | 수명 | 저장 | 발급자 |
| ----- | -------- | ------- | --------- |
| 세션 쿠키 | 7일 (설정 가능) | HTTP-only 쿠키 | 로그인 시 better-auth |
| 세션 행 | 쿠키와 일치 | DB | 로그인 시 better-auth |
| JWT (Bearer) | 15분 (설정 가능) | `Authorization` 헤더 | `auth.issueJwt()` |
| 패스키 credential | 영구 | DB의 공개 키 | `auth.registerPasskey()` |

JWT는 세션에 **보조**이다. 쿠키 기반 세션이 작동하지 않는 서비스 간 호출이나 단명 토큰에 유용하다.

## 9. OAuth 흐름

1. **클라이언트**가 `GET /api/auth/sign-in/github?callbackURL=/dashboard`로 리다이렉트.
2. **서버**가 `{ url: 'https://github.com/...' }`를 반환.
3. **클라이언트**가 브라우저를 해당 URL로 리다이렉트.
4. **GitHub**이 사용자를 인증하고 `GET /api/auth/callback/github?code=...`로 리다이렉트.
5. **서버**(better-auth)가 코드를 교환하고, 사용자를 가져오고, 세션 행을 생성하고, 세션 쿠키를 설정.
6. **브라우저**가 쿠키를 따라 원래 요청 URL로 이동.

`AuthService.getOAuthUrl`과 `AuthService.handleOAuthCallback`은 이 댄스의 두 반쪽으로, 커스텀 흐름을 위해 노출된다.

## 10. 패스키 흐름

1. **클라이언트**가 `POST /api/auth/passkey/register`를 호출. 서버가 challenge를 반환.
2. **클라이언트**가 challenge로 `navigator.credentials.create()`를 호출.
3. **클라이언트**가 결과 credential을 다시 `POST /api/auth/passkey/register`로 전송 (검증 및 저장).
4. **서버**가 공개 키 + credential ID를 저장.

인증:

1. **클라이언트**가 `POST /api/auth/passkey/authenticate`를 호출하여 시작. 서버가 challenge를 반환.
2. **클라이언트**가 challenge로 `navigator.credentials.get()`를 호출.
3. **클라이언트**가 assertion을 `POST /api/auth/passkey/authenticate`로 전송. 서버가 저장된 공개 키에 대해 서명을 검증하고 세션을 생성.

better-auth의 `passkey` 플러그인이 이 의식을 구현한다.

## 11. 쿠키 / CORS

다른 origin의 SPA용:

```ts
import { cors } from 'hono/cors';
import { authMiddleware } from 'nexus/auth';

// 1. CORS 먼저
app.use('/api/auth/*', cors({
  origin: 'http://localhost:3001',
  credentials: true,
  allowHeaders: ['Content-Type', 'Authorization'],
}));

// 2. Auth catch-all
app.all('/api/auth/*', authHandler(auth));

// 3. 미들웨어가 c.var.user / c.var.session 채움
app.use('*', authMiddleware(auth, { mode: 'optional' }));
```

auth 모듈은 사용자가 `app.on(['POST', 'GET'], ...)` 보일러플레이트를 작성할 필요 없도록 2단계에 `authHandler`를 export한다.

## 12. 타입 안전성

`AuthUser`, `AuthSession`, `AuthSessionRecord`는 better-auth에서 재export하지 않고 로컬에서 재정의된다. 다음과 같은 이유로:

- better-auth 업그레이드에 걸쳐 공개 표면 안정적으로 유지.
- 사용자가 Hono 컨텍스트를 타입 augment할 필드(`AuthVariables.user` / `session`) 추가.
- 한 곳에서 형상 문서화.

`c.var.user`와 `c.var.session`은 `AuthVariables`를 통해 타입된다:

```ts
import type { AuthVariables } from 'nexus/auth';
const app = new Hono<{ Variables: AuthVariables }>();
```

## 13. 테스트 전략

- `createAuth`의 **단위 테스트** — 설정 검증, 기본값, env 폴백.
- `AuthService`의 **통합 테스트** — DI 해석, `getSession`, `redirect`.
- `authMiddleware`의 **미들웨어 테스트** — required vs optional, ignored paths.
- `AuthController`의 **HTTP 테스트** — `/api/auth/session`이 인증되지 않은 요청에 대해 `user=null`로 200을 반환.

better-auth 자체는 테스트하지 않는다 — 그건 그들의 책임.

`AuthService`를 사용하는 컨트롤러 테스트에서는 mock 서비스를 만들어 DI로 주입한다.

```ts
@Module({
  providers: [{ provide: AuthService.TOKEN, useValue: mockAuth }],
})
class TestModule {}
```

## 14. 알려진 이슈

### Vitest + zod race condition

better-auth가 `@better-auth/core`를 통해 `zod v4`를 가져온다. 같은 프로세스에서 auth 테스트(better-auth를 import)와 기존 validator 테스트(최상위 `zod` v3를 import)를 모두 실행하면 모듈 초기화 race condition으로 `z.object`가 `undefined`가 될 수 있다.

**우회:**

- auth 테스트를 격리 실행: `bunx vitest run tests/auth/`.
- 프로젝트를 `zod v4`로 업그레이드.

전체 수정(zod v4로 업그레이드 또는 해결 고정)은 별도로 추적된다.

## 15. 향후 작업

- **매직 링크** — better-auth가 지원함; CLI 플래그만 필요.
- **2단계 인증** — better-auth에 2FA 플러그인 있음.
- **계정 연결 UI** — better-auth가 엔드포인트 노출; NexusJS 컨트롤러로 래핑.
- **Rate limiting** — better-auth의 hook을 래핑.
- **감사 로그** — better-auth가 이벤트 emit; NexusJS 이벤트 시스템에 노출 (v0.2).

## 16. 참고

- [`auth.md`](../user-guide/auth.md) — 사용자 가이드
- [Better-auth 문서](https://www.better-auth.com/docs/installation)
- [`di-container.md`](./di-container.md) — `useExisting`이 동작하는 방식
