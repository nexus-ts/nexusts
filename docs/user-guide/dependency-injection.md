# Dependency Injection

> 한국어 버전: [`dependency-injection.ko.md`](./dependency-injection.ko.md)

NexusTS uses NestJS-style dependency injection. Services, repositories,
and adapters are wired together through `@Module({ providers, exports })`
and resolved automatically at construction time.

## 0. Two injection patterns

NexusTS supports two DI patterns side-by-side:

### Field injection (standard decorators, v0.9+)

```ts
import { Injectable, Inject } from '@nexusts/core';

@Injectable()
export class UserService {
  @Inject('LOG') declare log: { info: (msg: string) => void };

  findAll() {
    this.log.info('UserService.findAll');
    return [{ id: 1, name: 'Alice' }];
  }
}
```

This pattern works with TC39 standard ES decorators — no
`experimentalDecorators` or `reflect-metadata` required.

### Constructor injection (legacy, v0.8 and earlier)

```ts
@Injectable()
export class UserService {
  constructor(
    @Inject('LOG') private readonly log: { info: (msg: string) => void },
  ) {}
  // ...
}
```

Constructor injection requires `experimentalDecorators: true` and an
explicit `@Inject(Token)` for each parameter (Bun's native TS
transformer doesn't emit `design:paramtypes`).

> **Migration tip**: Replace `@Inject(T) declare t: T;`
> with `@Inject(T) declare t: T;` and remove the constructor. The DI
> container automatically detects field injection and switches to the
> no-arg constructor path.

---

## 1. The basics

The container builds the dependency graph from the module's `providers`
list and resolves it lazily on first use.

---

## 2. Why explicit `@Inject(...)`?

TypeScript can read constructor parameter types from
`design:paramtypes` metadata — **but only** when you compile with `tsc`
and `emitDecoratorMetadata: true` (no longer needed — removed). Bun's native TypeScript transformer
does **not** emit that metadata.

NexusTS therefore standardizes on **explicit `@Inject(Token)`** on each
parameter. This makes the framework portable across `tsc`, `ts-node`,
Bun, and Cloudflare Workers.

```ts
// Always portable — recommended.
@Inject(UserRepository) declare repo: UserRepository;

// Works under tsc, ignored by Bun's transformer.
constructor(private repo: UserRepository) {}
```

> If you build with `tsc` first and run with `node` or `bun dist/`,
> the bare-type form works. Under `bun app/...` (the default), use
> `@Inject(...)`.

---

## 3. Providers

A `Provider` is anything that produces a value when asked. Five shapes:

### 3.1 Class provider (most common)

```ts
@Module({
  providers: [UserService],   // shorthand: { provide: UserService, useClass: UserService }
})
```

### 3.2 Value provider

```ts
import { drizzle } from 'drizzle-orm/bun-sqlite';

@Module({
  providers: [
    { provide: 'DB', useValue: drizzle('app.db') },
  ],
})
```

Inject as:

```ts
@Injectable()
class UserRepository {
  @Inject('DB') declare db: any;
}
```

### 3.3 Factory provider

```ts
@Module({
  providers: [
    {
      provide: 'CONFIG',
      useFactory: () => ({
        env: process.env['NODE_ENV'] ?? 'development',
        port: Number(process.env['PORT'] ?? 3000),
      }),
    },
  ],
})
```

### 3.4 Alias provider

```ts
@Module({
  providers: [
    { provide: 'LOGGER', useExisting: 'CONSOLE_LOGGER' },
    { provide: 'CONSOLE_LOGGER', useValue: console },
  ],
})
```

### 3.5 Token provider (symbol/string keys)

```ts
const CONFIG = Symbol('CONFIG');

@Module({
  providers: [
    { provide: CONFIG, useValue: { port: 3000 } },
  ],
})
```

### 3.6 Class-with-TOKEN pattern (recommended for services)

Many built-in services ship with a `static readonly TOKEN = Symbol.for(...)` to
allow injection **either** by class or by token. To use the token form, you
must register the class and the token in tandem:

```ts
// app/services/user.service.ts
import { Injectable } from '@nexusts/core';

@Injectable()
export class UserService {
  static readonly TOKEN = Symbol.for('nexus:app:UserService');

  greet(name: string) { return `hello ${name}`; }
}
```

```ts
// app.module.ts
@Module({
  providers: [
    UserService,
    { provide: UserService.TOKEN, useExisting: UserService },   // ← alias
  ],
  exports: [UserService, UserService.TOKEN],                    // ← export both
})
```

Now both work:

```ts
@Inject(UserService) declare users: UserService;     // class form
@Inject(UserService.TOKEN) declare users: UserService; // token form
```

> ⚠️ **Why this matters**: If you only register `UserService` and try
> `@Inject(UserService.TOKEN)`, you will see
> `No provider for "undefined"`. The container registers the class as
> a key but doesn't know that `UserService.TOKEN` is the same thing.
> The `useExisting` alias bridges them.
>
> For module-internal use, prefer the simpler class form. Reserve the
> token form for cross-module injection or library exposure.

### 3.7 Static-only (no DI) — when you don't need the container

If you just need a value (e.g. for a CLI script or one-off script), you
can construct services directly:

```ts
import { UserService } from './user.service.js';

const users = new UserService(...);
users.greet('alice');
```

Many services also expose static helpers that don't require DI at all
— for example, `@nexusts/crypto` exports `scryptHash` / `scryptVerify`
as standalone functions in addition to the `HashService` class.

---

## 4. Modules

A `@Module` declares what it owns and what it shares:

```ts
@Module({
  imports: [OtherModule],          // bring in another module's exports
  controllers: [UserController],   // HTTP handlers
  providers: [UserService, UserRepository, { provide: 'DB', useValue: db }],
  exports: [UserService],          // make these tokens available to importers
})
export class UserModule {}
```

> **Encapsulation.** Anything not in `exports` is private to its
> declaring module. `OtherModule` cannot inject `UserRepository` unless
> `UserModule` re-exports it.

### Module tree

A typical app:

```ts
@Module({ imports: [UserModule, OrderModule, AuthModule] })
class AppModule {}
```

Each module gets its own **child container** (`DIContainer`); exported
tokens surface to the parent so importing modules can resolve them.

---

## 5. Constructor injection

```ts
@Injectable()
class OrderService {
  constructor(
    @Inject(UserService) private users: UserService,
    @Inject('PAYMENT_GATEWAY') private payments: PaymentGateway,
  ) {}
}
```

The container walks the parameter list, resolves each token, and
constructs the instance. Failed resolution throws an error pointing
at the missing token.

---

## 6. Property injection

Not recommended, but supported via a class-field decorator (rarely
needed):

```ts
@Injectable()
class LegacyService {
  @Inject('LEGACY_DB')
  private legacyDb!: any;
}
```

Prefer constructor injection — it makes dependencies explicit and
testable.

---

## 7. Scopes

| Scope | Behaviour | Default? |
| ----- | --------- | -------- |
| `singleton` | One instance per container | yes |
| `transient` | New instance per `resolve()` | no |

```ts
@Module({
  providers: [
    UserService,                                // singleton
    {
      provide: 'REQUEST_ID',
      useFactory: () => crypto.randomUUID(),
      scope: 'transient',                       // new on every resolve
    },
  ],
})
```

A `request` scope (one instance per HTTP request) is planned for v0.2.

---

## 8. Circular dependencies

The container detects cycles and throws a helpful error:

```
Error: Circular dependency detected for token "A"
  A → B → C → A
```

Break a cycle by introducing a factory:

```ts
// Before: A imports B, B imports A → cycle.
@Injectable()
class A { @Inject(B) declare b: B; }
@Injectable()
class B { @Inject(A) declare a: A; }

// After: B receives A via a forward-reference factory.
@Injectable()
class B {
  private a?: A;
  setA(a: A) { this.a = a; }
}
```

---

## 9. Testing with mocks

Replace a provider in tests by creating a child container manually:

```ts
import { DIContainer } from '@nexusts/core';

const container = new DIContainer();
container.register({ provide: 'DB', useValue: mockDb });
container.register(UserRepository);

const repo = container.resolve(UserRepository);   // gets the mocked DB
```

Or use `Application.bootstrap()` with overrides (planned for v0.2):

```ts
// Future API — not yet implemented.
const app = Application.bootstrap(AppModule, {
  overrides: [
    { provide: 'DB', useValue: mockDb },
  ],
});
```

---

## 10. Global Modules (@Global)

A module decorated with `@Global()` exports its providers to **all**
modules automatically, without explicit import.

```ts
import { Global, Module, Injectable } from '@nexusts/core';

@Injectable()
class DatabaseService {
  query(sql: string) { /* ... */ }
}

@Global()
@Module({
  providers: [DatabaseService],
  exports: [DatabaseService],
})
class DatabaseModule {}

@Module({
  imports: [DatabaseModule],
  // DatabaseService is available here without importing DatabaseModule
})
class AppModule {}
```

Use `@Global()` for cross-cutting services (database, logger, config,
metrics) that are used by many modules. For feature-specific services,
prefer explicit imports.

---

## 11. Lifecycle Hooks

Services can implement lifecycle interfaces to run code at startup or
shutdown:

```ts
import { Injectable, OnModuleInit, OnModuleDestroy } from '@nexusts/core';

@Injectable()
class DatabaseService implements OnModuleInit, OnModuleDestroy {
  async onModuleInit() {
    // Connect to database, warm caches, subscribe to queues
    await this.pool.connect();
    console.log('Database connected');
  }

  async onModuleDestroy() {
    // Close connections, flush logs, cleanup
    await this.pool.end();
    console.log('Database disconnected');
  }
}
```

Available hooks:

| Interface | Called |
|-----------|--------|
| `OnModuleInit` | After all providers are instantiated, before the server starts |
| `OnApplicationInit` | After all `onModuleInit` hooks complete, before the server starts |
| `OnModuleDestroy` | After the server stops, during graceful shutdown |
| `BeforeApplicationDestroy` | At the very start of shutdown (before server stops) |
| `OnApplicationDestroy` | At the very end of shutdown (after server stops, after all `onModuleDestroy`) |

The framework calls these hooks in order during `app.bootstrap()` and
`app.shutdown()`. SIGTERM and SIGINT automatically trigger graceful
shutdown with all destroy hooks.

---

## 12. Common patterns

### Database / ORM

```ts
@Module({
  providers: [
    { provide: 'DB', useValue: drizzle('app.db') },
    UserRepository,
  ],
  exports: [UserRepository],
})
class DatabaseModule {}

@Module({
  imports: [DatabaseModule],
  providers: [UserService],
})
class UserModule {}
```

### Configuration

```ts
@Module({
  providers: [
    {
      provide: 'CONFIG',
      useFactory: () => loadConfig(),   // throws if env is invalid
    },
  ],
  exports: ['CONFIG'],
})
class ConfigModule {}
```

### Logging

```ts
@Module({
  providers: [
    { provide: 'LOG', useValue: console },
  ],
})
class AppModule {
  // every service can `@Inject('LOG')` the same logger.
}
```

---

## 13. Debugging

Set `NEXUS_DEBUG=1` to print the dependency graph at boot:

```bash
NEXUS_DEBUG=1 bun app/main.ts
```

Output:

```
[nexus] Modules: 3
[nexus] Controllers: [UserController, OrderController]
[nexus] Providers (root): [Inertia, CONFIG, DB]
[nexus] Inertia: enabled
```

---

## 14. Common error patterns

| Error | Cause | Fix |
| --- | --- | --- |
| `No provider for "undefined"` | `static TOKEN` defined but not registered | Add `{ provide: X.TOKEN, useExisting: X }` to providers |
| `No provider for "DB"` | Token not in any module's `providers` | Add to providers of the importing module |
| `Cannot resolve parameter at index 0` | Decorator metadata missing | Use explicit `@Inject(Token)` instead of bare type |
| `Circular dependency detected for token "A"` | A→B→A cycle | Use forward-reference factory |
| Controller methods not appearing in router | Controller defined inline in `main.ts` (Bun TS transformer quirk) | Move each controller to its own file |
| `private readonly` + `@Inject` doesn't work on Bun | Bun 1.3.14 TS transformer quirk | Use manual assignment: declare field, assign in constructor |
| `@Inject(SomeClass)` works but `@Inject(SomeClass.TOKEN)` doesn't | Only the class is registered | Register both: `providers: [SomeClass, { provide: SomeClass.TOKEN, useExisting: SomeClass }]` |

> For a complete walkthrough of these patterns with real examples see
> **[debugging guide](../design/architecture.md)**.
