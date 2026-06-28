# GraphQL module — design

> 한국어 버전: [`graphql.ko.md`](./graphql.ko.md)

This document explains the architecture of `@nexusts/graphql`:
why it's SDL-first, why `graphql` is a peer-dep, how resolvers are
attached to a `buildSchema()` result, and how the Hono route is
wired.

## Goals

1. **Add a GraphQL endpoint with one `imports: [...]` entry.** No
   extra HTTP server, no `app.use(...)` boilerplate, no separate
   config file.
2. **Match graphql-js conventions.** SDL-first, standard 4-tuple
   resolver signature, `buildSchema()` + `execute()`. Anyone who's
   used `graphql-yoga` or `@nestjs/graphql` should feel at home.
3. **Stay small.** Don't ship a graphql-tools, federation runtime,
   DataLoader manager, or any of the other "kitchen-sink" add-ons.
   Those are easy to layer on later.
4. **Match the framework's "compose your own stack" philosophy.**
   Don't force a code-first DSL that hides SDL. Don't auto-generate
   types from your database. Just expose the SDL you wrote and the
   resolvers you wired.

## Why SDL-first?

The alternative is code-first: a TypeScript class that *describes*
the schema (via `@ObjectType`, `@Field`, etc.). NestJS GraphQL and
TypeGraphQL both ship code-first modes. We deliberately didn't:

- **Code-first forces a TS type system on the schema.** Every
  resolver return type must be expressible as a TS class. That
  rules out the simplest case — `JSON` scalars, ad-hoc unions,
  polymorphic interfaces — without escape hatches.
- **SDL is the lingua franca.** Tools (codegen, postman, the
  GraphQL playground, schema registries) all consume SDL.
  Hand-writing SDL is fine; hand-writing TS classes that compile
  to the same schema is more code for the same outcome.
- **It defers a hard problem.** Code-first needs a TS type system
  that's expressive enough to model SDL's. graphql-js's `lexical`
  / `valueFromAST` AST traversal is a non-trivial implementation
  that we'd rather not ship in v0.7.

We expose `@Resolver` / `@Query` / `@Mutation` decorators for the
NestJS-style crowd, but the SDL synthesis isn't wired up yet (see
"Future work" below). Until then, the recommendation is "use SDL".

## Why `graphql` as a peer-dep?

A GraphQL executor is ~50KB minified. That's not free. Most apps
that pull in `@nexusts/core` don't need GraphQL — they need
REST, an admin panel, a CLI, etc. Bundling `graphql` everywhere
would penalize those users for a feature they don't use.

By making it an optional peer-dep:

- **The framework bundle stays small.** `@nexusts/graphql`
  itself is just the wiring (mount points, decorator metadata,
  service lifecycle). It does not include the parser or executor.
- **Users opt in.** `bun add graphql` once, then `forRoot({...})`
  works. The first attempt to use the service without `graphql`
  installed throws a clear error pointing at the install command.

The lazy load lives in `GraphQLService.loadGraphQLJs()`:

```ts
const mod = await import("graphql");
return mod as GraphQLJs;
```

Caching (`_graphql`, `_loadAttempted`) ensures we don't re-attempt
the dynamic import on every request.

## Schema build

The schema is built lazily on the first call to
`GraphQLService.ensureSchema()`:

```ts
private async _buildSchema(sdl: string[]): Promise<GraphQLSchema> {
  const g = await loadGraphQLJs();
  const schema = g.buildSchema(sdl.join("\n"));
  wrapSchemaWithResolvers(schema, this.mergedResolverMap());
  return schema;
}
```

We use `buildSchema()` (SDL → schema) rather than `new
GraphQLSchema({ query, types, ... })` because SDL is what the user
wrote and it's the simplest possible input. The downside is that
`buildSchema()` builds fields without resolvers — they're expected
to be looked up on the `parent` value at execution time. For
our case, where each resolver is a top-level `(parent, args, ctx,
info) => T` function, we need to wire those functions to the
fields ourselves.

