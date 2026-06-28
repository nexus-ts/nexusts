# Request-scoped DI · Tier 2 v0.4

> Tier 2 gap from the v0.3 gap analyses, closed in **v0.4**.

The framework's DI container now supports three provider scopes:

| Scope | Created | Lifetime |
| ----- | ------- | -------- |
| `singleton` (default) | Once | Application lifetime |
| `request` | Once per HTTP request | Single request — shared across consumers in that request |
| `transient` | Every resolve | GC-managed |

The `request` scope is the killer feature for multi-tenant apps,
per-request audit logging, request-id propagation, and
per-transaction database contexts.

---

## 1. Quick start

```ts
import { Inject, Injectable, REQUEST } from '@nexusts/core';

@Injectable({ scope: 'request' })
class RequestContext {
  id = crypto.randomUUID();
  userId: string | null = null;

  @Inject(REQUEST) declare req: any;
  constructor() {
    this.userId = extractUserFromToken(this.req.header('authorization'));
  }
}

@Injectable()
class AuditService {
  // Same `RequestContext` instance is shared across all consumers
  // in one request — even deep in the call tree.
  @Inject(RequestContext) declare ctx: RequestContext;

  log(event: string) {
    console.log(`[${this.ctx.id}] ${event}`);
  }
}
```

The framework installs a Hono middleware that activates a per-request
DI scope automatically — no manual wiring required. Just declare a
class with `scope: 'request'` and inject it.

---

## 2. The `REQUEST` token

`@Inject(REQUEST)` injects the active Hono context. Use it to read
headers, the URL, the response, etc. from any service that depends
on the current request.

```ts
@Injectable({ scope: 'request' })
class RequestContext {
  @Inject(REQUEST) declare req: any;
  constructor() {
    this.id = this.req.header('x-request-id') ?? crypto.randomUUID();
  }
}
```

The `REQUEST` token resolves from any container (root, request,
module-local) — the value always points to the active request.

---

## 3. Helpers (`getRequest`, `getRequestScope`, `getRequestState`)

For service code that's deep in the call tree (where constructor
injection isn't ergonomic), the framework ships three helpers:

```ts
import { getRequest, getRequestScope, getRequestState, setRequestState } from '@nexusts/core';

function auditDeepInTheCallTree() {
  const req = getRequest();          // Hono context
  const scope = getRequestScope();   // entire scope (id, context, state, container)
  if (!scope) return; // not inside a request

  scope.state.set('visits', (scope.state.get('visits') as number ?? 0) + 1);
}
```

`getRequestState(key)` / `setRequestState(key, value)` are a typed
key-value bag that lives for the duration of the request. Useful
for short-lived cross-cutting data (current user, request id,
flash messages, etc.).

---

## 4. Scope semantics

| Provider scope | Same request, multiple consumers | Different requests |
| -------------- | --------------------------------- | ------------------ |
| `singleton` (default) | Same instance | Same instance |
| `request` | Same instance (per request) | Different instances |
| `transient` | Different instances | Different instances |

Example:

```ts
// LoggerService is shared across the whole app
@Injectable()
class LoggerService { /* ... */ }

// RequestContext is per-request
@Injectable({ scope: 'request' })
class RequestContext { /* ... */ }

// Connection is opened fresh for every call (e.g. for-each)
@Injectable({ scope: 'transient' })
class Worker { /* ... */ }
```

---

## 5. Auto-install in `Application`

The framework installs the request-scope middleware automatically
when you boot the application:

```ts
const app = new Application(AppModule);
await app.listen(3000);
// The middleware is the first thing on the Hono app.
// Every request gets a fresh RequestScope.
```

You can also install it manually on a custom Hono app:

```ts
import { Hono } from 'hono';
import { requestScopeMiddleware } from '@nexusts/core';

const root = new DIContainer();
root.register(RequestContext as any);

const app = new Hono();
app.use('*', requestScopeMiddleware(root));
```

---

## 6. Transactions (companion to `@nexusts/drizzle`)

Request-scoped DI is a natural fit for database transactions.
`@nexusts/drizzle`'s `db.transaction(fn)` runs `fn` inside a
transaction; combine with a request-scoped `Tx` provider to make
the same transaction available to every service in the request.

```ts
@Injectable({ scope: 'request' })
class Tx {
  handle = drizzle.transaction(() => {});
  done = false;
}

@Injectable()
class OrderService {
  @Inject(Tx) declare private tx: Tx;
  @Inject(DrizzleService) declare private db: DrizzleService;
  async createOrder(data: OrderInput) {
    // All DB calls in this request share `tx.handle`.
    await this.db.insert(orders).values(data);
  }
}

// In a controller:
@Post('/orders')
async createOrder(@Req() c: any) {
  return db.transaction(async () => {
    return c.json({ ok: true });
  });
}
```

(Tx plumbing not shipped yet — this is illustrative. The
`@nexusts/drizzle` module is what owns the actual transaction
boundary.)

---

## 7. Verification

```ts
import { describe, it, expect } from 'vitest';
import { DIContainer } from '@nexusts/core';
import { Injectable, Inject } from '@nexusts/core';
import { requestScopeMiddleware } from '@nexusts/core';
import { getRequestScope } from '@nexusts/core';

@Injectable({ scope: 'request' })
class Ctx { id = Math.random().toString(36).slice(2, 8); }

@Injectable()
class A { @Inject(Ctx) declare ctx: Ctx; }
@Injectable()
class B { @Inject(Ctx) declare ctx: Ctx; }

describe('request scope', () => {
  it('shares the same instance across consumers in one request', async () => {
    const root = new DIContainer();
    root.register(Ctx as any);
    root.register(A as any);
    root.register(B as any);

    const app = new Hono();
    app.use('*', requestScopeMiddleware(root));
    app.get('/', (c) => {
      const a = root.resolve<A>(A as any);
      const b = root.resolve<B>(B as any);
      return c.json({ same: a.ctx === b.ctx });
    });

    const res = await app.request('http://x/');
    const body = await res.json();
    expect(body.same).toBe(true);
  });
});
```

---

## 8. See also

- [v0.3 NestJS gap analysis](../analysis/nestjs-comparison.md) — Tier 2 §3.3 (Request-scoped DI as a core feature)
- [v0.3 AdonisJS gap analysis](../analysis/adonisjs-comparison.md) — Tier 2 multi-tenant context
- [`./sse.md`](./sse.md) — the companion Tier 2 module shipped just before
- [`./openapi.md`](./openapi.md) — Tier 1 v0.4 module
- [AsyncLocalStorage (Node docs)](https://nodejs.org/api/async_context.html#class-asynclocalstorage) — the underlying primitive
- [NestJS request scope](https://docs.nestjs.com/fundamentals/injection-scopes) — the canonical reference for the pattern
