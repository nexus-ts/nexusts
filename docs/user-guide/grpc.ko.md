# @nexusts/grpc — gRPC 통합

> English version: [`grpc.md`](./grpc.md)

`@nexusts/grpc`은 TypeScript 클래스와 decorator로 gRPC 서비스를 정의하고
Hono HTTP 라우트와 함께 서빙할 수 있게 해줍니다. 같은 모듈이 앱 내부에서
gRPC 서비스를 호출하기 위한 typed client도 제공합니다.

## 왜 gRPC인가?

- **강타입 contract.** `.proto` 파일이 스키마를 정의하면 TypeScript
  client가 그에 맞는 형태를 받습니다.
- **HTTP/2 + 바이너리.** 내부 마이크로서비스 트래픽에서
  JSON-over-HTTP/1.1보다 오버헤드가 낮습니다.
- **Streaming.** server-streaming, client-streaming, bidirectional
  streaming이 gRPC에서 first-class입니다. (Streaming은 `@nexusts/grpc`의
  v2에서 예정.)

## 설치

```bash
bun add @grpc/grpc-js @grpc/proto-loader
```

둘 다 `@nexusts/grpc`의 `package.json`에서 **optional** peer dependency로
선언되어 있습니다. 프레임워크가 dynamic import로 로드하므로 gRPC 모듈을
실제로 사용할 때만 설치하면 됩니다.

## 빠른 시작

### 1. `.proto` 파일 정의

```proto
// proto/user.proto
syntax = "proto3";
package user;

service UserService {
  rpc FindById (UserRequest) returns (UserResponse);
  rpc List (ListRequest) returns (ListResponse);
}

message UserRequest  { int32  id   = 1; }
message UserResponse { string name = 1; string email = 2; }
message ListRequest  { int32  page = 1; int32 pageSize = 2; }
message ListResponse { repeated UserResponse users = 1; }
```

### 2. 서비스 구현

```ts
// app/user/user.grpc.ts
import { Injectable, Inject } from "@nexusts/core";
import { GrpcService, GrpcMethod } from "@nexusts/grpc";

@Injectable()
@GrpcService("UserService")
export class UserServiceImpl {
  constructor(@Inject("DATABASE") private db: Database) {}

  @GrpcMethod("FindById")
  async findById(req: { id: number }) {
    const row = await this.db.user.findUnique({ where: { id: req.id } });
    return { name: row.name, email: row.email };
  }

  @GrpcMethod("List")
  async list(req: { page: number; pageSize: number }) {
    const rows = await this.db.user.findMany({
      skip: req.page * req.pageSize,
      take: req.pageSize,
    });
    return { users: rows };
  }
}
```

### 3. 모듈 등록

```ts
// app/app.module.ts
import { Module } from "@nexusts/core";
import { GrpcModule } from "@nexusts/grpc";
import { UserServiceImpl } from "./user/user.grpc";

@Module({
  imports: [
    GrpcModule.forRoot({
      protoPath: "./proto/user.proto",
      services: [UserServiceImpl],
      port: 50051,
    }),
  ],
})
export class AppModule {}
```

### 4. 서버 시작

```ts
// app/main.ts
import { Application } from "@nexusts/core";
import { GrpcService } from "@nexusts/grpc";
import { AppModule } from "./app.module";

const app = new Application(AppModule);
const grpc = app.container.resolve(GrpcService);
await grpc.start();
// Server is now listening on 0.0.0.0:50051
```

## Typed client

`@nexusts/grpc`은 등록한 서비스에 대한 typed client도 만들어줍니다.
앱 안의 한 서비스가 다른 서비스를 호출해야 할 때 유용합니다:

```ts
type UserClient = {
  findById(req: { id: number }): Promise<{ name: string; email: string }>;
  list(req: { page: number; pageSize: number }): Promise<{ users: any[] }>;
};

const grpc = app.container.resolve(GrpcService);
const users = grpc.client<UserClient>("UserService", { url: "internal-user:50051" });
const u = await users.findById({ id: 1 });
```

Client는 각 메서드를 Promise를 반환하는 함수로 wrap합니다. 메서드명은
camelCase로 변환됩니다: `FindById` → `findById`.

## Lifecycle

```ts
const grpc = app.container.resolve(GrpcService);

// 설정한 포트에 bind.
await grpc.start();   // → bind 완료 시 resolve

// Graceful shutdown. pending RPC를 최대 1초 대기 후 force-shutdown.
await grpc.stop();
```

테스트에서 `port: 0`을 설정하면 OS가 빈 포트를 고릅니다. 실제 포트는
`grpc.port` 또는 `onBound` 콜백으로 확인 가능:

```ts
GrpcModule.forRoot({
  protoPath: "...",
  services: [UserServiceImpl],
  port: 0,
  onBound: (host, port) => console.log(`listening on ${host}:${port}`),
});
```

## 설정