`wrapSchemaWithResolvers()` does this:

```ts
for (const [typeName, fields] of Object.entries(resolvers)) {
  const type = schema.getTypeMap()[typeName];
  for (const [fieldName, resolver] of Object.entries(fields)) {
    const field = type.getFields()[fieldName];
    field.resolve = (parent, args, ctx, info) =>
      fn(parent, args, ctx, info);
  }
}
```

`buildSchema()` returns mutable field objects (despite
`GraphQLSchema` itself being immutable), so this works at
runtime. We tested against graphql-js 16 and 17 — both expose
`getTypeMap()` and the field's `resolve` slot.

The future-friendly alternative — using `new GraphQLSchema({...})`
with all field types manually — would be more code but would
sidestep the mutability assumption. We picked the simpler path
because graphql-js has been stable on this shape for years.

## Execution

```ts
async execute(source, variableValues, operationName, contextValue) {
  const g = await loadGraphQLJs();
  const schema = await this.ensureSchema();
  const document = g.parse(source);
  const errors = g.validate(schema, document, g.specifiedRules);
  if (errors.length > 0) return { errors: formatErrors(errors) };
  return await g.execute({
    schema, document, rootValue: undefined,
    contextValue, variableValues, operationName,
  });
}
```

The graphql 17 change of `execute()` from positional args to a
single object forced us to wrap the call rather than type it
precisely. The `(...args: any[]) => Promise<GraphQLExecutionResult>
| GraphQLExecutionResult` type accommodates both shapes.

The result envelope matches graphql-js's: `{ data, errors,
extensions }`. We forward errors as-is for validation failures and
unwrap `data` for the caller. The HTTP layer (in
`GraphQLModule.mount()`) maps this to a JSON response — 200 when
`data` is present, 400 when the only thing in the envelope is
`errors[]`.

## HTTP mounting

`GraphQLModule.mount(app, svc)` wires four routes:

| Method | Path | Purpose |
|--------|------|---------|
| `POST`  | `/graphql`            | queries + mutations |
| `GET`   | `/graphql?query=...`  | pre-baked queries (browser-shared links, persisted query cache) |
| `GET`   | `/graphql/schema`     | the SDL as `text/plain` (debug) |
| `GET`   | `/graphql`            | GraphiQL playground when no query is set |

The request body is read with a content-type sniff: `application/json`
parses as JSON; `application/x-www-form-urlencoded` parses with
`URLSearchParams`. Both the standard POST format (HTTP body) and
the persisted-query format (GET ?query=...) work.

The playground HTML is inlined — there's no CDN, no external
assets. It's deliberately minimal (a textarea + Run button +
JSON result panel) so it works in air-gapped environments and
private networks. Users who want the full GraphiQL experience
(with tabs, schema explorer, docs panel) can install `graphiql`
and mount it themselves.

## Context and the resolver signature

Each resolver receives the standard graphql-js 4-tuple `(parent,
args, ctx, info)`. The `ctx` is a `GraphQLContext`:

```ts
interface GraphQLContext {
  hono: Context;                  // the inbound Hono context
  state: Record<string, any>;      // output of context(c)
}
```

The framework constructs the context in two places:

1. **`GraphQLModule.mount()`** (HTTP path): calls `svc.buildContext(c)`
   which calls `svc.config.context(c)` (if defined) and returns
   `{ hono, state }`. Resolvers see this `state` as their 4th
   arg's `.state` property.
2. **`GraphQLService.execute()` direct call** (programmatic path):
   if no context was passed in and the service has a `context()`
   factory, we build a synthetic context with a stub Hono ctx.
   This is so that resolvers which depend on `ctx.state` (e.g.
   `whoami: (_, __, ctx) => ctx.state.user`) still work when
   `execute()` is called outside of an HTTP request.

## Resolver map shape

```ts
const resolvers: ResolverMap = {
  Query: {
    hello: (_p, args) => `Hello, ${args.name}!`,
  },
  Mutation: {
    signup: (_p, args) => createUser(args),
  },
  Subscription: {
    tick: { subscribe: async function* () { ... } },
  },
};
```

Top-level keys are GraphQL type names (`Query`, `Mutation`,
`Subscription`, plus any user-defined types). Nested keys are
field names. Values are either a function `(parent, args, ctx,
info) => T` or `{ resolve: Function, subscribe: Function }` for
subscriptions.

If multiple resolvers map to the same field, the later one wins.
This is intentional — the `resolvers` option in `forRoot()` is the
user's "patch" over whatever the decorator-based or
SDL-default-derived map has built.

## Decorator API & global resolver registry

The framework exports `@Resolver`, `@Query`, `@Mutation`,
`@Subscription`, and `@Arg` (legacy) decorators. The metadata they
write is read by `GraphQLService` to build the resolver map.

### Standard mode (v0.9+, recommended)

Use `args` option on `@Query`/`@Mutation`:

```ts
@Resolver("User")
class UserResolver {
  @Query("currentUser")
  me(ctx: Context) { return (ctx as any).state?.user; }

