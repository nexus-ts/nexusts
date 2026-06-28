# GraphQL 모듈 — 디자인

> English version: [`graphql.md`](./graphql.md)

이 문서는 `@nexusts/graphql`의 아키텍처를 설명한다: SDL-first를
선택한 이유, `graphql`이 peer-dep인 이유, resolver가 `buildSchema()` 결과에
어떻게 부착되는지, Hono 라우트가 어떻게 연결되는지.

## 목표

1. **`imports: [...]` 한 줄로 GraphQL 엔드포인트 추가.** 별도 HTTP
   서버도, `app.use(...)` 보일러플레이트도, 별도 config 파일도 없이.
2. **graphql-js 관례 따르기.** SDL-first, 표준 4-tuple resolver
   시그니처, `buildSchema()` + `execute()`. `graphql-yoga`나
   `@nestjs/graphql`를 써본 사람이라면 익숙할 것이다.
3. **작게 유지.** graphql-tools, federation 런타임, DataLoader
   매니저 등 "만능" 애드온은 보내지 않는다. 나중에 레이어링하기 쉽다.
4. **프레임워크의 "스택을 직접 조합" 철학 따르기.** SDL을 숨기는
   code-first DSL을 강요하지 않는다. db에서 타입을 자동 생성하지
   않는다. 사용자가 작성한 SDL과 연결한 resolver만 노출한다.

## 왜 SDL-first인가?

대안은 code-first: 스키마를 *기술하는* TypeScript 클래스
(`@ObjectType`, `@Field` 등). NestJS GraphQL과 TypeGraphQL이
code-first 모드를 출시한다. 우리는 의도적으로 출시하지 않았다:

- **Code-first는 TS 타입 시스템을 스키마에 강제한다.** 모든
  resolver 반환 타입은 TS 클래스로 표현 가능해야 한다. 가장 단순한
  케이스 — `JSON` scalar, ad-hoc union, polymorphic interface — 가
  escape hatch 없이 불가능해진다.
- **SDL이 lingua franca다.** 도구들 (codegen, postman, GraphQL
  playground, schema registry) 은 모두 SDL을 소비한다. SDL을
  직접 작성하는 건 괜찮다; 동일한 스키마로 컴파일되는 TS
  클래스를 직접 작성하는 건 같은 결과에 더 많은 코드다.
- **어려운 문제를 미룬다.** Code-first는 SDL을 모델링하기에 충분히
  표현력 있는 TS 타입 시스템이 필요하다. graphql-js의
  `lexical` / `valueFromAST` AST traversal은 v0.7에서 출시하기
  부담스러운 비-trivial한 구현이다.

`@Resolver` / `@Query` / `@Mutation` 데코레이터는 NestJS 스타일
사용자를 위해 노출하지만, SDL 합성은 아직 연결되지 않았다
(아래 "Future work" 참조). 그때까지는 "SDL을 사용해라"가 권장이다.

## 왜 `graphql`이 peer-dep인가?

GraphQL 실행기는 ~50KB minified다. 공짜가 아니다. `@nexusts/core`를
가져오는 대부분의 앱은 GraphQL이 필요 없다 — REST, admin panel,
CLI 등이 필요하다. 모든 번들에 graphql을 번들하는 것은 사용하지
않는 기능에 대해 비용을 지우는 것이다.

Optional peer-dep으로 만들면:

- **프레임워크 번들이 작게 유지된다.** `@nexusts/graphql`
  자체는 wiring (마운트 포인트, 데코레이터 메타데이터, service
  생명주기) 일 뿐이다. 파서나 실행기는 포함하지 않는다.
- **사용자가 opt-in.** `bun add graphql` 한 번, 그 다음
  `forRoot({...})` 동작. graphql 없이 service를 사용하려고 하면
  설치 명령을 가리키는 명확한 에러를 던진다.

Lazy load는 `GraphQLService.loadGraphQLJs()`에 있다:

```ts
const mod = await import("graphql");
return mod as GraphQLJs;
```

캐싱 (`_graphql`, `_loadAttempted`)이 매 요청마다 dynamic import를
재시도하지 않게 한다.

## 스키마 빌드