```ts
GrpcModule.forRoot({
  // .proto 파일 경로. string 또는 string 배열.
  protoPath: "./proto/user.proto",

  // Proto package. 로드된 proto 트리에서 dotted path로 walk.
  // `service Greeter`가 `package nexus.test;` 안에 있다면
  // "nexus.test"로 두면 됩니다.
  package: "user",

  // 서비스 구현 클래스. 각각 `@GrpcService("ServiceName")`로
  // 표시되어 있어야 합니다.
  services: [UserServiceImpl],

  // bind할 포트. 기본 50051. 0으로 설정하면 OS가 빈 포트 선택.
  port: 50051,

  // bind할 host. 기본 "0.0.0.0".
  host: "0.0.0.0",

  // 선택적 TLS. 설정하면 HTTPS/2 사용.
  tls: {
    cert: fs.readFileSync("server.crt"),
    key:  fs.readFileSync("server.key"),
  },

  // 서버가 bind된 후 한 번 호출됨.
  onBound: (host, port) => {},
});
```

## 한 서버에 여러 서비스

여러 proto 파일과 여러 서비스 구현을 한 gRPC 서버에 등록할 수 있습니다.
각 서비스는 자기만의 typed client를 가집니다.

```ts
GrpcModule.forRoot({
  protoPath: ["./proto/user.proto", "./proto/order.proto"],
  services: [UserServiceImpl, OrderServiceImpl],
  port: 50051,
});
```

이렇게 하려면 `.proto` 파일이:

- 같은 `package` 선언을 공유하거나
- 기본 (빈) package를 사용하거나
- config에서 서비스별 `package`를 지정해야 합니다 (예정; 현재는 모든
  서비스가 같은 `package`를 공유해야 함).

## DI 통합

gRPC 서비스 구현은 완전한 DI 시민입니다. `@Inject(Token)`으로 다른
서비스를 받을 수 있고, HTTP controller와 같은 container에서 resolve됩니다.

```ts
@Injectable()
@GrpcService("UserService")
export class UserServiceImpl {
  constructor(
    @Inject("DATABASE") private db: Database,
    @Inject(EventService) private events: EventService,
  ) {}

  @GrpcMethod("FindById")
  async findById(req: { id: number }) {
    const user = await this.db.user.findUnique({ where: { id: req.id } });
    this.events.emit("user.fetched", { id: req.id });
    return { name: user.name, email: user.email };
  }
}
```

서비스 구현이 gRPC 모듈의 provider로 등록되므로 root container에서도
resolve 가능합니다.

## 에러

Handler가 throw하거나 reject하면 에러가 gRPC client에 status code
`INTERNAL` (code 13)의 `ServiceError`로 전달됩니다. 특정 status code를
보내려면 `code` property를 가진 Error를 throw하세요:

```ts
@GrpcMethod("FindById")
async findById(req: { id: number }) {
  const user = await this.db.user.findUnique({ where: { id: req.id } });
  if (!user) {
    const err = new Error(`user ${req.id} not found`) as Error & { code: number };
    err.code = 5; // gRPC status code: NOT_FOUND
    throw err;
  }
  return user;
}
```

## v1 범위와 한계

- **Unary 메서드만.** Server-streaming, client-streaming, bidirectional
  streaming은 v2에서 예정. 인프라(handler는 표준 gRPC callback 시그니처
  사용)는 준비됨; 남은 작업은 decorator helper와 client wrapper.
- **Reflection 기반.** codegen 단계 없음; `.proto` 파일은
  `@grpc/proto-loader`로 런타임 로드. 트레이드오프: 빌드 단계 0, 다만
  cold start가 약간 느림.
- **HTTP/2 필수.** gRPC는 HTTP/2를 요구. 서버는 Hono HTTP/1.1 라우트와
  별도 포트에서 실행.

## API 레퍼런스

### `@GrpcService(name: string)` — 클래스 decorator

클래스를 gRPC 서비스 구현으로 표시. `name`은 `.proto` 파일의 `service`
선언과 일치해야 합니다.

```ts
@GrpcService("UserService")
class UserServiceImpl { ... }
```

### `@GrpcMethod(name: string)` — 메서드 decorator

클래스 메서드를 `.proto` 파일에 선언된 gRPC 메서드에 바인딩. `name`은
서비스 아래의 `rpc` 선언과 일치해야 합니다.

```ts
@GrpcMethod("FindById")
async findById(req: { id: number }) { ... }
```

JS 메서드명이 proto명과 같을 필요는 없습니다. Decorator가
`jsName → protoName` 맵을 저장하므로, `findById`를 `FindById`로 매핑할
수 있습니다.

### `GrpcService` — 메인 서비스

```ts
const grpc = app.container.resolve(GrpcService);

await grpc.start();          // 포트에 bind
await grpc.stop();           // graceful shutdown (1s timeout, then force)
grpc.isRunning;              // start() 후 true
grpc.port;                   // 실제 bind된 포트 (start() 후)
grpc.host;                   // 실제 bind된 host

const users = grpc.client<UserClient>("UserService", {
  url: "internal:50051",     // 선택, 기본 127.0.0.1:<grpc.port>
  tls: false,                // 선택, 기본 false
});
```

### `GrpcModule.forRoot(config)` — DI 모듈

