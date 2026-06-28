# GraphQL · `@nexusts/graphql`

> English version: [`graphql.md`](./graphql.md)

`@Module({ imports: [...] })` 한 줄로 NexusTS 앱에 GraphQL
엔드포인트를 추가한다. 프레임워크는 SDL-first GraphQL 어댑터를
출시하며, `/graphql` 엔드포인트, introspection-friendly
playground, SDL debug 뷰를 모두 마운트한다. 백엔드는 표준
`graphql` 패키지다.

## 한눈에

```bash
bun add graphql       # 유일한 peer-dep
```

```ts
import { GraphQLModule } from "@nexusts/graphql";

@Module({
  imports: [
    GraphQLModule.forRoot({
      typeDefs: `
        type Query {
          hello(name: String!): String!
        }
      `,
      resolvers: {
        Query: {
          hello: (_p, args) => `Hello, ${args.name}!`,
        },
      },
    }),
  ],
})
class AppModule {}

const app = new Application(AppModule);
const g = app.container.resolve(GraphQLService) as GraphQLService;
await GraphQLModule.mount(app.server.app, g);
await app.listen(3000);
```

```bash
curl -X POST http://localhost:3000/graphql \
  -H "Content-Type: application/json" \
  -d '{"query":"{ hello(name: \"world\") }"}'
# → {"data":{"hello":"Hello, world!"}}
```

## 아키텍처

```
┌──────────────────────────────────────────────────────────────┐
│  @Module({ imports: [GraphQLModule.forRoot({...})] })        │
│                                                              │
│  ┌──────────────┐   buildSchema(typeDefs)                    │
│  │ typeDefs ──▶ │   각 필드에 resolver.resolve 부착            │
│  │              │   첫 요청 시 lazy 빌드                      │
│  └──────────────┘                                            │
│                                                              │
│  ┌──────────────┐   POST /graphql                            │
│  │ resolvers ──▶│   GET  /graphql?query=...                    │
│  │              │   GET  /graphql/schema                      │
│  └──────────────┘   GET  /graphql (GraphiQL UI)               │
│                                                              │
│  ┌──────────────┐   요청마다:                                 │
│  │ context() ──▶│   { hono: c, state: {...} }                 │
│  │              │   각 resolver의 4번째 인자로 전달             │
│  └──────────────┘                                            │
└──────────────────────────────────────────────────────────────┘
```

`GraphQLModule.forRoot()`는 두 가지를 한다:

1. `typeDefs` / `resolvers` / `context()`로 설정된 singleton
   `GraphQLService`를 DI 컨테이너에 등록.
2. `imports: [...]`에 바로 넣을 수 있는 module class 반환.

`GraphQLModule.mount()`가 HTTP 라우트를 연결한다. 스키마는 첫
요청까지 빌드되지 않으며, 결과는 service에 캐시된다.

## `forRoot(config)` 레퍼런스

```ts
interface GraphQLConfig {
  /** SDL typeDefs (string 또는 string 배열). code-first 전용이면 생략 가능. */
  typeDefs?: string | string[];

  /** Resolver 맵: { [TypeName]: { [fieldName]: resolverFn } }. */
  resolvers?: ResolverMap;

  /** 엔드포인트 설정 (기본값: { path: "/graphql", enableGet: true }). */
  endpoint?: { path: string; enableGet?: boolean };

  /** Playground UI: "graphiql" (기본) 또는 "none". */
  playground?: "graphiql" | "none";

  /** 요청별 state 팩토리. */
  context?: (c: Context) => Record<string, any> | Promise<Record<string, any>>;

  /** SDL을 GET /graphql/schema 로 노출 (기본값: true). */
  exposeSchemaSDL?: boolean;

  /** introspection 허용 (기본값: true). 프로덕션에서는 false. */
  introspection?: boolean;

  /**
   * true 이면 `@Resolver` / `@Query` / `@Mutation` 데코레이터에서
   * SDL을 자동 합성한다 — `typeDefs` 불필요. 두 방식 병용 가능.
   */
  autoSchema?: boolean;
}
```

## Resolvers

Resolver는 표준 graphql-js 시그니처를 따르는 함수다:

```ts
type ResolverFn<TResult, TArgs, TParent> = (
  parent: TParent,
  args: TArgs,
  context: GraphQLContext,
  info: GraphQLResolveInfo,
) => TResult | Promise<TResult>;
```

`context`는 `GraphQLContext`이다:

```ts
interface GraphQLContext {
  hono: Context;                  // Hono 요청 컨텍스트
  state: Record<string, any>;      // context() 팩토리의 출력
}
```

`info`는 graphql-js의 `GraphQLResolveInfo`를 간소화한 것
(`fieldName`, `parentType`, `path` 등 포함) — 일반적인 케이스
(로깅, DataLoader 스코프 등)에 충분하다.

## 인증 사용자 / DB 트랜잭션 주입

`context()` 팩토리로 요청 스코프 사용자, db 트랜잭션 등을 모든
resolver에서 사용 가능하게 만든다:

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

## Code-first (autoSchema)

`autoSchema: true` 하나로 SDL 작성 없이 데코레이터만으로 스키마를
정의한다. `@Resolver` 클래스는 데코레이터 평가 시점에 전역 레지스트리에
자동 등록되므로 `forRoot()`에 나열할 필요가 없다.

### 표준 모드 (권장, v0.9+)

`@Query`/`@Mutation`의 `args` 옵션으로 인수 타입 선언:

