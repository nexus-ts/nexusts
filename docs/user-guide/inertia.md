# Inertia.js Adapter

> 한국어 버전: [`inertia.ko.md`](./inertia.ko.md)

The Inertia adapter lets you build **single-page applications** without
writing an API. The server returns a page object (component name +
props), and the client renders it with React, Vue, Svelte, or Solid.

For the architectural deep-dive, see
[`../design/inertia-adapter.md`](../design/inertia-adapter.md).

---

## 1. Enable it

```ts
import { Application } from '@nexusts/core';
import { AppModule } from './app.module.js';

const app = new Application(AppModule, {
  inertia: {
    version: '1.0.0',                 // asset version (string or fn)
    title: 'My App',
    sharedProps: () => ({             // per-request global props
      appName: 'My App',
      currentUser: await getCurrentUser(),
    }),
  },
});
```

After construction, `app.inertia` is an `Inertia` instance. It's also
registered in the DI container under `Inertia.TOKEN` so you can inject
it.

---

## 2. Render a page

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

The router detects the response type and emits:

- **First load (no `X-Inertia` header)** — HTML shell with `data-page` JSON
- **XHR visits (`X-Inertia: true`)** — JSON page object

---

## 3. Lazy-evaluation helpers

Wrap any prop value in one of these helpers to control **when** it's
resolved and **how** the client merges it.

| Helper | Behaviour |
| ------ | --------- |
| `defer(fn, group?)` | Send `null` placeholder; client refetches via partial reload |
| `always(fn)` | Include on every partial reload, ignoring `only` / `except` |
| `optional(fn, threshold?)` | Skip on partial reloads when length ≤ threshold |
| `merge(fn, matchPropsOn?)` | Client merges new value with previous (infinite scroll) |
| `deepMerge(fn)` | Client deep-merges object trees |
| `once(fn)` | Include only on first (HTML) page load |
| `lazy(fn, tag?)` | Resolve once per request; share across keys with same tag |

```ts
@Get('/dashboard')
dashboard() {
  return this.inertia.render('Dashboard', {
    // Always included, even when the client only fetches one prop.
    currentUser: always(() => ({ id: 1, name: 'Alice' })),

    // Deferred — placeholder, then a follow-up partial reload.
    stats: defer(async () => ({ visits: 1234 }), 'metrics'),

    // Pagination — client appends to its existing array.
    users: merge(() => this.userService.page(1), [['id']]),

    // Only on first page load (HTML).
    featureFlags: once(() => ({ newDashboard: true })),

    // Computed once per request, shared between two keys.
    perms: lazy(() => this.computePerms(), 'perms'),
  });
}
```

Helpers are imported from `@nexusts/view/inertia`.

---

## 4. Asset versioning

When `version` is configured, the client sends `X-Inertia-Version: <value>`
on every request. On mismatch, the server responds:

```http
HTTP/1.1 409 Conflict
X-Inertia-Location: /dashboard
```

The Inertia client interprets this as a directive to do a **full page
reload** (refetching CSS / JS bundles) before retrying. Pin the version
to a build ID or git SHA for production:

```ts
new Application(AppModule, {
  inertia: {
    version: () => execSync('git rev-parse --short HEAD').toString().trim(),
  },
});
```

---

## 5. Shared data

Share global per-page data (current user, flash messages, CSRF token):

```ts
// Static
app.inertia.share('appName', 'My App');
app.inertia.share({ csrfToken: '...', flash: { type: 'success', message: 'Saved!' } });

// Or use a function in the config (per-request)
inertia: {
  sharedProps: async () => ({
    currentUser: await getCurrentUser(),
  }),
}
```

Shared props appear in **every** page response and survive partial
reloads.

---

## 6. The `<Form>` server-side helper

Inertia v3's `<Form>` component pairs with this server-side helper:

```ts
import { z } from 'zod';
import { Controller, Post, Inject } from '@nexusts/core';
import { Inertia } from '@nexusts/view/inertia';
import type { Context } from 'hono';

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
        .withErrorBag('createUser')    // namespace for multiple forms / page
        .withErrors(errors)             // per-field validation errors
        .withValues(input)              // re-populate the form
        .render();                      // emit the page with errors
    }

    return form.redirect('/users');     // 303 (PRG — prevents double-submit)
  }
}
```