```ts
GrpcModule.forRoot({
  protoPath: string | string[];
  package?: string;          // 기본 ""
  services: Array<new (...a: any[]) => any>;
  port?: number;             // 기본 50051
  host?: string;             // 기본 "0.0.0.0"
  tls?: { cert: Buffer; key: Buffer | Buffer[] };
  onBound?: (host: string, port: number) => void;
});
```

---

## Streaming (v2)

`@nexusts/grpc` v2는 gRPC의 세 가지 스트리밍 패턴을 모두 지원합니다.

### 호출 방식 요약

| 데코레이터 | proto 선언 | 서버 시그니처 | 클라이언트 반환 |
|-----------|-----------|------------|--------------|
| `@GrpcMethod` | `rpc M(Req) returns (Res)` | `(req) => Promise<Res>` | `Promise<Res>` |
| `@GrpcServerStream` | `rpc M(Req) returns (stream Res)` | `(req) => AsyncIterable<Res>` | `AsyncIterable<Res>` |
| `@GrpcClientStream` | `rpc M(stream Req) returns (Res)` | `(reqs: AsyncIterable<Req>) => Promise<Res>` | `(src: AsyncIterable<Req>) => Promise<Res>` |
| `@GrpcBidiStream` | `rpc M(stream Req) returns (stream Res)` | `(reqs: AsyncIterable<Req>) => AsyncIterable<Res>` | `(src: AsyncIterable<Req>) => AsyncIterable<Res>` |

---

### Server streaming

서버가 단일 요청을 받고 여러 응답을 스트림으로 전송합니다.

```proto
service NumberService {
  rpc ListNumbers (ListRequest) returns (stream NumberResponse);
}
message ListRequest     { int32 count = 1; }
message NumberResponse  { int32 n     = 1; }
```

```ts
@Injectable()
@GrpcService("NumberService")
class NumberServiceImpl {
  @GrpcServerStream("ListNumbers")
  async *listNumbers(req: { count: number }): AsyncIterable<{ n: number }> {
    for (let i = 0; i < req.count; i++) {
      yield { n: i };
    }
  }
}
```

클라이언트 사용:

```ts
const client = grpc.client<{
  listNumbers(req: { count: number }): AsyncIterable<{ n: number }>;
}>("NumberService");

for await (const { n } of client.listNumbers({ count: 5 })) {
  console.log(n); // 0, 1, 2, 3, 4
}
```

---

### Client streaming

클라이언트가 스트림으로 여러 메시지를 전송하고 서버가 단일 응답을 반환합니다.

```proto
service SumService {
  rpc Sum (stream NumberRequest) returns (SumResponse);
}
message NumberRequest { int32 n     = 1; }
message SumResponse   { int32 total = 1; }
```

```ts
@Injectable()
@GrpcService("SumService")
class SumServiceImpl {
  @GrpcClientStream("Sum")
  async sum(
    reqs: AsyncIterable<{ n: number }>,
  ): Promise<{ total: number }> {
    let total = 0;
    for await (const { n } of reqs) total += n;
    return { total };
  }
}
```

클라이언트 사용:

```ts
const client = grpc.client<{
  sum(src: AsyncIterable<{ n: number }>): Promise<{ total: number }>;
}>("SumService");

async function* numbers() {
  yield { n: 1 };
  yield { n: 2 };
  yield { n: 3 };
}

const result = await client.sum(numbers());
console.log(result.total); // 6
```

---

### Bidirectional streaming

양방향으로 스트림을 교환합니다. 서버는 요청 스트림을 받으면서 동시에 응답 스트림을 보냅니다.

```proto
service EchoService {
  rpc Echo (stream EchoRequest) returns (stream EchoResponse);
}
message EchoRequest  { string msg   = 1; }
message EchoResponse { string reply = 1; }
```

```ts
@Injectable()
@GrpcService("EchoService")
class EchoServiceImpl {
  @GrpcBidiStream("Echo")
  async *echo(
    reqs: AsyncIterable<{ msg: string }>,
  ): AsyncIterable<{ reply: string }> {
    for await (const { msg } of reqs) {
      yield { reply: `echo: ${msg}` };
    }
  }
}
```

클라이언트 사용:

```ts
const client = grpc.client<{
  echo(
    src: AsyncIterable<{ msg: string }>,
  ): AsyncIterable<{ reply: string }>;
}>("EchoService");

async function* messages() {
  yield { msg: "hello" };
  yield { msg: "world" };
}

for await (const { reply } of client.echo(messages())) {
  console.log(reply); // "echo: hello", "echo: world"
}
```

---

### 예제

전체 예제: [`examples/34-grpc-streaming/main.ts`](../../examples/34-grpc-streaming/main.ts)

```bash
cd examples/34-grpc-streaming
bun --hot main.ts
```

---

## 함께 보기

- [`runtime-deployment.ko.md`](./runtime-deployment.ko.md) — Bun / Node /
  Cloudflare 운영 배포
- [`testing-published-package.ko.md`](./testing-published-package.ko.md) —
  `dist/`를 로컬에서 테스트하는 3가지 방법
- [`dependency-injection.ko.md`](./dependency-injection.ko.md) — DI 컨테이너
  사용법
