# Inertia.js Adapter Design

> Last updated: v0.1
> 한국어 버전: [`inertia-adapter.ko.md`](./inertia-adapter.ko.md)

## 1. Scope

The Inertia adapter implements the server side of the [Inertia.js
protocol](https://inertiajs.com/the-protocol). It is **a special
response type** rather than a separate framework — controllers return
`inertia.render(component, props)` and the router routes the response
through either the JSON pipeline (XHR visits) or the HTML shell
pipeline (first-page loads).

The adapter ships with:

- v2 / v3 protocol support (asset versioning, partial reloads, deferred
  props, merge / deep-merge props)
- A `<Form>` server-side helper that owns the Post/Redirect/Get flow
- Asset-version mismatch handling (409 + `X-Inertia-Location`)
- Shared props (per-request global data)
- A pluggable SSR adapter interface (React, Vue, Svelte, Solid)

Implementation lives in [`src/core/view/inertia/`](../../src/core/view/inertia/).

---

## 2. Architecture

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
                │  (tagged special object) │
                └──────────────────────────┘
                              │
                              ▼
                ┌──────────────────────────┐
                │   Router / serializer    │◄───── inspects INERTIA_RESPONSE_TAG
                └──────────────────────────┘
                              │
              ┌───────────────┴───────────────┐
              ▼                               ▼
   ┌──────────────────────┐         ┌──────────────────────┐
   │ First-page (no       │         │ XHR visit (X-Inertia │
   │ X-Inertia header)    │         │ header present)      │
   │                      │         │                      │
   │ → HTML shell with    │         │ → JSON page object   │
   │   data-page JSON     │         │   only               │
   └──────────────────────┘         └──────────────────────┘
```

The `INERTIA_RESPONSE_TAG` is a `Symbol.for('nexus:InertiaResponse')`
discriminator the router recognizes without `instanceof` checks.

---

## 3. The `Inertia` class

`app.inertia` exposes the controller-facing API:

| Method | Purpose |
| ------ | ------- |
| `render(component, props)` | Build a page response (2-arg form) |
| `render(component, deferred, props)` | Build a page response (3-arg form with deferred map) |
| `form(component, initialProps?)` | Begin a `<Form>` server-side flow |
| `location(url)` | 409 with `X-Inertia-Location` (forces full reload) |
| `redirect(url, status?)` | 302/303 client-side redirect |
| `back()` | 302 with `Location: back` (step back in history) |
| `share(key, value)` / `share({...})` | Add global per-page props |
| `unshare(key)` | Remove a shared key |
| `setVersion(version)` | Set asset version |
| `setSsrAdapter(adapter)` | Plug in React/Vue/Svelte/Solid SSR |
| `setTitle(title)` | Default HTML title |
| `setEncryptHistory(true)` | v3 history-encryption flag |
| `setSharedProps(fn)` | Per-request shared-props resolver |

The instance is also registered in the DI container under
`Inertia.TOKEN` (a `Symbol.for('nexus:Inertia')`), so controllers can
inject it:

```ts
@Inject(Inertia.TOKEN) declare inertia: Inertia;
```

---

## 4. Lazy-evaluation helpers

Each helper is a thin class wrapper with a `__inertiaKind` discriminator.
The adapter inspects the discriminator at serialization time to decide
when and how to evaluate the wrapped callback.

| Helper | Tag | Behaviour |
| ------ | --- | --------- |
| `defer(fn, group?)` | `deferred` | Send `null` placeholder; client refetches later via partial reload |
| `always(fn)` | `always` | Include on every partial reload, ignoring `only` / `except` filter |
| `optional(fn, threshold?)` | `optional` | Skip on partial reloads when resolved length ≤ threshold |
| `merge(fn, matchPropsOn?)` | `merge` | Client appends/merges new value with previous (infinite scroll) |
| `deepMerge(fn)` | `deepMerge` | Client deep-merges object trees (e.g. settings UI) |
| `once(fn)` | `once` | Include only on first (HTML) page load |
| `lazy(fn, tag?)` | `lazy` | Resolve once per request; share the result across keys with the same tag |

```ts
return this.inertia.render('Dashboard', {
  // Always included on every visit, even when the client only fetches one prop.
  currentUser: always(() => ({ id: 1, name: 'Alice' })),

  // Deferred — placeholder until the client triggers a partial reload.
  stats: defer(() => this.metrics.today(), 'metrics'),

  // Pagination — the client merges the new page into its existing array.
  users: merge(() => this.userService.page(1), [['id']]),

  // Only on first page load (HTML).
  featureFlags: once(() => ({ newDashboard: true })),

  // Computed once per request, shared between two keys.
  perms: lazy(() => this.computePerms(), 'perms'),
});
```

### Implementation note: lazy memoization

`LazyProp` carries a `tag` and an `invocations` counter. The adapter
runs all `lazy` factories during the response build, caching the
results in a `Map<tag, value>`. A second `lazy(fn, 'perms')` in the
same request hits the cache and increments the counter is **not**
called twice — only one resolution, one counter bump.

This is per-request, not per-process: the cache is built fresh on every
response build.

---

## 5. `<Form>` server-side helper

Inertia v3 introduces a `<Form>` component that pairs with this
server-side helper. The pattern is **Post/Redirect/Get**:

```ts
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
      .withErrorBag('createUser')     // namespace for multiple forms on one page
      .withErrors(errors)              // per-field validation errors
      .withValues(input)               // re-populate the form
      .render();                       // emit the page with errors
  }

  return form.redirect('/users');      // 303 (PRG — prevents double-submit)
}
```

### Builder API

| Method | Effect |
| ------ | ------ |
| `withProps(p)` | Merge a batch of props at once |
| `with(k, v)` | Set a single prop |
| `withErrors(errors)` | Attach validation errors (`Record<field, string \| string[]>`) |
| `withError(field, msg)` | Add a single error to a field |
| `withErrorBag(name)` | Namespace the form's errors (multiple forms on one page) |
| `withValues(values)` | Re-populate the form inputs after a failed submission |
| `render()` | Emit the page (with errors + values injected) |
| `redirect(url)` | 303 redirect (PRG pattern) |
| `back(to?)` | 303 redirect to `back` (or a specific URL) |

---

## 6. Form middleware (CSRF)

The form helper handles **per-field validation and PRG**, but CSRF is an
**upstream** concern. `inertiaFormMiddleware` runs before any
controller and returns **419 Page Expired** on mismatch.

```ts
import { inertiaFormMiddleware } from '@nexusts/view/inertia';