스키마는 `GraphQLService.ensureSchema()`의 첫 호출 시 lazy
빌드된다:

```ts
private async _buildSchema(sdl: string[]): Promise<GraphQLSchema> {
  const g = await loadGraphQLJs();
  const schema = g.buildSchema(sdl.join("\n"));
  wrapSchemaWithResolvers(schema, this.mergedResolverMap());
  return schema;
}
```

`new GraphQLSchema({ query, types, ... })` 대신 `buildSchema()`를
사용한다 — 사용자가 작성한 SDL이 입력이고, 가장 단순한 입력이기
때문이다. 단점은 `buildSchema()`가 resolver 없는 필드를 만든다는
것이다 — 실행 시 `parent` 값에서 lookup되는 것을 기대한다. 우리
경우 각 resolver는 top-level `(parent, args, ctx, info) => T`
함수이므로 그 함수들을 필드에 직접 연결해야 한다.

`wrapSchemaWithResolvers()`가 이를 한다:

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

`buildSchema()`는 mutable field 객체를 반환한다 (`GraphQLSchema`
자체는 immutable이지만). 그래서 런타임에 동작한다. graphql-js 16과
17에서 테스트 — 둘 다 `getTypeMap()`과 field의 `resolve` 슬롯을
노출한다.

미래 친화적인 대안 — 모든 필드 타입을 수동으로 `new
GraphQLSchema({...})`로 — 더 많은 코드지만 mutability 가정을
피한다. graphql-js가 이 형태에서 수년간 안정적이어서 더 단순한
경로를 선택했다.

## 실행

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

graphql 17의 `execute()` 시그니처 변경 (positional → object) 때문에
정확하게 타입을 지정하기보다 wrap한다. `(...args: any[]) => ...`
타입이 두 shape 모두 수용한다.

결과 envelope는 graphql-js와 일치한다: `{ data, errors, extensions }`.
validation 실패시 그대로 전달하고 `data`는 unwrap한다. HTTP
레이어 (`GraphQLModule.mount()`)가 이를 JSON 응답에 매핑한다 —
`data`가 있으면 200, envelope에 `errors[]`만 있으면 400.

## HTTP 마운팅

`GraphQLModule.mount(app, svc)`가 네 라우트를 연결한다:

| Method | Path | 목적 |
|--------|------|------|
| `POST`  | `/graphql`            | queries + mutations |
| `GET`   | `/graphql?query=...`  | pre-baked queries (브라우저 공유 링크, persisted query 캐시) |
| `GET`   | `/graphql/schema`     | SDL을 `text/plain`로 (디버그) |
| `GET`   | `/graphql`            | query가 없으면 GraphiQL playground |

요청 body는 content-type 스니프로 읽는다: `application/json`은
JSON으로, `application/x-www-form-urlencoded`는 `URLSearchParams`로
파싱. 표준 POST 포맷 (HTTP body) 과 persisted-query 포맷
(GET ?query=...) 둘 다 동작.

playground HTML은 인라인이다 — CDN, 외부 asset 없음. 의도적으로
minimal (textarea + Run 버튼 + JSON 결과 패널) — 에어갭 환경이나
사설 네트워크에서 동작. 풀 GraphiQL 경험 (탭, schema explorer, docs
패널)을 원하는 사용자는 `graphiql`을 설치해서 직접 마운트할 수 있다.

## Context와 resolver 시그니처

각 resolver는 표준 graphql-js 4-tuple `(parent, args, ctx, info)`를
받는다. `ctx`는 `GraphQLContext`이다:

```ts
interface GraphQLContext {
  hono: Context;                  // inbound Hono 컨텍스트
  state: Record<string, any>;      // context(c)의 출력
}
```

프레임워크는 두 곳에서 context를 구성한다:

1. **`GraphQLModule.mount()`** (HTTP 경로): `svc.buildContext(c)`를
   호출, 이는 `svc.config.context(c)` (정의되어 있다면) 를 호출하고
   `{ hono, state }`를 반환. Resolver는 4번째 인자의 `.state`로 본다.
