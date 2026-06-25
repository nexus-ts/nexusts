# 자주 빠지는 함정 (Common Pitfalls)

> 실전에서 nexusts 사용자가 자주 마주치는 **10가지 핵심 이슈**와 해결책.
> 32개 모듈을 import해서 실제 blog app을 만들면서 발견한 패턴을 정리했습니다.

> English version: [`common-pitfalls.md`](./common-pitfalls.md)

이 문서는 다음을 다룹니다:

1. **`@Inject(SomeClass.TOKEN)`이 동작하지 않는 이유**와 `useExisting` 패턴
2. **한 파일에 여러 controller 정의 시 라우터 누락** 버그
3. **`DrizzleService.client`에 raw SQL 메서드가 없는 이유**와 우회법
4. **`No provider for "undefined"` 에러**의 원인 진단
5. **DB 초기화 & 마이그레이션** 실전 패턴 (특히 SQLite)
6. **`bun:sqlite` vs `better-sqlite3`** 선택 가이드
7. **Bun 1.3.14의 decorator 호환성** 이슈
8. **Session / 쿠키 인증** 패턴 (직접 구현)
9. **Custom error class** + controller 매핑 패턴
10. **Markdown 렌더링**은 직접 추가해야 함

각 함정은 **증상 → 원인 → 수정** 순서로 설명합니다.

---

## 1. `@Inject(SomeClass.TOKEN)`이 동작하지 않음

### 증상

```ts
// app/services/user.service.ts
@Injectable()
export class UserService {
  // TOKEN을 정의했지만...
  static readonly TOKEN = Symbol.for("nexus:blog:UserService");

  constructor(@Inject(UserService.TOKEN) private users: UserService) {
    //                                        ^^^^^^^^^^^^^^^^
    //                       runtime 에러: No provider for "undefined"
  }
}
```

### 원인

DI 컨테이너는 `providers` 배열에 등록된 **token으로만** 클래스를 찾습니다.

```ts
@Module({
  providers: [UserService],   // ← UserService 클래스 자체는 등록됨
  //                              UserService.TOKEN은 등록 안 됨!
})
```

`@Inject(UserService.TOKEN)`은 `Symbol.for("nexus:blog:UserService")`를 찾지만, 컨테이너는 `UserService` (클래스 자체)만 알고 있습니다.

### ✅ 해결책 1: `useExisting` 별칭 등록

`Symbol.for(...)`을 클래스에 별칭으로 연결합니다.

```ts
@Module({
  providers: [
    UserService,
    { provide: UserService.TOKEN, useExisting: UserService },   // ← 추가
  ],
  exports: [UserService, UserService.TOKEN],                    // ← 둘 다 export
})
```

이제 `@Inject(UserService.TOKEN)`도, `@Inject(UserService)`도 둘 다 동작합니다.

### ✅ 해결책 2: 클래스 자체를 inject (간단)

서비스에 `TOKEN`을 정의할 필요가 없다면 클래스 자체를 inject:

```ts
// app/services/user.service.ts
@Injectable()
export class UserService {                                       // ← TOKEN 없음
  constructor(@Inject(UserService) private users: UserService) { // ← 클래스 자체
    // ...
  }
}
```

```ts
// 모듈
@Module({
  providers: [UserService],   // 그대로
})
```

**권장**: 모듈 외부에서 import해서 inject해야 하는 경우 (예: cross-module)에는 `TOKEN` + `useExisting` 패턴. 모듈 내부에서만 쓸 때는 클래스 자체 inject.

### 어떻게 진단하나?

`bun app/main.ts` 실행 시 이런 에러가 나옵니다:

```
error: No provider for "undefined". Register it via DIContainer.register() or @Module({ providers: [...] }).
```

`"undefined"`가 보이면 거의 항상 **클래스의 `static TOKEN`이 정의되지 않았거나, 그 TOKEN이 providers에 등록되지 않은 경우**입니다.

---

## 2. 한 파일에 여러 controller를 정의하면 라우터가 누락됨

### 증상

```ts
// app/main.ts — 한 파일에 여러 컨트롤러
@Controller("/users")
class UsersController {
  @Get("/:username") profile() { /* ... */ }
}

@Controller("/tags")
class TagsController {
  @Get("/") list() { /* ... */ }
}

@Module({ controllers: [UsersController, TagsController] })
class AppModule {}

const app = new Application(AppModule);
```

