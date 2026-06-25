# Inertia.js 어댑터

> English version: [`inertia.md`](./inertia.md)

Inertia 어댑터는 API를 작성하지 않고도 **단일 페이지 애플리케이션**을 구축할 수 있게 해줍니다. 서버는 페이지 객체(컴포넌트 이름 + props)를 반환하고, 클라이언트가 React, Vue, Svelte, Solid로 렌더링합니다.

아키텍처 심층 분석은 [`../design/inertia-adapter.md`](../design/inertia-adapter.md)를 참조하세요.

---

## 1. 활성화

```ts
import { Application } from '@nexusts/core';
import { AppModule } from './app.module.js';

const app = new Application(AppModule, {
  inertia: {
    version: '1.0.0',                 // 에셋 버전 (string 또는 fn)
    title: 'My App',
    sharedProps: () => ({             // 요청별 전역 props
      appName: 'My App',
      currentUser: await getCurrentUser(),
    }),
  },
});
```

생성 후 `app.inertia`는 `Inertia` 인스턴스입니다. DI 컨테이너의 `Inertia.TOKEN` 아래에도 등록되므로 주입할 수 있습니다.

---

## 2. 페이지 렌더링

```ts
import { Controller, Get, Inject } from '@nexusts/core';
import { Inertia } from '@nexusts/view/inertia';

@Controller('/users')
class UserController {
  @Inject(Inertia.TOKEN) declare inertia: Inertia;

  @Get('/')
  index() {
    return this.inertia.render('Users/Index', {
      users: this.userService.findAll(),
    });
  }
}
```

라우터가 응답 타입을 감지하여 emit합니다.

- **최초 로드 (`X-Inertia` 헤더 없음)** — `data-page` JSON이 포함된 HTML 셸
- **XHR 방문 (`X-Inertia: true`)** — JSON 페이지 객체

---

## 3. 지연 평가 헬퍼

언제 해결되고 클라이언트가 어떻게 병합하는지를 제어하려면 prop 값을 다음 헬퍼 중 하나로 감싸세요.

| 헬퍼 | 동작 |
| ------ | --------- |
| `defer(fn, group?)` | `null` placeholder를 보냄; 클라이언트가 부분 리로드로 재요청 |
| `always(fn)` | 모든 부분 리로드에 포함되며 `only` / `except` 무시 |
| `optional(fn, threshold?)` | 결과 길이가 threshold 이하면 부분 리로드에서 생략 |
| `merge(fn, matchPropsOn?)` | 클라이언트가 새 값을 이전 값과 병합 (무한 스크롤) |
| `deepMerge(fn)` | 클라이언트가 객체 트리를 deep-merge |
| `once(fn)` | 최초 (HTML) 페이지 로드에만 포함 |
| `lazy(fn, tag?)` | 요청당 한 번 평가; 같은 tag를 가진 키들 간 공유 |

```ts
@Get('/dashboard')
dashboard() {
  return this.inertia.render('Dashboard', {
    // 클라이언트가 한 prop만 가져올 때도 매번 포함.
    currentUser: always(() => ({ id: 1, name: 'Alice' })),

    // Deferred — placeholder, 그 후 부분 리로드.
    stats: defer(async () => ({ visits: 1234 }), 'metrics'),

    // 페이지네이션 — 클라이언트가 기존 배열에 추가.
    users: merge(() => this.userService.page(1), [['id']]),

    // 최초 페이지 로드에만 (HTML).
    featureFlags: once(() => ({ newDashboard: true })),

    // 요청당 한 번 평가, 두 키 간 공유.
    perms: lazy(() => this.computePerms(), 'perms'),
  });
}
```

헬퍼는 `@nexusts/view/inertia`에서 import합니다.

---

## 4. 에셋 버전 관리

`version`이 설정되면 클라이언트는 모든 요청에 `X-Inertia-Version: <value>`를 보냅니다. 불일치 시 서버는 다음과 같이 응답합니다.