### Builder methods

| Method | Effect |
| ------ | ------ |
| `withProps(p)` | Merge a batch of props at once |
| `with(k, v)` | Set a single prop |
| `withErrors(errors)` | Attach validation errors |
| `withError(field, msg)` | Add a single error to a field |
| `withErrorBag(name)` | Namespace the form's errors |
| `withValues(values)` | Re-populate form inputs after failure |
| `render()` | Emit the page |
| `redirect(url)` | 303 redirect (PRG) |
| `back(to?)` | 303 redirect to `back` or a specific URL |

---

## 7. Full-page navigation & history

To force the client to **bypass Inertia's client-side history** (logout,
asset revalidation, etc.):

```ts
@Post('/logout')
logout() {
  return this.inertia.location('/login');   // 409 + X-Inertia-Location
}
```

To step back in history:

```ts
this.inertia.back();   // 302 with Location: back
```

---

## 8. SSR

Plug in a server-side renderer for your frontend:

```ts
import { createReactAdapter, ComponentRegistry } from '@nexusts/view/inertia/ssr';

const components = new ComponentRegistry()
  .register('Home', HomePage)
  .register('Users/Index', UsersIndexPage);

app.inertia.setSsrAdapter(createReactAdapter({ components }));
```

| Adapter | Engine | SSR API |
| ------- | ------ | ------- |
| `createReactAdapter` | React 18+ | `react-dom/server.renderToString` |
| `createVueAdapter` | Vue 3 | `vue/server-renderer.renderToString` |
| `createSvelteAdapter` | Svelte 4/5 | `svelte/server.render` / `Component.render` |
| `createSolidAdapter` | Solid | `solid-js/web.renderToString` |

Without an adapter, the framework emits a minimal HTML shell and the
client hydrates from `data-page` after JS loads.

---

## 9. CSRF middleware

The `<Form>` helper handles validation and PRG; CSRF is upstream:

```ts
import { inertiaFormMiddleware } from '@nexusts/view/inertia';

app.server.app.use('*', inertiaFormMiddleware({
  validateCsrf: true,
  csrfHeader: 'X-CSRF-Token',
  csrfField: '_token',
  csrfSharedKey: 'csrfToken',
}));
```

Returns **419 Page Expired** on mismatch.

---

## 10. Putting it together

A complete `app.module.ts` with Inertia:

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
    title: 'NexusTS Demo',
    sharedProps: async () => ({
      currentUser: null,   // TODO: real auth
    }),
  },
});

await app.listen(3000);
```

---

## 11. Request / response reference

### Response headers

| Header | Sent on |
| ------ | ------- |
| `Vary: X-Inertia` | Every response |
| `X-Inertia: true` | JSON responses only |
| `X-Inertia-Location: <url>` | 409 (asset mismatch) and `inertia.location(...)` |
| `Location: <url>` | `inertia.redirect(...)` and `inertia.back()` |

### Request headers

| Header | Purpose |
| ------ | ------- |
| `X-Inertia: true` | Marks an XHR visit |
| `X-Inertia-Version` | Asset version check |
| `X-Inertia-Partial-Component` | Identifies the partial-reload target |
| `X-Inertia-Partial-Data` | `only` filter |
| `X-Inertia-Partial-Except` | `except` filter |
| `X-Inertia-Reset` | Client-discard markers |

---

## 12. FAQ

**Q: Can I use Inertia without SSR?**
Yes. Omit `setSsrAdapter(...)` and the framework emits a minimal HTML
shell. The client hydrates from `data-page` after JS loads.

**Q: Can I share data per-request and per-process?**
Yes — combine `inertia.share(...)` (per-process static) with
`sharedProps: () => ...` (per-request dynamic). They merge.

**Q: How do I do nested layouts?**
Inertia has no built-in layout system — use your frontend's. In React,
wrap pages with a layout component. In Vue, use slot-based layouts.

**Q: How do I handle errors thrown in a controller?**
The framework's default error handler converts thrown errors to JSON.
Wrap `inertia.render(...)` in try/catch if you need to render an error
page.
