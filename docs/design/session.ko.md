# Session 모듈 설계

> 최종 업데이트: v0.1
> English version: [`session.md`](./session.md)

## 1. 목표

다음을 만족하는 균일한 세션 스토리지 추상화를 제공한다.

1. **모든 런타임에서 동작** — Bun / Node / Cloudflare Workers / Vercel .
2. **`@nexusts/auth`와 강제 없이 통합** — better-auth는 자체 DB 기반 세션을 관리; `SessionService`는 일시적 상태(플래시 메시지, 게스트 장바구니, OAuth 플로우 상태)를 관리.
3. **바퀴를 재발명하지 않음** — 쿠키는 작은 인트리 HMAC로 인코딩/디코딩/검증; `cookie`나 `iron-session` 의존성 없음.

## 2. 왜 별도 모듈인가?

`@nexusts/auth`는 better-auth의 DB 기반 세션을 통해 이미 세션 관리를 제공한다. 그렇다면 왜 `@nexusts/session`?

| 필요 | 왜 `@nexusts/auth`만으로는 부족한가 |
| ---- | ----------------------------------- |
| **엣지 런타임** | Better-auth의 DB 세션은 데이터베이스 필요. Workers는 종종 도달할 수 없음. 쿠키 세션은 인프라 없이 동작. |
| **사전 인증 상태** | 게스트 장바구니, OAuth 플로우 상태, CSRF 토큰 — 사용자가 로그인하기 *전에* 존재해야 함. Better-auth 세션은 항상 사용자에 묶임. |
| **플래시 메시지** | 한 요청이 메시지를 설정, 다음 요청이 렌더링. URL 파라미터로 스레딩하는 것보다 깔끔. |
| **커스텀 TTL** | 일부 세션은 30일 TTL, 일부는 5분 TTL. 쿠키 스토리지는 세션별로 결정 가능. |
| **공유 쿠키** | 같은 요청에 auth 쿠키 + session 쿠키 — 서로 덮어쓰지 않고 공존해야 함. |

따라서 `@nexusts/auth` *옆에* 얇은 쿠키 (및 메모리, 곧 Redis) 레이어를 제공한다. 필요 없는 사용자는 비용을 지불하지 않는다 (별도 진입점). 둘 다 필요한 사용자는 `AuthService.bindSession(sessions)`로 연결한다.

## 3. 아키텍처

```
┌──────────────────────────────────────────────────────────────┐
│                      사용자 코드                              │
│   ctx.session.get('cart') / .set('key', val)                   │
│   sessions.update(id, { dataPatch: { cart } })               │
└──────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌──────────────────────────────────────────────────────────────┐
│              @nexusts/session  (별도 진입점)                    │
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
│  │(상태비저장│          │(인프로세)│          │ (v0.2)   │    │
│  │  HMAC)   │          │  + LRU   │          │          │    │
│  └──────────┘          └──────────┘          └──────────┘    │
└──────────────────────────────────────────────────────────────┘
                              │
                              ▼
            Auth 통합: AuthService.bindSession(sessions)
                              │
                              ▼
                   ┌──────────────────────┐
                   │  @nexusts/auth (better-auth) │
                   │  user identity + DB 세션 │
                   └──────────────────────┘
```

파사드(`SessionService`)는 사용자 코드가 대화하는 유일한 대상이다. 백엔드는 교체 가능; `nx.config.ts`의 `backend: 'cookie'`를 `'memory'`로 변경해도 컨트롤러는 손대지 않는다.

## 4. 모듈 분리

`@nexusts/session`은 별도 진입점이다.

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

빌드 스크립트는 `src/session/index.ts`를 `dist/session/` 아래 자체 아티팩트로 번들한다. 쿠키 백엔드는 peer 의존성 없음; Redis 백엔드(v0.2)는 `ioredis` 필요.

## 5. 쿠키 형식

```
Cookie 값 = base64url(payload) + "." + base64url(hmac)
```

- **payload** — `JSON.stringify(SessionRecord)`. `data`, `metadata`, 타임스탬프를 포함한 전체 레코드.
- **hmac** — `HMAC-SHA256(secret, payload)`. 디코드 시 `crypto.timingSafeEqual`로 상수 시간 비교.

서버 측에 세션 레코드가 저장되지 않음. 쿠키가 진실의 원천. 상태 비저장 = 엣지 친화적.

```ts
const cookie = encodeSessionCookie(record, secret);
const decoded = decodeSessionCookie(cookie, secret);
// → record 또는 null (변조 / 잘못된 secret / 만료 시)
```

만료는 디코드 후 확인된다 (`expiresAt.getTime() <= Date.now()`). 변조는 HMAC 불일치를 일으킴; 잘못된 secret는 잘못된 HMAC을 만듦. 둘 다 `null`을 생성.

## 6. SessionStorage 인터페이스

모든 백엔드가 구현:

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

`read()`는 기본적으로 "sliding" 만료 — 레코드를 터치하면 `expiresAt`이 연장된다. 원자적으로 업데이트할 수 없는 백엔드(쿠키 스토리지처럼 읽기 전용)는 `update()`에서 `null`을 반환하고, 호출자가 새 값으로 쿠키를 다시 인코딩한다.

## 7. Memory 백엔드

LRU 축출 `Map`. `read()`가 `lastSeenAt`과 엔트리 위치를 갱신. `gc()`는 `setInterval`(기본 60s)에서 실행되어 만료 엔트리를 제거. 최대 크기 기본값 100,000 — 오래된 엔트리는 FIFO로 축출.