```http
HTTP/1.1 409 Conflict
X-Inertia-Location: /dashboard
```

Inertia 클라이언트는 이를 재시도 전에 **전체 페이지 리로드**(CSS / JS 번들 재요청) 지시문으로 해석합니다. 프로덕션에서는 빌드 ID나 git SHA에 고정하세요.

```ts
new Application(AppModule, {
  inertia: {
    version: () => execSync('git rev-parse --short HEAD').toString().trim(),
  },
});
```

---

## 5. 공유 데이터

페이지 전역 데이터 공유(현재 사용자, 플래시 메시지, CSRF 토큰).

```ts
// 정적
app.inertia.share('appName', 'My App');
app.inertia.share({ csrfToken: '...', flash: { type: 'success', message: '저장되었습니다!' } });

// 또는 config에서 함수 사용 (요청별)
inertia: {
  sharedProps: async () => ({
    currentUser: await getCurrentUser(),
  }),
}
```

공유 props는 **모든** 페이지 응답에 나타나며 부분 리로드를 거칩니다.

---

## 6. `<Form>` 서버 사이드 헬퍼

Inertia v3의 `<Form>` 컴포넌트는 이 서버 사이드 헬퍼와 페어링됩니다.

```ts
import { z } from 'zod';
import { Body, Controller, Post } from '@nexusts/core';
import { Inertia } from '@nexusts/view/inertia';

const UserSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
});

@Controller('/users')
class UserController {
  @Inject(Inertia.TOKEN) declare inertia: Inertia;

  @Post('/')
  async store(ctx: Context) {
    const input = await ctx.req.json() as Record<string, any>;
    const form = this.inertia.form('Users/Create');
    const r = UserSchema.safeParse(input);

    if (!r.success) {
      const errors: Record<string, string[]> = {};
      for (const issue of r.error.issues) {
        const path = issue.path.join('.');
        (errors[path] ??= []).push(issue.message);
      }
      return form
        .withErrorBag('createUser')    // 한 페이지에 여러 폼 네임스페이스
        .withErrors(errors)             // 필드별 검증 에러
        .withValues(input)              // 폼 재충원
        .render();                      // 에러와 함께 페이지 emit
    }

    return form.redirect('/users');     // 303 (PRG — 이중 제출 방지)
  }
}
```

### 빌더 메서드

| 메서드 | 효과 |
| ------ | ------ |
| `withProps(p)` | props 배치 머지 |
| `with(k, v)` | 단일 prop 설정 |
| `withErrors(errors)` | 검증 에러 부착 |
| `withError(field, msg)` | 필드에 단일 에러 추가 |
| `withErrorBag(name)` | 폼 에러 네임스페이스 |
| `withValues(values)` | 실패 후 폼 입력 재충원 |
| `render()` | 페이지 emit |
| `redirect(url)` | 303 리다이렉트 (PRG) |
| `back(to?)` | `back` 또는 특정 URL로 303 리다이렉트 |

---

## 7. 전체 페이지 네비게이션 & 히스토리

클라이언트가 **Inertia의 클라이언트 사이드 히스토리를 우회**하도록 강제(로그아웃, 에셋 재검증 등).

```ts
@Post('/logout')
logout() {
  return this.inertia.location('/login');   // 409 + X-Inertia-Location
}
```

히스토리에서 한 단계 뒤로:

```ts
this.inertia.back();   // 302 with Location: back
```

---

## 8. SSR

프런트엔드용 서버 사이드 렌더러 연결:

```ts
import { createReactAdapter, ComponentRegistry } from '@nexusts/view/inertia/ssr';

const components = new ComponentRegistry()
  .register('Home', HomePage)
  .register('Users/Index', UsersIndexPage);

app.inertia.setSsrAdapter(createReactAdapter({ components }));
```