```
$ curl http://localhost:3000/users/admin
404 Not Found    ← UsersController는 등록됐는데 라우트가 없음

$ curl http://localhost:3000/tags
[{"id":1,"slug":"announcement",...}]    ← TagsController는 OK
```

### 원인

NexusTS의 router는 **클래스의 ROUTES metadata**를 읽어 라우트를 등록합니다.

```ts
// packages/core/src/http/router.ts (내부)
registerController(controller) {
  const routes = getRoutes(controller);   // ← ROUTES metadata 조회
  if (routes.length === 0) {
    return;     // ← 라우트가 0개면 라우터에 추가하지 않음!
  }
  // ...
}
```

Bun의 TypeScript transformer가 **여러 클래스가 한 모듈 안에 있을 때 decorator 실행 순서를 어긋나는 경우가 있음**. `TagsController`는 잘 등록되고 `UsersController`는 누락되는 식으로 **불규칙하게 발생**합니다.

### ✅ 해결책: 컨트롤러당 파일 하나

```
app/
├── controllers/
│   ├── users.controller.ts   ← @Controller("/users")
│   ├── tags.controller.ts    ← @Controller("/tags")
│   ├── posts.controller.ts   ← @Controller("/posts")
│   └── auth.controller.ts    ← @Controller("/auth")
└── main.ts                   ← controllers import + 모듈 선언만
```

`main.ts`에는 컨트롤러 클래스 정의가 **하나도 없어야** 합니다. 다른 컨트롤러도 마찬가지로 파일 하나 = 컨트롤러 하나로.

### 진단 방법

```
$ curl http://localhost:3000/your-route
404 Not Found
```

`@Controller` 클래스에서 `@Get`/`@Post` 메서드를 정의했는데 404라면 90% 확률로 이 이슈입니다. 클래스 위치를 main.ts에서 별도 파일로 옮기세요.

---

## 3. `DrizzleService.client`에 raw 쿼리 메서드가 없음

### 증상

```ts
// app/services/user.service.ts
const sqlite = this.drizzle.client as import("bun:sqlite").Database;
const row = sqlite.query("SELECT 1").get();
```

```
TypeError: sqlite.query is not a function
```

### 원인

`DrizzleService.client`는 **raw `bun:sqlite` 핸들이 아니라** Drizzle이 wrapping한 객체입니다:

```ts
// packages/drizzle/src/drizzle.service.ts (내부)
const sqlite = new Database(filename);
this._client = drizzle(sqlite, { logger });   // ← Drizzle wrapper
```

raw 쿼리를 실행하려면 Drizzle의 `select/insert/update/delete` 빌더를 사용해야 합니다.

### ✅ 해결책: Drizzle 쿼리 빌더

```ts
// health check
@Get("/")
async health() {
  try {
    await this.drizzle
      .select({ count: sql<number>`count(*)` })
      .from(usersTable)
      .all();
    return { ok: true };
  } catch {
    return { ok: false };
  }
}

// raw SQL이 꼭 필요한 경우 — Drizzle의 sql`` 태그드 템플릿
const rows = await this.drizzle
  .select()
  .from(sql`users WHERE created_at > ${new Date('2026-01-01')}`)
  .all();
```

### 진짜 raw 핸들이 필요한 경우 (드묾)

`DrizzleService`는 `_client.driver` 또는 `driver.db`로 raw 핸들에 접근할 수 있지만 **내부 구현에 의존**하므로 권장하지 않습니다. raw 쿼리가 꼭 필요하면 **`DrizzleModule.forRoot({ logging: true })`** 설정으로 SQL 로그를 켜고, **Drizzle의 `sql` 태그드 템플릿**으로 충분합니다.

---

## 4. `No provider for "undefined"` 에러

이 에러는 4가지 원인이 있습니다:

### 원인 A: `static TOKEN` 누락

```ts
@Injectable()
export class UserService {                 // ← static TOKEN 없음
  constructor(@Inject(UserService.TOKEN) private u: UserService) { /* ... */ }
}
```

**해결**: 위 §1 참조.

### 원인 B: 모듈 imports 누락

```ts
@Module({
  // imports: [DrizzleModule.forRoot({...})],   ← 빠짐
  controllers: [PostsController],             // PostsController가 DrizzleService inject
})
```

