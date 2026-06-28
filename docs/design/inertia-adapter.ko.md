# Inertia.js 어댑터 설계

> 최종 업데이트: v0.1
> English version: [`inertia-adapter.md`](./inertia-adapter.md)

## 1. 범위

Inertia 어댑터는 [Inertia.js 프로토콜](https://inertiajs.com/the-protocol)의 서버 측을 구현합니다. 이는 별도의 프레임워크가 아니라 **특별한 응답 타입**입니다 — 컨트롤러는 `inertia.render(component, props)`를 반환하고 라우터는 응답을 JSON 파이프라인(XHR 방문) 또는 HTML 셸 파이프라인(최초 페이지 로드)으로 라우팅합니다.

어댑터는 다음을 제공합니다.

- v2 / v3 프로토콜 지원 (에셋 버전 관리, 부분 리로드, deferred props, merge / deep-merge props)
- Post/Redirect/Get 흐름을 담당하는 `<Form>` 서버 사이드 헬퍼
- 에셋 버전 불일치 처리 (409 + `X-Inertia-Location`)
- 공유 props (요청별 전역 데이터)
- 플러그인 가능한 SSR 어댑터 인터페이스 (React, Vue, Svelte, Solid)

구현은 [`src/core/view/inertia/`](../../src/core/view/inertia/)에 있습니다.

---

## 2. 아키텍처

```
┌──────────────────────────────────────────────────────────────────────┐
│                          Controller                                  │
│   return inertia.render('Users/Index', {                             │
│     users: defer(() => this.userService.findAll(), 'data'),          │
│   });                                                                │
└──────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
                ┌──────────────────────────┐
                │     InertiaResponse      │
                │  (태그된 특수 객체)        │
                └──────────────────────────┘
                              │
                              ▼
                ┌──────────────────────────┐
                │   Router / serializer    │◄───── INERTIA_RESPONSE_TAG 검사
                └──────────────────────────┘
                              │
              ┌───────────────┴───────────────┐
              ▼                               ▼
   ┌──────────────────────┐         ┌──────────────────────┐
   │ 첫 페이지 로드 (no   │         │ XHR 방문 (X-Inertia  │
   │ X-Inertia 헤더)       │         │ 헤더 있음)            │
   │                      │         │                      │
   │ → data-page JSON이    │         │ → JSON 페이지 객체만  │
   │   포함된 HTML 셸       │         │                      │
   └──────────────────────┘         └──────────────────────┘
```

`INERTIA_RESPONSE_TAG`는 `Symbol.for('nexus:InertiaResponse')` 판별자로, 라우터가 `instanceof` 검사 없이 인식합니다.

---

## 3. `Inertia` 클래스

`app.inertia`는 컨트롤러가 사용하는 API를 노출합니다.

| 메서드 | 용도 |
| ------ | ------- |
| `render(component, props)` | 페이지 응답 빌드 (2-인자 형식) |
| `render(component, deferred, props)` | 페이지 응답 빌드 (deferred 맵을 포함한 3-인자 형식) |
| `form(component, initialProps?)` | `<Form>` 서버 사이드 흐름 시작 |
| `location(url)` | `X-Inertia-Location`을 가진 409 (전체 리로드 강제) |
| `redirect(url, status?)` | 302/303 클라이언트 사이드 리다이렉트 |
| `back()` | `Location: back`을 가진 302 (히스토리에서 한 단계 뒤로) |
| `share(key, value)` / `share({...})` | 페이지 전역 props 추가 |
| `unshare(key)` | 공유된 키 제거 |
| `setVersion(version)` | 에셋 버전 설정 |
| `setSsrAdapter(adapter)` | React/Vue/Svelte/Solid SSR 연결 |
| `setTitle(title)` | 기본 HTML 타이틀 |
| `setEncryptHistory(true)` | v3 히스토리 암호화 플래그 |
| `setSharedProps(fn)` | 요청별 공유 props 해석기 |

인스턴스는 또한 `Inertia.TOKEN`(`Symbol.for('nexus:Inertia')`)으로 DI 컨테이너에 등록되므로 컨트롤러는 다음과 같이 주입할 수 있습니다.

```ts
@Inject(Inertia.TOKEN) declare private inertia: Inertia;
```

---

## 4. 지연 평가 헬퍼

각 헬퍼는 `__inertiaKind` 판별자를 가진 얇은 클래스 래퍼입니다. 어댑터는 직렬화 시점에 판별자를 검사하여 래핑된 콜백을 언제, 어떻게 평가할지 결정합니다.

| 헬퍼 | 태그 | 동작 |
| ------ | --- | --------- |
| `defer(fn, group?)` | `deferred` | `null` placeholder를 보냄; 클라이언트가 부분 리로드로 나중에 재요청 |
| `always(fn)` | `always` | 모든 부분 리로드에 포함되며 `only` / `except` 필터 무시 |
| `optional(fn, threshold?)` | `optional` | 결과 길이가 threshold 이하면 부분 리로드에서 생략 |
| `merge(fn, matchPropsOn?)` | `merge` | 클라이언트가 새 값을 이전 값과 병합 (무한 스크롤) |
| `deepMerge(fn)` | `deepMerge` | 클라이언트가 객체 트리를 deep-merge (예: 설정 UI) |
| `once(fn)` | `once` | 최초 (HTML) 페이지 로드에만 포함 |
| `lazy(fn, tag?)` | `lazy` | 요청당 한 번 평가; 같은 tag를 가진 키들 간 결과 공유 |

```ts
return this.inertia.render('Dashboard', {
  // 클라이언트가 한 prop만 가져올 때도 매번 포함.
  currentUser: always(() => ({ id: 1, name: 'Alice' })),

  // Deferred — 클라이언트가 부분 리로드를 트리거할 때까지 placeholder.
  stats: defer(() => this.metrics.today(), 'metrics'),

  // 페이지네이션 — 클라이언트가 새 페이지를 기존 배열에 병합.
  users: merge(() => this.userService.page(1), [['id']]),

  // 최초 페이지 로드에만 (HTML).
  featureFlags: once(() => ({ newDashboard: true })),

  // 요청당 한 번 평가, 두 키 간 공유.
  perms: lazy(() => this.computePerms(), 'perms'),
});
```

### 구현 노트: lazy 메모이제이션

`LazyProp`은 `tag`와 `invocations` 카운터를 가집니다. 어댑터는 응답 빌드 중 모든 `lazy` 팩토리를 실행하고 결과를 `Map<tag, value>`에 캐시합니다. 같은 요청에서 두 번째 `lazy(fn, 'perms')` 호출은 캐시를 히트하고 **두 번 호출되지 않습니다** — 한 번의 평가, 카운터 1회 증가.

이는 per-process가 아니라 **per-request**입니다 — 캐시는 모든 응답 빌드에서 새로 만들어집니다.

---

## 5. `<Form>` 서버 사이드 헬퍼

Inertia v3은 이 서버 사이드 헬퍼와 페어링되는 `<Form>` 컴포넌트를 도입했습니다. 패턴은 **Post/Redirect/Get**입니다.

```ts
@Post('/')
async store(@Body() input: Record<string, any>) {
  const form = this.inertia.form('Users/Create');
  const r = UserSchema.safeParse(input);

  if (!r.success) {
    const errors: Record<string, string[]> = {};
    for (const issue of r.error.issues) {
      const path = issue.path.join('.');
      (errors[path] ??= []).push(issue.message);
    }
    return form
      .withErrorBag('createUser')     // 한 페이지에 여러 폼이 있을 때 네임스페이스
      .withErrors(errors)              // 필드별 검증 에러
      .withValues(input)               // 폼 입력 재충원
      .render();                       // 에러와 함께 페이지 emit
  }

  return form.redirect('/users');      // 303 (PRG — 이중 제출 방지)
}
```

### 빌더 API

| 메서드 | 효과 |
| ------ | ------ |
| `withProps(p)` | props 배치 머지 |
| `with(k, v)` | 단일 prop 설정 |
| `withErrors(errors)` | 검증 에러 부착 (`Record<field, string \| string[]>`) |
| `withError(field, msg)` | 필드에 단일 에러 추가 |
| `withErrorBag(name)` | 폼 에러 네임스페이스 (한 페이지에 여러 폼) |
| `withValues(values)` | 제출 실패 후 폼 입력 재충원 |
| `render()` | 페이지 emit (에러 + 값 주입) |
| `redirect(url)` | 303 리다이렉트 (PRG 패턴) |
| `back(to?)` | `back`으로 303 리다이렉트 (또는 특정 URL) |

---

## 6. 폼 미들웨어 (CSRF)

폼 헬퍼는 **필드별 검증과 PRG**를 처리하지만 CSRF는 **업스트림** 관심사입니다. `inertiaFormMiddleware`는 모든 컨트롤러 앞에 실행되며 불일치 시 **419 Page Expired**를 반환합니다.

```ts
import { inertiaFormMiddleware } from '@nexusts/view/inertia';

app.server.app.use('*', inertiaFormMiddleware({
  validateCsrf: true,
  csrfHeader: 'X-CSRF-Token',
  csrfField: '_token',
  csrfSharedKey: 'csrfToken',   // 클라이언트 접근을 위해 이 키로 공유됨
}));
```

설정 키:

| 키 | 기본값 | 용도 |
| --- | ------- | ------- |
| `validateCsrf` | `true` | 마스터 스위치 — 테스트 시 `false` |
| `csrfHeader` | `'X-CSRF-Token'` | 검사할 헤더 |
| `csrfField` | `'_token'` | 폼 필드 폴백 |
| `csrfSharedKey` | `'csrfToken'` | `share(...)`를 통해 토큰을 노출할 위치 |

---

## 7. 요청 검사

어댑터는 다음 요청 헤더를 읽어 어떤 파이프라인을 사용할지, 어떻게 props를 필터링할지 결정합니다.

| 헤더 | 의미 |
| ------ | ------- |
| `X-Inertia: true` | XHR 방문 표시 (JSON 반환) |
| `X-Inertia-Version` | 에셋 불일치 검사용 |
| `X-Inertia-Partial-Component` | 부분 리로드 대상 컴포넌트 식별 |
| `X-Inertia-Partial-Data` | 쉼표 구분 `only` 필터 |
| `X-Inertia-Partial-Except` | 쉼표 구분 `except` 필터 |
| `X-Inertia-Reset` | 클라이언트가 폐기해야 할 props |

이들은 `InertiaResponse` 빌더에 의해 `InertiaRequestInfo` 객체로 추출됩니다.

---

## 8. 응답 헤더

| 헤더 | 보내는 시점 |
| ------ | ------- |
| `Vary: X-Inertia` | 모든 응답 (캐시가 XHR과 HTML을 혼합하지 않도록) |
| `X-Inertia: true` | JSON 응답만 |
| `X-Inertia-Location: <url>` | 409 (에셋 불일치) 및 `inertia.location(...)` |
| `Location: <url>` | `inertia.redirect(...)` 및 `inertia.back()` |

---

## 9. 에셋 버전 관리

`version`이 설정된 경우:

```ts
new Application(AppModule, {
  inertia: {
    version: '1.0.0',  // 또는 () => gitRevHash()
  },
});
```

클라이언트는 모든 요청에 `X-Inertia-Version: 1.0.0`을 포함합니다. 서버의 현재 버전이 일치하지 않으면 다음과 같이 응답합니다.

```http
HTTP/1.1 409 Conflict
X-Inertia-Location: /dashboard
```

Inertia 클라이언트는 409 + `X-Inertia-Location`을 (CSS / JS 번들을 다시 가져오는) 전체 페이지 리로드 지시문으로 해석합니다.

버전은 문자열 **또는** (sync 또는 async) 함수일 수 있으므로 앱은 런타임에 git SHA나 빌드 ID에 고정할 수 있습니다.

---

## 10. SSR

프레임워크는 플러그인 가능한 `SsrAdapter` 인터페이스를 제공합니다.

```ts
interface SsrAdapter {
  readonly name: string;
  render(component: string, props: Record<string, any>): Promise<SsrRenderResult>;
  head?(): Promise<string[]> | string[];
}

interface SsrRenderResult {
  html: string;                        // body HTML
  head?: string[];                     // 추가 <head> 태그
  data?: Record<string, any>;          // data-page JSON에 머지됨
}
```

어댑터가 없으면 프레임워크는 **최소 HTML 셸**로 폴백합니다.

```html
<!doctype html>
<html>
  <head>
    <title>{title}</title>
    <meta charset="utf-8">
  </head>
  <body>
    <div id="app" data-page="{...json...}"></div>
  </body>
</html>
```

클라이언트는 JS 로드 후 `data-page`에서 하이드레이트합니다 — 대부분의 앱에서 권장되는 시작점입니다.

### 내장 어댑터

| 어댑터 | 엔진 | SSR API |
| ------- | ------ | ------- |
| `createReactAdapter` | React 18+ | `react-dom/server.renderToString` |
| `createVueAdapter` | Vue 3 | `vue/server-renderer.renderToString` |
| `createSvelteAdapter` | Svelte 4/5 | `svelte/server.render` / `Component.render` |
| `createSolidAdapter` | Solid | `solid-js/web.renderToString` |

각 어댑터는 엔진을 lazy-import합니다. 사용하는 것만 설치하세요.

```ts
import { createReactAdapter, ComponentRegistry } from '@nexusts/view/inertia/ssr';

const components = new ComponentRegistry()
  .register('Home', HomePage)
  .register('Users/Index', UsersIndexPage);

app.inertia.setSsrAdapter(createReactAdapter({ components }));
```

---

## 11. 설계 결정

| 결정 | 근거 |
| -------- | --------- |
| `Response`를 서브클래싱하지 않고 **태그된 특수 객체** 사용 | 라우터가 저렴한 `Symbol` 기반 판별을 수행할 수 있고 테스트에서 응답을 검사 가능. |
| 판별자 태그를 가진 **클래스로서의 헬퍼** | 매직 스트링보다 발견하기 쉽고 메타데이터 (group, threshold, matchPropsOn)를 허용. |
| **tag로 키잉되는 lazy 메모이제이션** | 여러 키가 요청을 가로질러 계산 공유 가능. |
| 기본값으로 **no-op HTML 셸** | 프레임워크 선택을 강제하지 않음; 사용자가 명시적으로 SSR을 옵트인. |
| **폼 헬퍼는 CSRF 미들웨어와 분리** | 다른 관심사 — 헬퍼는 검증 + PRG, 미들웨어는 업스트림 게이트. |
| 모든 응답에 **`vary: X-Inertia`** | CDN이 HTML 클라이언트에 JSON을 (혹은 그 반대로) 제공하는 것을 방지. |

---

## 12. 향후 작업

- **우선순위가 있는 deferred 그룹** — 일부 deferred 그룹이 다른 그룹보다 먼저 해석되도록 허용.
- **스트리밍 SSR** — 엔진이 렌더링함에 따라 청크를 파이프 (v0.4).
- **컴포넌트 레벨 캐싱** — 비싼 페이지 컴포넌트용 `@cacheable(ttl)` 데코레이터.
- **히스토리 암호화 헬퍼** — v3 `encryptHistory` 플래그를 위한 일급 유틸.