2. **`GraphQLService.execute()` 직접 호출** (programmatic 경로):
   context가 전달되지 않았고 service에 `context()` 팩토리가 있으면
   stub Hono ctx로 synthetic context를 만든다. 이렇게 하면 HTTP
   요청 외부에서 `execute()`를 호출할 때도 `ctx.state`에 의존하는
   resolver (예: `whoami: (_, __, ctx) => ctx.state.user`)가 동작한다.

## Resolver 맵 형태

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

top-level 키는 GraphQL 타입 이름 (`Query`, `Mutation`,
`Subscription`, plus 사용자가 정의한 타입). nested 키는 필드 이름.
값은 함수 `(parent, args, ctx, info) => T` 또는 subscription용
`{ resolve: Function, subscribe: Function }`이다.

같은 필드에 여러 resolver가 매핑되면 나중 것이 이긴다. 의도적이다 —
`forRoot()`의 `resolvers` 옵션은 데코레이터 기반 또는 SDL-default 맵의
"패치"이다.

## 데코레이터 API & 전역 Resolver 레지스트리

프레임워크는 `@Resolver`, `@Query`, `@Mutation`, `@Subscription`,
`@Arg`(레거시) 데코레이터를 export한다.

### 표준 모드 (v0.9+, 권장)

`@Query`/`@Mutation`의 `args` 옵션 사용:

```ts
@Resolver("User")
class UserResolver {
  @Query("currentUser")
  me(ctx: Context) { return (ctx as any).state?.user; }

  @Mutation({ args: { name: "String!" } })
  updateProfile(name: string) { ... }
}
```

### 레거시 모드 (`experimentalDecorators: true`)

`@Arg` 파라미터 데코레이터 사용:

```ts
@Resolver("User")
class UserResolver {
  @Query("currentUser")
  me(@Ctx() c: any) { return c.state.user; }

  @Mutation()
  updateProfile(@Arg("name") name: string) { ... }
}
```

### 전역 레지스트리 (v0.7.6+)

`@Resolver`로 장식된 클래스는 데코레이션 시점에 자동으로 전역
`Set<Function>`에 수집된다. 레지스트리는 `getRegisteredResolvers()`로
접근 가능 (`@nexusts/graphql`에서 export).
Resolver 클래스를 `GraphQLModule.forRoot()`에 수동으로 나열할 필요
없이 모듈의 `providers` 배열에만 추가하면 된다.

```ts
import { getRegisteredResolvers } from "@nexusts/graphql";

const all = getRegisteredResolvers();
// → [UserResolver, PostResolver, ...]
```

테스트 시 `clearResolverRegistry()`로 레지스트리를 초기화할 수 있다.

### 남은 작업 (v0.8)

- **SDL 합성.** 데코레이터 메타데이터는 수집되지만 아직
  `typeDefs`를 자동으로 빌드하는 데 사용되지 않는다. 사용자는
  여전히 SDL을 직접 작성해야 한다. 풀 code-first (데코레이터 → SDL)은
  v0.8에서 예정.
- **Resolver 맵 자동 attach.** 현재 resolver 맵은 수동으로 merge
  하거나 인라인으로 정의해야 한다. v0.8에서 수집된 필드를 자동으로
  attach할 예정.

## Future work

- **DataLoader.** Resolver별 `loader` 옵션이 요청 스코프에서 배치
  - 캐시된 loader를 제공.
- **Persisted queries (APQ).** graphql-js 16+에 내장; 엔드포인트 위에
  작은 wiring 레이어만 필요.
- **Federation v2.** `@apollo/subgraph`를 통한 Apollo Federation v2
  subgraph 지원. 스키마 구성은 동일 — `@key` / `@requires` /
  `@provides` 데코레이터만 위에 추가.
- **Custom directives.** SDL 디렉티브 (`@auth`, `@cache`,
  `@deprecated`)를 resolver 메소드의 데코레이터로 구현.

## 참고

- [`../user-guide/graphql.md`](../user-guide/graphql.md) — 사용자 가이드.
- [`../analysis/nestjs-comparison.md`](../analysis/nestjs-comparison.md)
  — GraphQL 격차 (이제 해소됨).
- [graphql-js 문서](https://graphql.org/graphql-js/) — 우리가 위임하는
  executor.