```ts
import { Resolver, Query, Mutation } from "@nexusts/graphql";

@Resolver()
class HelloResolver {
  @Query("hello", { returns: "String!", args: { name: "String!" } })
  hello(name: string): string {
    return `Hello, ${name}!`;
  }

  @Mutation("echo", { returns: "String!", args: { message: "String!" } })
  echo(message: string): string {
    return message;
  }
}
```

### 레거시 모드 (`@Arg` 파라미터 데코레이터)

`experimentalDecorators: true` 사용 시 `@Arg` 파라미터 데코레이터도 사용 가능:

```ts
import { Resolver, Query, Mutation, Arg } from "@nexusts/graphql";

@Resolver()
class HelloResolver {
  @Query("hello", { returns: "String!" })
  hello(@Arg("name", "String!") name: string): string {
    return `Hello, ${name}!`;
  }

  @Mutation("echo", { returns: "String!" })
  echo(@Arg("message", "String!") message: string): string {
    return message;
  }
}
```

자동으로 생성되는 SDL:

```graphql
type Query {
  hello(name: String!): String!
}
type Mutation {
  echo(message: String!): String!
}
```

### 데코레이터 레퍼런스

| 데코레이터 | 위치 | 용도 |
|------------|------|------|
| `@Resolver(typeName?)` | 클래스 | resolver 클래스 등록. 이름 생략 시 클래스명에서 추론 (`UserResolver` → `"User"`). |
| `@Query(name?, { returns })` | 메서드 | `type Query` 필드 선언. `returns`는 GraphQL 타입 문자열 (예: `"String!"`). |
| `@Mutation(name?, { returns })` | 메서드 | `type Mutation` 필드 선언. |
| `@Subscription(name?, { returns })` | 메서드 | `type Subscription` 필드 선언. |
| `@Arg(name, type?)` | 파라미터 (레거시) | 필드 인수 선언. `type` 기본값 `"String"`. |
| `@Query/@Mutation args` | 옵션 | 표준 모드 인수 타입 맵: `{ name: "String!" }` |

### 타입 문자열 정규화

`returns` / `@Arg`의 타입에 TypeScript 별칭을 쓸 수 있다:

| TypeScript | GraphQL |
|------------|---------|
| `"string"` | `"String"` |
| `"int"` | `"Int"` |
| `"float"` / `"number"` | `"Float"` |
| `"boolean"` / `"bool"` | `"Boolean"` |
| `"id"` | `"ID"` |
| 그 외 | 그대로 사용 (사용자 정의 타입) |

Non-null(`!`)과 리스트(`[...]`) 래퍼는 그대로 보존된다.

### SDL-first와 병용

`typeDefs`와 `autoSchema: true`를 함께 사용하면 데코레이터 필드가
기존 `type Query`에 `extend type Query`로 병합된다:

```ts
GraphQLModule.forRoot({
  autoSchema: true,
  typeDefs: "type Query { ping: String! }",
  resolvers: { Query: { ping: () => "pong" } },
})
// 결과: type Query { ping } + extend type Query { 데코레이터 필드 }
```

### Resolver 클래스 자동 주입

`autoSchema: true` 상태에서 프레임워크는 `@Resolver` 클래스를
자동으로 인스턴스화하고 `@Query`/`@Mutation` 메서드를 resolver 맵에
등록한다. 인수는 graphql-js의 `args` 객체에서 이름으로 추출되어 메서드에
순서대로 전달된다. `@Arg`(레거시) 또는 `@Query` `args` 옵션(표준)
으로 인수 타입을 정의한다.

> **제약**: 자동 인스턴스화는 인자 없는 생성자를 가정한다. DI 컨테이너
> 연동이 필요한 경우 `config.resolvers`에 수동으로 resolver 맵을
> 추가하면 자동 주입 결과를 덮어쓸 수 있다.

## Subscriptions

typeDefs에 정의하고 `AsyncIterable`을 반환한다:

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

프레임워크는 `subscribe`를 graphql-js에 그대로 전달한다.

## peer-dep 관련

`@nexusts/graphql`는 `graphql` 패키지를 번들하지 **않는다**.
사용자가 직접 설치하는 peer-dep이다. 이유는 번들 크기 — 일반적인
앱은 GraphQL이 아니라 REST나 다른 NexusTS 모듈을 사용하므로 모든
번들에 graphql 파서/실행기가 들어가지 않게 하려는 것이다.

`graphql` 설치를 잊으면 첫 사용 시 명확한 에러:

```
[nexusts/graphql] The `graphql` package is required for execution.
Install it with `bun add graphql`. Original error: ...
```

## Smoke test

모든 예제의 `bun main.ts`는 프로세스를 부팅하고 엔드포인트를
마운트하며, smoke runner는 `Listening` 로그 라인을 기다린다.
32-graphql-hello 예제가 `tests/examples/smoke.test.ts`에
등재되어 있다.

## 로드맵 (v0.8+)

- **DataLoader 통합.** N+1 쿼리 배칭 — resolver별 `loader` 옵션.
- **DI 연동 자동 인스턴스화.** `@Resolver` 클래스를 NexusTS 컨테이너에서
  resolve하여 주입된 서비스를 사용할 수 있도록.
- **Federation.** Apollo Federation v2 subgraph 지원.
- **Persisted queries.** APQ (Automatic Persisted Queries) 지원.

## 참고

- [`../design/graphql.md`](../design/graphql.md) — 아키텍처 심층 문서
  (resolver 생명주기, 스키마 빌드 단계, peer-dep 근거).
- [`../../user-guide/database.md`](./database.md) — Drizzle
  서비스를 GraphQL resolver로 사용.
- [`../../user-guide/auth.md`](./auth.md) — `AuthService` →
  GraphQL context 패턴.
- [graphql-js 문서](https://graphql.org/graphql-js/) — 기본 executor.
