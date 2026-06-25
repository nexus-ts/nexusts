# Dependency Injection Container Design

> Last updated: v0.1
> 한국어 버전: [`di-container.ko.md`](./di-container.ko.md)

## 1. Purpose

The DI container is the heart of NexusTS. It:

- **Registers** providers (classes, values, factories, aliases)
- **Resolves** dependencies recursively through `__nexus_meta__` (standard mode) or `reflect-metadata` / Map fallback (legacy mode)
- **Manages** instance lifecycles (singleton by default)
- **Detects** circular dependencies with helpful errors
- **Scopes** providers per-module (modules are encapsulation units)

It is implemented in [`src/core/di/container.ts`](../../src/core/di/container.ts)
and [`src/core/di/scanner.ts`](../../src/core/di/scanner.ts).

---

## 2. Core types

```ts
// src/core/di/tokens.ts
type InjectionToken<T = any> = Type<T> | string | symbol;

interface Provider<T = any> {
  provide: InjectionToken<T>;
  useClass?: Type<T>;
  useValue?: T;
  useFactory?: (...args: any[]) => T;
  useExisting?: InjectionToken<T>;
  scope?: ProviderScope;        // 'singleton' | 'transient'
}

type ModuleOptions = {
  imports?: Type[];
  controllers?: Type[];
  providers?: Provider[];
  exports?: InjectionToken[];
};
```

A provider can be **any** of:

| Form | Meaning |
| ---- | ------- |
| `Type<T>` (a class) | Treated as `{ provide: Type, useClass: Type }` |
| `{ useClass }` | The container instantiates `useClass` |
| `{ useValue }` | The container stores the value directly |
| `{ useFactory, deps? }` | The container calls the factory with resolved deps |
| `{ useExisting }` | Alias for another token in the same container |

---

## 3. Container hierarchy

The framework builds a **tree of containers** — one per module. Each
child container has a `parent` reference and falls back to the parent
for unresolved tokens.

```
ApplicationContainer   ← global providers (Inertia, env, ...)
 ├── UserModule.container
 │     ├── UserController
 │     ├── UserService
 │     └── UserRepository
 ├── OrderModule.container
 │     ├── OrderController
 │     └── OrderService
 └── AuthModule.container  ← exported tokens surface to ApplicationContainer
       └── AuthService
```

Why hierarchical?

- **Encapsulation** — a service declared in `UserModule` cannot be
  injected from `OrderModule` unless `UserModule` re-exports it.
- **Auditability** — the dependency graph is a tree, easy to render.
- **Testability** — a child container can be created with mocks.

---

## 4. Module scanning

`ModuleScanner.scan(rootModule)` walks the `@Module({...})` graph and:

1. Recurses into `imports` (depth-first), creating a child container for
   each module.
2. Reads each module's `controllers` and `providers` and registers them
   into the module's child container.
3. For each `exports` entry, creates a passthrough factory on the
   **parent** container so importing modules can resolve the token.

The scanner memoizes already-visited modules in a `Map`, breaking cycles
where two modules import each other.

> **Cycle protection.** The scanner pre-fills a placeholder before
> recursing into imports. If two modules import each other, the second
> visit finds the placeholder instead of recursing forever.

---

## 5. Resolution algorithm

```
resolve(token):
  if currently_resolving(token):
    throw CircularDependencyError
  mark(token, resolving)
  try:
    record = find_provider(token)        // self, then parent chain
    if not record: throw NoProviderError
    if record.scope === 'singleton' and cached: return cached
    instance = instantiate(record)
    cache if singleton
    return instance
  finally:
    unmark(token, resolving)
```

`find_provider` walks the container chain self → parent → … →
`ApplicationContainer` (the root). This is how cross-module injection
works: an exported token lives on the parent, and a child asks for it
through the chain.

### Constructor injection (legacy)

The container uses two strategies to read constructor parameter types:

1. **Explicit `@Inject(Token)`** on each parameter (always available).
2. **`design:paramtypes` metadata** (only available when building with
   `tsc` and the `emitDecoratorMetadata` flag).

