# GraphQL · `@nexusts/graphql`

> 한국어 버전: [`graphql.ko.md`](./graphql.ko.md)

Add a GraphQL endpoint to your NexusTS application with a single
`@Module({ imports: [...] })` entry. The framework ships an
SDL-first GraphQL adapter that mounts a `/graphql` endpoint, an
introspection-friendly playground, and an SDL debug view, all
backed by the standard `graphql` package.

## TL;DR — Two approaches

```bash
bun add graphql       # the only peer-dep you need
```

### Approach 1: SDL-first (classic)

```ts
import { GraphQLModule } from "@nexusts/graphql";

@Module({
  imports: [
    GraphQLModule.forRoot({
      typeDefs: `
        type Query { hello(name: String!): String! }
      `,
      resolvers: {
        Query: { hello: (_p, args) => `Hello, ${args.name}!` },
      },
    }),
  ],
})
class AppModule {}

const app = new Application(AppModule);
await GraphQLModule.mount(app.server.app, app.container.resolve(GraphQLService));
await app.listen(3000);
```

### Approach 2: Code-first with `autoSchema: true`

```ts
import { Resolver, Query } from "@nexusts/graphql";

@Resolver()
class HelloResolver {
  @Query({ args: { name: "String!" } })
  hello(name: string): string {
    return `Hello, ${name}!`;
  }
}

@Module({
  imports: [GraphQLModule.forRoot({ autoSchema: true })],
})
class AppModule {}
```

```bash
curl -X POST http://localhost:3000/graphql \
  -H "Content-Type: application/json" \
  -d '{"query":"{ hello(name: \"world\") }"}'
# → {"data":{"hello":"Hello, world!"}}
```

## Architecture

```
┌──────────────────────────────────────────────────────────────┐
│  @Module({ imports: [GraphQLModule.forRoot({...})] })        │
│                                                              │
│  ┌──────────────┐   buildSchema(typeDefs)                    │
│  │ typeDefs ──▶ │   attach resolver.resolve for each field     │
│  │              │   lazy on first request                     │
│  └──────────────┘                                            │
│                                                              │
│  ┌──────────────┐   POST /graphql                            │
│  │ resolvers ──▶│   GET  /graphql?query=...                    │
│  │              │   GET  /graphql/schema                      │
│  └──────────────┘   GET  /graphql (GraphiQL UI)               │
│                                                              │
│  ┌──────────────┐   per-request:                              │
│  │ context() ──▶│   { hono: c, state: {...} }                 │
│  │              │   passed as 4th arg to each resolver         │
│  └──────────────┘                                            │
└──────────────────────────────────────────────────────────────┘
```

`GraphQLModule.forRoot()` does two things:

1. Registers a singleton `GraphQLService` in the DI container
   configured with your `typeDefs` / `resolvers` / `context()`.
2. Returns a configured module class ready to be put in
   `imports: [...]`.

`GraphQLModule.mount()` then wires the HTTP routes. The schema is
**not** built until the first request — and the result is cached on
the service.

## `forRoot(config)` reference

```ts
interface GraphQLConfig {
  /** SDL typeDefs (string or array of strings). */
  typeDefs?: string | string[];

  /** Resolver map: { [TypeName]: { [fieldName]: resolverFn } }. */
  resolvers?: ResolverMap;

  /** Auto-generate SDL from @Resolver/@Query/@Mutation decorators. */
  autoSchema?: boolean;

  /** Endpoint config (default: { path: "/graphql", enableGet: true }). */
  endpoint?: { path: string; enableGet?: boolean };

  /** Playground UI: "graphiql" (default) or "none". */
  playground?: "graphiql" | "none";

  /** Per-request state factory. */
  context?: (c: Context) => Record<string, any> | Promise<Record<string, any>>;

  /** Expose the SDL at GET /graphql/schema (default: true). */
  exposeSchemaSDL?: boolean;

  /** Allow introspection (default: true). Set to false in prod. */
  introspection?: boolean;
}
```

## Resolvers

A resolver is a function with the standard graphql-js signature:

```ts
type ResolverFn<TResult, TArgs, TParent> = (
  parent: TParent,
  args: TArgs,
  context: GraphQLContext,
  info: GraphQLResolveInfo,
) => TResult | Promise<TResult>;
```

The `context` is a `GraphQLContext`:

```ts
interface GraphQLContext {
  hono: Context;                  // the Hono request context
  state: Record<string, any>;      // output of your context() factory
}
```

The `info` is a small stand-in for graphql-js's
`GraphQLResolveInfo` (carries `fieldName`, `parentType`,
`path`, etc.) — enough for the common cases (logging,
data-loader scopes, etc.).

## Injecting auth user / DB tx

Use the `context()` factory to make the request-scoped user, db
transaction, or anything else available to every resolver:

```ts
GraphQLModule.forRoot({
  typeDefs: `type Query { me: User! } type User { id: ID! email: String! }`,
  resolvers: {
    Query: {
      me: (_p, _a, ctx) => db.users.findById(ctx.state.userId),
    },
  },
  context: async (c) => {
    const userId = await readSessionCookie(c);
    return { userId };
  },
});
```

## Code-first via decorators (stable)

The module exports `@Resolver`, `@Query`, `@Mutation`,
`@Subscription` decorators for a code-first approach.
Set `autoSchema: true` in `GraphQLModule.forRoot()` and the
framework synthesizes the SDL from your decorator metadata
automatically — no hand-written `typeDefs` needed.