| 어댑터 | 엔진 | SSR API |
| ------- | ------ | ------- |
| `createReactAdapter` | React 18+ | `react-dom/server.renderToString` |
| `createVueAdapter` | Vue 3 | `vue/server-renderer.renderToString` |
| `createSvelteAdapter` | Svelte 4/5 | `svelte/server.render` / `Component.render` |
| `createSolidAdapter` | Solid | `solid-js/web.renderToString` |

어댑터가 없으면 프레임워크는 최소 HTML 셸을 emit하고 클라이언트가 JS 로드 후 `data-page`에서 하이드레이트합니다.

---

## 9. CSRF 미들웨어

`<Form>` 헬퍼는 검증과 PRG를 처리합니다. CSRF는 업스트림입니다.

```ts
import { inertiaFormMiddleware } from '@nexusts/view/inertia';

app.server.app.use('*', inertiaFormMiddleware({
  validateCsrf: true,
  csrfHeader: 'X-CSRF-Token',
  csrfField: '_token',
  csrfSharedKey: 'csrfToken',
}));
```

불일치 시 **419 Page Expired**를 반환합니다.

---

## 10. 종합

Inertia를 사용하는 완전한 `app.module.ts`:

```ts
import { Module } from '@nexusts/core';
import { HomeController } from './controllers/home.controller.js';
import { UserController } from './controllers/user.controller.js';
import { UserService } from './services/user.service.js';

@Module({
  controllers: [HomeController, UserController],
  providers: [UserService],
})
export class AppModule {}
```

```ts
// main.ts
import { Application } from '@nexusts/core';
import { AppModule } from './app.module.js';

const app = new Application(AppModule, {
  inertia: {
    version: '1.0.0',
    title: 'NexusTS 데모',
    sharedProps: async () => ({
      currentUser: null,   // TODO: 실제 인증
    }),
  },
});

await app.listen(3000);
```

---

## 11. 요청 / 응답 레퍼런스

### 응답 헤더

| 헤더 | 보내는 시점 |
| ------ | ------- |
| `Vary: X-Inertia` | 모든 응답 |
| `X-Inertia: true` | JSON 응답만 |
| `X-Inertia-Location: <url>` | 409 (에셋 불일치) 및 `inertia.location(...)` |
| `Location: <url>` | `inertia.redirect(...)` 및 `inertia.back()` |

### 요청 헤더

| 헤더 | 용도 |
| ------ | ------- |
| `X-Inertia: true` | XHR 방문 표시 |
| `X-Inertia-Version` | 에셋 버전 검사 |
| `X-Inertia-Partial-Component` | 부분 리로드 대상 식별 |
| `X-Inertia-Partial-Data` | `only` 필터 |
| `X-Inertia-Partial-Except` | `except` 필터 |
| `X-Inertia-Reset` | 클라이언트 폐기 마커 |

---

## 12. FAQ

**Q: SSR 없이 Inertia를 사용할 수 있나요?**
예. `setSsrAdapter(...)`를 생략하면 프레임워크는 최소 HTML 셸을 emit합니다. 클라이언트는 JS 로드 후 `data-page`에서 하이드레이트합니다.

**Q: 요청별과 프로세스별 데이터를 모두 공유할 수 있나요?**
예 — `inertia.share(...)`(프로세스별 정적)와 `sharedProps: () => ...`(요청별 동적)을 결합하세요. 머지됩니다.

**Q: 중첩 레이아웃은 어떻게 하나요?**
Inertia에는 내장 레이아웃 시스템이 없습니다 — 프런트엔드의 것을 사용하세요. React에서는 페이지에 레이아웃 컴포넌트를 감싸고, Vue에서는 slot 기반 레이아웃을 사용하세요.

**Q: 컨트롤러에서 던진 에러는 어떻게 처리하나요?**
프레임워크의 기본 에러 핸들러는 던져진 에러를 JSON으로 변환합니다. 에러 페이지를 렌더링해야 하는 경우 `inertia.render(...)`를 try/catch로 감싸세요.