Because Bun's native TypeScript transformer does **not** emit
`design:paramtypes`, NexusTS standardizes on explicit `@Inject(...)`
parameter decorators. The bare-type form (`constructor(private svc: UserService)`)
is supported when running with `tsc`-compiled output.

### Field injection (standard decorator mode, v0.9+)

In standard decorator mode (TC39), the container supports field injection
as the primary pattern:

```ts
@Injectable()
class UserService {
  @Inject('DB') declare db: DrizzleService;
  @Inject(Logger) declare logger: Logger;
}
```

The container's `instantiate()` method checks for field injection first:

```ts
const fieldInjections = getFieldInjections(cls);
if (hasFieldInjections) {
  // Create instance with no args, then inject fields
  const instance = new cls();
  for (const [fieldName, token] of Object.entries(fieldInjections)) {
    instance[fieldName] = this.resolve(token);
  }
  return instance;
}
// Fallback: legacy constructor injection
const params = paramTypes.map(t => this.resolve(t));
return new cls(...params);
```

The `@Inject(token)` field decorator stores injection metadata on
`Class.__nexus_meta__` (standard mode) or via `safeDefineMeta` (legacy
mode). The `getFieldInjections()` helper reads from both stores.

### Circular dependency detection

The container tracks `resolving: Set<InjectionToken>` and throws
`Error: Circular dependency detected for token "Foo"` if it encounters
the same token twice during a single resolution. The error message names
the cycle so users can break it by introducing a `useFactory` indirection.

---

## 6. Scopes

| Scope | Behaviour | Use case |
| ----- | --------- | -------- |
| `singleton` *(default)* | One instance per container | Services, repositories, configuration |
| `transient` | New instance per `resolve()` | Stateful helpers, request-scoped builders |

```ts
@Module({
  providers: [
    UserService,                          // singleton
    { provide: 'REQUEST_ID', useFactory: () => crypto.randomUUID(), scope: 'transient' },
  ],
})
```

> **Future scope**: a `request` scope (one instance per HTTP request)
> will be added in v0.2 alongside the auth/session middleware.

---

## 7. Exports

`exports: [...]` makes a token available to **importing** modules. The
framework materializes exports as factory providers on the importing
parent:

```ts
@Module({
  providers: [AuthService],
  exports: [AuthService],
})
class AuthModule {}

@Module({
  imports: [AuthModule],
})
class AppModule {
  // AuthService is now resolvable in AppModule's container chain.
}
```

Anything not in `exports` stays private to its declaring module.

---

## 8. Public surface

| Export | Purpose |
| ------ | ------- |
| `DIContainer` | The container class itself |
| `ApplicationContainer` | Specialized root container with `registerModule()` |
| `ModuleScanner` | Walks the module graph |
| `InjectionToken`, `Provider`, `ModuleOptions` | Type definitions |
| `@Module`, `@Injectable`, `@Inject`, `@Controller`, `@Repository` | Decorators (see [`../../src/core/decorators`](../../src/core/decorators)) |

All of the above are re-exported from the `@nexusts/core` entry point.

---

## 9. Design decisions

| Decision | Rationale |
| -------- | --------- |
| **Explicit `@Inject(...)`** required | Portable across Bun's transformer, `tsc`, and `ts-node`. |
| **Per-module containers** | Encapsulation, auditability, easy mocking. |
| **Lazy instantiation** | Failures surface at boot only if a provider is actually resolved. |
| **Eager scan** | All modules are walked at `new Application(...)` — boot-time errors instead of request-time. |
| **Cycle detection** | Surfaces architectural mistakes early with a precise error. |

---

## 10. Current status & future work

| Feature | Status |
|---------|--------|
| **request scope** — per-request instances via AsyncLocalStorage | ✅ v0.4 |
| **Global modules** — `@Global()` decorator exports to all modules | ✅ v0.7 |
| **Lifecycle hooks** — `OnModuleInit`, `OnModuleDestroy`, etc. | ✅ v0.7 |
| **Conditional providers** — env-driven wiring | 🔲 Planned |
| **Multi-binding** — `forRoot()` static helper for plugins | 🔲 Planned |