**해결**: 필요한 모듈을 `imports`에 추가.

### 원인 C: 모듈 exports 누락

```ts
// AppModule
@Module({
  imports: [UserModule],
  controllers: [PostsController],
  // exports 없음
})

// UserModule
@Module({
  providers: [UserService],
  // exports: [UserService]   ← 빠짐
})
```

**해결**: 부모 모듈에서 쓸 토큰은 자식 모듈의 `exports`에 추가.

### 원인 D: 순환 의존성

`A → B → A` 형태. DI 컨테이너가 감지하지만 명확한 에러 메시지가 없을 수 있음.

**해결**: forward-reference 패턴 (자세한 내용은 [`dependency-injection.md`](./dependency-injection.md) §8 참조).

### 빠른 진단 체크리스트

```ts
@Module({
  imports: [???],
  controllers: [???],
  providers: [???],   // ← inject하려는 클래스 또는 { provide: TOKEN, useExisting: CLASS } 등록됐는지
  exports: [???],
})
```

---

## 5. SQLite 초기화 & 마이그레이션 실전 패턴

### 문제: `drizzle-kit`이 SQLite에서는 별도 설정 필요

```bash
bunx drizzle-kit generate
# Error: Cannot find module 'better-sqlite3'
```

`drizzle-kit`은 migration SQL을 생성할 때 **실제 DB에 연결해서 schema를 읽습니다**. `bun-sqlite`는 Bun 런타임에서만 동작하므로 `drizzle-kit`으로는 schema introspection이 안 됩니다.

### ✅ 해결책 A: `bun-sqlite`용 `drizzle.config.ts`

```ts
// drizzle.config.ts
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "sqlite",
  driver: "bun-sqlite",     // ← bun runtime을 명시
  schema: "./app/db/schema.ts",
  out: "./drizzle/migrations",
  dbCredentials: {
    url: "./blog.db",
  },
});
```

```bash
# bun runtime에서 실행
bun x drizzle-kit generate
bun x drizzle-kit migrate
```

### ✅ 해결책 B: DB 초기화 스크립트 직접 작성 (간단한 경우)

drizzle-kit 없이 **한 번 실행하는 init 스크립트**로 충분합니다. blog-app에서 사용한 패턴:

```ts
// app/db/init.ts
import { Database } from "bun:sqlite";

const sqlite = new Database("blog.db", { create: true });

sqlite.exec("PRAGMA journal_mode = WAL");

sqlite.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL UNIQUE,
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    display_name TEXT NOT NULL,
    created_at INTEGER NOT NULL DEFAULT (unixepoch())
  );

  CREATE TABLE IF NOT EXISTS posts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    slug TEXT NOT NULL UNIQUE,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    content_html TEXT NOT NULL,
    author_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'draft',
    published_at INTEGER,
    created_at INTEGER NOT NULL DEFAULT (unixepoch())
  );
  -- ... 나머지 테이블
`);
```

```bash
bun run app/db/init.ts
```

초기 개발 / 작은 프로젝트는 이 패턴이 가장 빠릅니다. 프로덕션은 `drizzle-kit` 또는 `@nexusts/drizzle`의 `db.migrate(folder)`를 사용하세요.

### 더 좋은 패턴: declarative schema + raw SQL init

```ts
// app/db/schema.ts — Drizzle의 declarative schema (런타임/타입용)
import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";

export const users = sqliteTable("users", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  email: text("email").notNull().unique(),
  username: text("username").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
});
```

```ts
// app/db/init.ts — raw SQL 생성 (drizzle-kit 없이)
const sqlite = new Database("blog.db");
// CREATE TABLE ... (schema.ts와 직접 매칭되는 raw SQL)
```

**주의**: schema.ts와 init.ts의 SQL이 어긋나면 runtime 에러. schema 변경 시 둘 다 업데이트해야 합니다.

---

## 6. `bun:sqlite` vs `better-sqlite3` 선택

Bun 1.1+를 사용한다면 **`bun:sqlite`를 강력히 권장**:

| 기준 | `bun:sqlite` | `better-sqlite3` |
| --- | --- | --- |
| **설치** | Bun 내장 | `bun add better-sqlite3` |
| **속도** | 매우 빠름 | 빠름 |
| **네이티브 빌드** | 불필요 | 필요 (CI에서 문제) |
| **Bun 호환** | 완벽 | ❌ Bun 1.3에서 로드 실패 |
| **드라이버** | `drizzle-orm/bun-sqlite` | `drizzle-orm/better-sqlite3` |

```ts
// ✅ Bun에서 권장
DrizzleModule.forRoot({
  dialect: "bun-sqlite",
  connection: { filename: "blog.db" },
});