  @Mutation({ args: { name: "String!" } })
  updateProfile(name: string) { ... }
}
```

### Legacy mode (`experimentalDecorators: true`)

Use `@Arg` parameter decorator:

```ts
@Resolver("User")
class UserResolver {
  @Query("currentUser")
  me(ctx: Context) { return (ctx as any).state?.user; }

  @Mutation()
  updateProfile(@Arg("name") name: string) { ... }
}
```

### Global registry (v0.7.6+)

`@Resolver`-decorated classes are automatically collected into a
global `Set<Function>` at decoration time. The registry is accessible
via `getRegisteredResolvers()` (exported from `@nexusts/graphql`).
This means resolver classes no longer need to be manually listed in
`GraphQLModule.forRoot()` — just add them to the module's
`providers` array and the framework picks them up.

```ts
import { getRegisteredResolvers } from "@nexusts/graphql";

const all = getRegisteredResolvers();
// → [UserResolver, PostResolver, ...]
```

For testing, `clearResolverRegistry()` resets the registry.

### SDL synthesis (shipped v0.7.6)

`mergeSDLWithDecorators()` now synthesises `type Query / Mutation /
Subscription` blocks from registered `@Resolver` classes. When
`autoSchema: true` is set (or when any `@Resolver` class exists),
the schema is built entirely from decorator metadata — no manual
`typeDefs` needed. If the user's `typeDefs` already defines a root
type, the synthesiser uses `extend type` to merge.

`_autoWireResolvers()` instantiates each `@Resolver` class and wires
its `@Query`/`@Mutation` methods into the resolver map. `@Arg`
parameters are extracted from graphql-js's `args` object by name.

### Future work (v0.8+)

- **DataLoader integration.**

## Future work

- **DataLoader.** A per-resolver `loader` option that gives the
  resolver a batched + cached loader scoped to the request.
- **Persisted queries (APQ).** Built into graphql-js 16+; needs a
  tiny wiring layer on top of our endpoint.
- **Federation v2.** Apollo Federation v2 subgraph support via
  `@apollo/subgraph`. The schema construction is the same — just
  add `@key` / `@requires` / `@provides` decorators on top.
- **Custom directives.** SDL directives (`@auth`, `@cache`,
  `@deprecated`) implemented as decorators on resolver methods.

## See also

- [`../user-guide/graphql.md`](../user-guide/graphql.md) — user guide.
- [`../analysis/nestjs-comparison.md`](../analysis/nestjs-comparison.md)
  — GraphQL gap (now closed).
- [graphql-js documentation](https://graphql.org/graphql-js/) — the
  executor we delegate to.