인터벌은 `unref()`되어 테스트에서 Node를 활성 상태로 유지하지 않는다.

## 8. Cookie 백엔드

상태 비저장. `read()`는 서버 측 상태가 없으므로 `null`을 반환. `decode(value)`와 `encode(record)`가 컨트롤러가 `Set-Cookie`로 쿠키를 설정/삭제할 수 있도록 노출.

쿠키 이름과 `SameSite` / `Secure` 속성은 설정에서 옴. 크로스 오리진 SPA는 `sameSite: 'none'`, `secure: true`, `crossSubDomainCookies: { enabled: true, domain: '.example.com' }`를 사용한다 (better-auth 기본값과 일치).

## 9. AuthService 통합

`AuthService.bindSession(svc)`은 `SessionService` 참조를 설정한다. 바인딩 후 `AuthService.getSession()`:

1. `svc.decodeCookie(...)`를 통해 세션 쿠키를 읽음.
2. `userId`가 있으면 better-auth에서 user / session 레코드를 조회 (반환 형상이 `AuthSession`과 일치하도록).
3. 세션 쿠키가 없으면 better-auth 자체 세션 조회로 폴백.

이렇게 하면 session 패키지가 auth에 **type-only 임포트**된다 (optional peer). 설치하지 않으면 아무것도 깨지지 않음. 설치하면 크로스 시스템 세션 연속성을 얻음.

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

`SessionService`는 `import type`로만 임포트되어 빌드 시 제거되며, auth 번들의 런타임 의존성에 나타나지 않는다.

## 10. 세션 회전

`SessionService.rotate(id)`는 session-fixation 방어이다. 인증 후 사전 인증 id가 새로운 id로 교체된다. 이전 id는 무효화된다. 사용자 데이터 + 메타데이터는 유지된다.

이 패턴이 너무 중요해서 세 단계의 create+update+destroy 대신 한 줄로 노출된다.

## 11. 이벤트

모든 상태 변경이 emit:

| 종류 | 시점 |
| ---- | ---- |
| `session:created` | `create()` 후 |
| `session:read` | `read()` 후 |
| `session:updated` | `update()` 후 |
| `session:destroyed` | `destroy()` / `destroyMany()` 후 (이유 포함) |
| `session:expired` | GC가 만료 엔트리를 제거할 때 |
| `session:rotated` | `rotate()`가 id를 교체할 때 |

리스너는 `sessions.on(listener)`로 구독. 분석(Datadog / Prometheus), 보안 감사, 캐시 무효화의 통합 지점.

## 12. CLI 통합

`nx make:session <Name>`가 다음을 생성:

- `src/session/services/<name>.session.ts` — 타입이 지정된 접근자 메서드(`getCurrent`, `update`, `destroy`)가 있는 `@Injectable` 스켈레톤.

템플릿은 메서드를 베스트 프랙티스 주석으로 감싸 사용자가 어디에 코드를 넣을지 알게 한다.

## 13. DI 통합

```
ApplicationContainer
  └── ConfiguredSessionModule (SessionModule.forRoot(config)가 반환)
        ├── SessionService
        ├── SessionService.TOKEN (useExisting 별칭)
        └── 'SESSION_CONFIG' (useValue)
```

`AuthModule`, `QueueModule`, `ScheduleModule`과 같은 패턴. 서비스는 두 토큰 모두에 등록되어 어느 쪽으로든 주입 가능.

## 14. 테스트

- `encodeSessionCookie` / `decodeSessionCookie`의 **단위 테스트** (라운드트립, 변조, 잘못된 secret, 잘못된 형식의 쿠키).
- `MemorySessionStorage`의 **단위 테스트** (CRUD, GC, LRU, 쿼리 필터링).
- `CookieSessionStorage`의 **단위 테스트** (Set-Cookie 헤더 형상, secret 검증, encode/decode 라운드트립).
- `SessionService` DI의 **통합 테스트** (두 토큰 모두).
- `AuthService.bindSession` + 쿠키 라운드트립의 **통합 테스트**.

## 15. 향후 작업

- **Redis 백엔드** — 가장 많이 요청되는 백엔드. 같은 인터페이스; `SETEX` + `GET` + 파이프라인된 `MGET`로 `ioredis`를 래핑.
- **데이터베이스 백엔드** — 이미 DB가 있는 Drizzle / Kysely 사용자용. (Better-auth 테이블 재사용 가능.)
- **분산 회전** — 다중 인스턴스 배포에서 회전 시 pub/sub으로 모든 인스턴스에 새 id 전파.
- **CSRF 토큰 통합** — 세션에 CSRF 토큰을 자동으로 바인딩하고 form post에서 검증.
- **Flash 미들웨어** — `data.flash`를 자동으로 채우고 읽을 때 비우기. Rails / AdonisJS 스타일.

## 16. v0.2 변경사항

- **이름 변경** `@CurrentSession` → `@Session`. `@Req()` / `@Body()` / `@Ctx()`의 짧은 형식 관례를 따른다.
- **Redis 백엔드 일정 변경**: v0.2가 아닌 **v0.3**에 출시.
- Auth 통합 모델은 변경 없음 — `AuthService.bindSession()`는 여전히 옵션 `SessionService`를 바인딩한다.

## 17. 참고

- [`session.md`](../user-guide/session.md) — 사용자 가이드
- [`auth.md`](../user-guide/auth.md) — better-auth 통합
- [`queue.md`](../user-guide/queue.md) — 같은 패턴의 자매 설계 문서
- [iron-session](https://github.com/vvo/iron-session) — 영감