### Standard mode (recommended, v0.9+)

Use the `args` option on `@Query`/`@Mutation`/`@Subscription` to
declare argument types. This works with both TC39 standard decorators
and legacy `experimentalDecorators` mode.

```ts
import { Resolver, Query, Mutation } from "@nexusts/graphql";

@Resolver()
class UserResolver {
  @Query({ args: { limit: "Int" } })
  users(limit: number): User[] {
    return this.userService.findAll(limit);
  }

  @Mutation({ args: { name: "String!" } })
  addUser(name: string): User {
    return this.userService.create({ name });
  }
}

@Module({
  imports: [GraphQLModule.forRoot({ autoSchema: true })],
})
class AppModule {}
```

### Legacy mode (`@Arg` parameter decorator)

When using `experimentalDecorators: true`, you can alternatively use
the `@Arg` parameter decorator:

```ts
import { Resolver, Query, Mutation, Arg } from "@nexusts/graphql";

@Resolver()
class UserResolver {
  @Query()
  users(@Arg("limit", "Int") limit: number): User[] {
    return this.userService.findAll(limit);
  }

  @Mutation()
  addUser(@Arg("name", "String!") name: string): User {
    return this.userService.create({ name });
  }
}
```

### How it works

1. `@Resolver`-decorated classes are collected by the global
   registry (`getRegisteredResolvers()`).
2. When `autoSchema: true` (or any `@Resolver` class exists),
   the SDL synthesis engine (`mergeSDLWithDecorators()`) reads
   each resolver's `@Query`, `@Mutation`, `@Subscription` and
   `@Arg` metadata (legacy mode) or `args` option (standard mode) and builds the corresponding
   `type Query / Mutation / Subscription` SDL blocks.
3. If your `typeDefs` already defines one of these root types,
   the synthesiser uses `extend type Query { ... }` to merge
   rather than duplicate.
4. Resolver instances are auto-wired into the resolver map —
   `@Arg` parameters are extracted from graphql-js's `args`
   object by name.

### Coexisting with SDL

`autoSchema: true` and manual `typeDefs` can coexist. Use
`resolvers` for hand-written resolvers alongside decorator-based
ones — the deep-merge helper ensures auto-wired fields are not
clobbered.

### Argument types

In **standard decorator mode** (v0.9+, recommended), provide argument
types via the `args` option on `@Query`/`@Mutation`:

```ts
@Query({ args: { name: "String!", limit: "Int" } })
myQuery(name: string, limit: number): string { ... }
```

In **legacy mode** (`experimentalDecorators: true`), use the `@Arg`
parameter decorator:

```ts
@Query()
myQuery(@Arg("name", "String!") name: string, @Arg("limit", "Int") limit: number): string { ... }
```

Both modes accept GraphQL SDL strings or TypeScript aliases —
they are normalized to canonical GraphQL scalars:

| TypeScript alias | GraphQL scalar |
|-----------------|----------------|
| `string` | `String` |
| `int`, `Int` | `Int` |
| `float`, `Float` | `Float` |
| `boolean`, `bool` | `Boolean` |
| `id`, `ID` | `ID` |
| `String!` | `String!` (preserved) |
| `[Int]` | `[Int]` (preserved) |

Appending `!` or wrapping `[...]` works on any input.

## Subscriptions

Define them in your typeDefs and resolve to an `AsyncIterable`:

```ts
typeDefs: `
  type Query  { hello: String! }
  type Subscription { tick: Int! }
`,
resolvers: {
  Query: { hello: () => "world" },
  Subscription: {
    tick: {
      subscribe: async function* () {
        let n = 0;
        while (true) {
          await new Promise((r) => setTimeout(r, 1000));
          yield { tick: ++n };
        }
      },
    },
  },
},
```

The framework forwards `subscribe` to graphql-js as-is.

## The peer-dep story

`@nexusts/graphql` does **not** bundle the `graphql`
package. It's a peer-dep you install yourself. The reason is
bundle size — a typical app uses REST or one of the other
NexusTS modules, not GraphQL, and we don't want the graphql
parser/executor in every bundle.

If you forget to install `graphql`, the first attempt to use
the service will throw:

```
[nexusts/graphql] The `graphql` package is required for execution.
Install it with `bun add graphql`. Original error: ...
```

## Smoke test

Every example's `bun main.ts` boots a process, mounts the
endpoints, and the smoke runner waits for the `Listening` log
line. The 32-graphql-hello example demonstrates this in
`tests/examples/smoke.test.ts`.

## What's planned for v0.8+

- **DataLoader integration.** N+1 query batching; per-resolver
  `loader` option.
- **Federation.** Apollo Federation v2 subgraph support.
- **Persisted queries.** APQ support is in `graphql` 16+; needs
  plumbing.

Code-first SDL synthesis (`autoSchema: true`) shipped in v0.7.6.

## See also

- [`../design/graphql.md`](../design/graphql.md) — architecture
  deep-dive (resolver lifecycle, schema build steps, peer-dep
  rationale).
- [`../../user-guide/database.md`](./database.md) — using
  Drizzle services as GraphQL resolvers.
- [`../../user-guide/auth.md`](./auth.md) — `AuthService` →
  GraphQL context pattern.
- [graphql-js docs](https://graphql.org/graphql-js/) — the
  underlying executor.