app.server.app.use('*', inertiaFormMiddleware({
  validateCsrf: true,
  csrfHeader: 'X-CSRF-Token',
  csrfField: '_token',
  csrfSharedKey: 'csrfToken',   // shared under this key for client access
}));
```

Configuration keys:

| Key | Default | Purpose |
| --- | ------- | ------- |
| `validateCsrf` | `true` | Master switch — set `false` for testing |
| `csrfHeader` | `'X-CSRF-Token'` | Header to inspect |
| `csrfField` | `'_token'` | Form-field fallback |
| `csrfSharedKey` | `'csrfToken'` | Where to expose the token via `share(...)` |

---

## 7. Request inspection

The adapter reads these request headers to decide which pipeline to
use and how to filter props:

| Header | Meaning |
| ------ | ------- |
| `X-Inertia: true` | Marks an XHR visit (return JSON) |
| `X-Inertia-Version` | For asset-mismatch checks |
| `X-Inertia-Partial-Component` | Identifies which component a partial reload is for |
| `X-Inertia-Partial-Data` | Comma-separated `only` filter |
| `X-Inertia-Partial-Except` | Comma-separated `except` filter |
| `X-Inertia-Reset` | Comma-separated props the client should discard |

These are extracted into an `InertiaRequestInfo` object by the
`InertiaResponse` builder.

---

## 8. Response headers

| Header | Sent on |
| ------ | ------- |
| `Vary: X-Inertia` | Every response (so caches don't mix XHR and HTML) |
| `X-Inertia: true` | JSON responses only |
| `X-Inertia-Location: <url>` | 409 (asset mismatch) and `inertia.location(...)` |
| `Location: <url>` | `inertia.redirect(...)` and `inertia.back()` |

---

## 9. Asset versioning

When `version` is configured:

```ts
new Application(AppModule, {
  inertia: {
    version: '1.0.0',  // or () => gitRevHash()
  },
});
```

The client includes `X-Inertia-Version: 1.0.0` on every request. If
the server's current version doesn't match, it responds:

```http
HTTP/1.1 409 Conflict
X-Inertia-Location: /dashboard
```

The Inertia client interprets 409 + `X-Inertia-Location` as a directive
to do a full page reload (re-fetching CSS / JS bundles) before
retrying.

The version can be a string **or** a function (sync or async), so apps
can pin to a git SHA or build ID at runtime.

---

## 10. SSR

The framework ships a pluggable `SsrAdapter` interface:

```ts
interface SsrAdapter {
  readonly name: string;
  render(component: string, props: Record<string, any>): Promise<SsrRenderResult>;
  head?(): Promise<string[]> | string[];
}

interface SsrRenderResult {
  html: string;                        // body HTML
  head?: string[];                     // extra <head> tags
  data?: Record<string, any>;          // merged into data-page JSON
}
```

Without an adapter, the framework falls back to a **minimal HTML
shell**:

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

The client hydrates from `data-page` after JS loads — the recommended
starting point for most apps.

### Built-in adapters

| Adapter | Engine | SSR API |
| ------- | ------ | ------- |
| `createReactAdapter` | React 18+ | `react-dom/server.renderToString` |
| `createVueAdapter` | Vue 3 | `vue/server-renderer.renderToString` |
| `createSvelteAdapter` | Svelte 4/5 | `svelte/server.render` / `Component.render` |
| `createSolidAdapter` | Solid | `solid-js/web.renderToString` |

Each lazy-imports its engine; install only what you use:

```ts
import { createReactAdapter, ComponentRegistry } from '@nexusts/view/inertia/ssr';

const components = new ComponentRegistry()
  .register('Home', HomePage)
  .register('Users/Index', UsersIndexPage);

app.inertia.setSsrAdapter(createReactAdapter({ components }));
```

---

## 11. Design decisions

| Decision | Rationale |
| -------- | --------- |
| **Tagged special object** instead of subclassing `Response` | Lets the router do cheap `Symbol`-based discrimination and keeps the response inspectable for tests. |
| **Helpers as classes with discriminator tags** | More discoverable than magic strings; allows metadata (group, threshold, matchPropsOn). |
| **Lazy memoization keyed by tag** | Lets multiple keys share a computation without leaking across requests. |
| **No-op HTML shell by default** | Avoids forcing a framework choice; users opt into SSR explicitly. |
| **Form helper separate from CSRF middleware** | Different concerns — the helper owns validation + PRG, the middleware owns the upstream gate. |
| **`vary: X-Inertia` on every response** | Prevents CDNs from serving JSON to HTML clients and vice versa. |

---

## 12. Future work

- **Deferred groups with priority** — let some deferred groups resolve
  before others.
- **Streaming SSR** — pipe chunks as the engine renders (v0.4).
- **Component-level caching** — `@cacheable(ttl)` decorator for
  expensive page components.
- **History-encryption helpers** — first-class utilities for the v3
  `encryptHistory` flag.