// ❌ Bun에서 비추천
DrizzleModule.forRoot({
  dialect: "sqlite",                // better-sqlite3 driver
  connection: { filename: "blog.db" },
});
// Error: 'better-sqlite3' is not yet supported in Bun
```

Node 런타임으로 빌드한다면 `better-sqlite3`를 써도 됩니다. 둘 중 하나만 정해서 사용하세요.

---

## 7. Decorator와 Bun 1.3.14의 호환성

Bun 1.3+는 기본적으로 **TC39 stage-3 decorator**를 사용하지만, NexusTS는 **legacy decorator** (`experimentalDecorators: true`)에 의존합니다.

### tsconfig.json

```json
{
  "compilerOptions": {
    "experimentalDecorators": true,         // ← 필수
    "emitDecoratorMetadata": true,          // ← 권장
    "useDefineForClassFields": false        // ← 필수 (legacy mode)
  }
}
```

### Bun 1.3.14의 알려진 이슈

`tsconfig.json`이 **extends 체인에 포함되어야** 정상 동작합니다:

```jsonc
// monorepo root
{
  "compilerOptions": { "experimentalDecorators": true, /* ... */ }
}

// 패키지의 tsconfig.json
{
  "extends": "../../tsconfig.json"   // ← 이렇게 체인 연결
}
```

직접 tsconfig를 쓰는 경우 `extends` 없이도 동작합니다.

### Constructor parameter property (private readonly + decorator) 주의

Bun 1.3.14에서 **다음 패턴은 안 됨**:

```ts
@Injectable()
class Foo {
  @Inject(Bar) declare bar: Bar;   // ❌ decorator가 무시됨
}
```

**해결**: 수동 할당

```ts
@Injectable()
class Foo {
  bar: Bar;
  constructor(@Inject(Bar) bar: Bar) {
    this.bar = bar;   // ✅ 작동
  }
}
```

`tsc`로 빌드한 후 `node dist/` 또는 `bun dist/`로 실행하면 parameter property도 동작합니다. Bun이 직접 `.ts`를 실행할 때만 이슈.

---

## 8. Session / 쿠키 패턴은 직접 구현

NexusTS는 **built-in session module을 기본 제공하지 않습니다** (`@nexusts/session`은 service-side storage임). 일반적인 **cookie-based auth**는 직접 구현합니다:

```ts
// app/middleware/cookie.ts
export const COOKIE_NAME = "blog_sid";

export function extractSessionId(cookieHeader: string | undefined): string | null {
  if (!cookieHeader) return null;
  const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)${COOKIE_NAME}=([^;]+)`));
  return match?.[1] ?? null;
}

export function buildSessionCookie(sessionId: string, expiresAt: Date): string {
  return [
    `${COOKIE_NAME}=${sessionId}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Expires=${expiresAt.toUTCString()}`,
    "Max-Age=604800",
  ].join("; ");
}

export function clearSessionCookie(): string {
  return `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}
```

```ts
// controller 내부
@Post("/login")
async login(@Body() body, @Ctx() c: Context) {
  const user = await this.userService.authenticate(body.email, body.password);
  const session = await this.userService.createSession(user.id);
  c.header("Set-Cookie", buildSessionCookie(session.id, session.expiresAt));
  return c.json({ user });
}

@Post("/logout")
async logout(@Ctx() c: Context) {
  const sessionId = extractSessionId(c.req.header("cookie"));
  if (sessionId) await this.userService.destroySession(sessionId);
  c.header("Set-Cookie", clearSessionCookie());
  return c.json({ ok: true });
}
```

세션 ID는 DB (또는 Redis)에 저장하고, controller method에서 `extractSessionId()`로 cookie를 읽고 `UserService.findSession(sessionId)`로 사용자 정보를 조회합니다. 이 패턴은 framework에 의존하지 않으므로 어떤 DB/세션 백엔드로도 확장 가능합니다.

---

## 9. Custom error class 패턴

서비스 레이어에서 의미 있는 에러를 던지고, controller에서 잡아 HTTP 상태 코드로 변환:

```ts
// app/services/post.service.ts
export class PostNotFoundError extends Error {
  constructor(public slug: string) {
    super(`Post not found: ${slug}`);
    this.name = "PostNotFoundError";
  }
}

export class SlugTakenError extends Error {
  constructor(public slug: string) {
    super(`Slug already taken: ${slug}`);
    this.name = "SlugTakenError";
  }
}

@Injectable()
export class PostService {
  async findBySlug(slug: string): Promise<Post | null> {
    const post = await this.drizzle.select()...where(eq(posts.slug, slug)).get();
    if (!post) throw new PostNotFoundError(slug);
    return post;
  }
}
```

```ts
// controller
@Get("/:slug")
async show(@Param("slug") slug: string) {
  try {
    return await this.postService.findBySlug(slug);
  } catch (e) {
    if (e instanceof PostNotFoundError) {
      return { status: 404, body: { error: e.message } };
    }
    throw e;
  }
}
```

NestJS 스타일의 exception filter는 아직 없으므로, controller에서 try/catch + instanceof로 매핑합니다. 반복되는 패턴은 helper로 추출:

```ts
function serviceError(e: unknown): Response | null {
  if (e instanceof PostNotFoundError) return Response.json({ error: e.message }, { status: 404 });
  if (e instanceof SlugTakenError) return Response.json({ error: e.message }, { status: 409 });
  return null;
}

// controller
async show(@Param("slug") slug: string) {
  try {
    return await this.postService.findBySlug(slug);
  } catch (e) {
    return serviceError(e) ?? c.json({ error: "Internal" }, 500);
  }
}
```

---

## 10. 마크다운 렌더링은 직접 추가

NexusTS는 **built-in markdown renderer를 제공하지 않습니다**. `@nexusts/view`의 Rendu는 HTML 템플릿 엔진입니다. Markdown은 별도 패키지:

```bash
bun add marked
```

```ts
import { marked } from "marked";

// 글 저장 시 markdown → HTML 변환
const contentHtml = await marked.parse(post.content);

await this.postService.create({
  title,
  content,
  contentHtml,           // ← DB에 함께 저장
  // ...
});
```

**권장 패턴**: raw markdown (`content`)과 rendered HTML (`contentHtml`) 둘 다 DB에 저장. 렌더링은 저장 시 1번만 하고, 표시는 저장된 HTML을 그대로 사용 (성능 + 안전성). 사용자 입력이 markdown이라면 반드시 sanitize를 추가하세요 (`sanitize-html`, `DOMPurify` 등).

---

## 정리: 디버깅 체크리스트

| 증상 | 먼저 확인할 것 |
| --- | --- |
| `No provider for "undefined"` | `@Inject(X)`의 X가 `providers`에 등록됐는지, `static TOKEN`이 있는지 |
| 404 on a defined route | controller 클래스가 **별도 파일**에 있는지 (main.ts 안에 있지 않은지) |
| `sqlite.query is not a function` | `DrizzleService.client`에 raw 메서드 없음 → Drizzle 쿼리빌더 사용 |
| Decorator가 적용되지 않음 | tsconfig에 `experimentalDecorators: true` + `useDefineForClassFields: false` |
| Bun에서 `better-sqlite3` 로드 실패 | `bun:sqlite`로 전환 |
| `Cannot find name 'Inject'` | tsconfig의 `experimentalDecorators` 누락 |
| `error: Cannot resolve '@nexusts/core'` | 패키지 설치 안 됨 — `bun add @nexusts/core` |
| TypeScript 자동완성이 안 됨 | monorepo 외부에서 `.d.ts` emit이 필요 (build.ts에 tsc 단계 추가됨) |

---

## 더 읽기

- [`getting-started.md`](./getting-started.md) — 첫 앱 만들기
- [`dependency-injection.md`](./dependency-injection.md) — DI 패턴 깊이
- [`drizzle.md`](./drizzle.md) — Drizzle ORM 사용법
- [`crypto.md`](./crypto.md) — 비밀번호 해싱/암호화
- [`controllers.md`](./controllers.md) — Controller 작성 패턴
