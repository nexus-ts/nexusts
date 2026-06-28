# gRPC 모듈 — 디자인 문서

> English version: [`grpc.md`](./grpc.md)

이 문서는 `@nexusts/grpc`의 아키텍처를 설명합니다:
`@grpc/grpc-js`가 피어 의존성인 이유, `.proto` 파일 로딩 방식,
데코레이터가 서비스 구현체를 gRPC 핸들러에 연결하는 방법,
타입드 클라이언트 팩토리의 동작 방식 등을 다룹니다.

## 목표

1. **`imports: [...]` 한 줄로 gRPC 엔드포인트 추가.** 수동 `new Server()`,
   수동 핸들러 연결, 별도 설정 파일이 필요 없습니다. `.proto` 파일,
   서비스 구현 클래스, `GrpcModule.forRoot(...)`만 있으면 됩니다.
2. **프레임워크의 DI 모델과 일치.** 서비스 구현체는 일반 DI 관리
   클래스입니다. `@Inject`로 다른 서비스를 주입받고, 생명주기 훅을
   사용하며, 애플리케이션의 나머지 부분과 동일한 컨테이너의 혜택을
   받을 수 있습니다.
3. **타입 세이프 클라이언트 팩토리 제공.** `grpc.client<T>("Name")`이
   콜백 기반 gRPC 호출을 `Promise<T>`로 변환하는 프록시를 반환합니다.
   수동 `new ServiceClient()` 보일러플레이트가 필요 없습니다.
4. **최소한으로 유지.** v1에서는 Unary RPC만 지원합니다. 스트리밍(서버,
   클라이언트, 양방향)은 추후 과제입니다. 자동 코드 생성, 인터셉터
   체인, 리플렉션 API는 포함하지 않으며, 이들은 나중에 쉽게 추가할 수
   있습니다.
5. **HTTP/1과 HTTP/2 분리.** gRPC 서버는 별도 포트에서 실행됩니다
   (HTTP/2 필요). Hono HTTP/1 서버는 독립적입니다. 사용자는 둘 다,
   하나만, 또는 아예 실행하지 않을 수 있습니다.

## `@grpc/grpc-js` 선택 이유 (Bun 네이티브 HTTP/2 대신)

| 항목 | Bun 네이티브 HTTP/2 | `@grpc/grpc-js` |
| ---- | ------------------- | --------------- |
| 프로토 로딩 | 수동 SDL 파싱 | `@grpc/proto-loader` |
| gRPC 시맨틱 | 직접 구현 필요 | 완전한 구현 |
| 인터셉터 | 수동 | 내장 |
| 헬스 체킹 | 수동 | 내장 (`@grpc/health`) |
| 서버 리플렉션 | 수동 | 내장 (`@grpc/reflection`) |
| Node.js 호환 | Bun 전용 | Bun |
| 번들 크기 | 0 (Bun 내장) | 약 300KB 추가 |

gRPC 시맨틱(메타데이터 전파, 데드라인 전파, 상태 코드, 재시도 로직,
서버 압축 협상)을 Bun의 `Bun.serve` 위에 직접 구현하는 것은 수년간
검증된 작업을 복제하는 것과 같기 때문에 `@grpc/grpc-js`를 선택했습니다.
번들 크기 비용은 gRPC 모듈을 임포트하는 사용자만 부담합니다.

`@grpc/grpc-js`는 Bun의 `http2` 호환성 레이어를 통해 Bun에서
작동합니다(Bun 1.0+는 Node 호환 `http2`를 제공). CI에서 확인
완료했습니다.

## `@grpc/grpc-js`와 `@grpc/proto-loader`를 피어 의존성으로 한 이유

gRPC 서버 런타임은 약 300KB(최소화 기준)입니다. `@nexusts/core`를
가져오는 대부분의 앱은 gRPC가 아닌 REST, 관리자 패널, CLI 등이
필요합니다. 모든 곳에 `@grpc/grpc-js`를 번들링하면 사용하지 않는
기능을 위해 사용자에게 불이익을 줍니다.

선택적 피어 의존성으로 만들면:

- **프레임워크 번들이 작게 유지됨.** `@nexusts/grpc` 자체는
  연결 코드(데코레이터, 모듈, 서비스 래퍼)일 뿐입니다. gRPC 런타임을
  포함하지 않습니다.
- **사용자가 옵트인.** `bun add @grpc/grpc-js @grpc/proto-loader`를
  한 번 실행한 후 `forRoot({...})`를 사용합니다.
- **의존성 누락 시 명확한 오류.** `nexusts/grpc`의 첫 임포트는
  오류를 발생시키지 않지만(데코레이터와 타입은 순수 TypeScript),
  `prepare()` 또는 `client()` 호출 시 Node의 require 해석에서
  자연스러운 `Cannot find module` 오류가 전파됩니다.

## 아키텍처

```
┌──────────────────────────────────────────────────────────────┐
│                      사용자 코드                               │
│   @GrpcService("Greeter")    @GrpcMethod("SayHello")         │
│   grpc.client<GreeterClient>("Greeter")                      │
└──────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌──────────────────────────────────────────────────────────────┐
│            @nexusts/grpc  (별도 진입점)                       │
│                                                              │
│  ┌────────────────┐  ┌────────────────┐  ┌───────────────┐  │
│  │ GrpcService    │  │ GrpcModule     │  │ 데코레이터    │  │
│  │ (DI 서비스)    │  │ (DI 연결)      │  │ @GrpcService  │  │
│  │                │  │                │  │ @GrpcMethod   │  │
│  └───────┬────────┘  └────────────────┘  └───────────────┘  │
│          │                                                    │
│          │  소유: Server, proto 정의,                          │
│          │  서비스별 인스턴스 맵, 클라이언트 생성자             │
└──────────────────────────────────────────────────────────────┘
          │
          ├─── prepare()  ──► .proto 로드 → 핸들러 구축 → 서비스 등록
          ├─── start()    ──► bindAsync(host:port)
          │                   │
          ▼                   ▼
┌──────────────────────────────────────────────────────────────┐
│                  @grpc/grpc-js                                │
│                                                              │
│   Server  ◄────  addService(service, handlers)               │
│   Client  ◄────  new ServiceClient(url, creds)              │
│                                                              │
│   Credentials: ServerCredentials / credentials               │
└──────────────────────────────────────────────────────────────┘
```

gRPC 모듈은 사용자 코드와 `@grpc/grpc-js` **사이**에 위치합니다:

1. `@grpc/proto-loader`로 `.proto` 파일을 로드하고 단일 패키지
   트리로 병합합니다(`loadPackageDefinition`).
2. 데코레이터 메타데이터(`@GrpcService`, `@GrpcMethod`)를 읽어
   어떤 클래스가 어떤 서비스를 구현하고 어떤 메서드가 어떤 RPC를
   처리하는지 파악합니다.
3. `@grpc/grpc-js` `Server`를 생성하고, 등록된 각 구현체에 대해
   `addService()`를 호출하며, 서버 생명주기 제어를 위한 `start()`/
   `stop()` 메서드를 제공합니다.
4. 콜백 기반 gRPC 클라이언트를 감싸는 Promise 기반 프록시를
   반환하는 `client<T>(name, url)`을 노출합니다.

## 모듈 분리

`@nexusts/grpc`는 `package.json`의 **별도 진입점**입니다:

```json
"exports": {
  ".":     { ... },
  "./cli": { ... },
  "./grpc": { ... }
}
```

빌드 스크립트(`build.ts`)는 `src/grpc/index.ts`를 `dist/grpc/` 아래
자체 아티팩트로 번들링합니다. gRPC를 사용하지 않는 사용자는 번들
크기 비용을 부담하지 않습니다.

런타임에 gRPC 모듈은 `@grpc/grpc-js`와 `@grpc/proto-loader`를
임포트합니다. 이들을 다시 익스포트하지는 않습니다; 저수준 접근이
필요한 사용자는 직접 임포트할 수 있습니다.

## 데코레이터 API와 메타데이터 흐름

### `@GrpcService(name: string)` — 클래스 데코레이터

클래스를 gRPC 서비스의 구현체로 표시합니다. `name`은 `.proto`
파일의 `service` 선언과 일치해야 합니다.

```ts
@Injectable()
@GrpcService("Greeter")
class GreeterImpl {
  @GrpcMethod("SayHello")
  async sayHello(req: HelloRequest) {
    return { message: `Hello, ${req.name}!` };
  }
}
```

데코레이터는 `Symbol.for("nexus:grpc:service")` 아래 클래스
프로토타입에 `{ name }`을 저장합니다. 프레임워크는 `prepare()` 중에
이를 읽어 이 클래스가 어떤 proto `service` 블록을 구현하는지 찾습니다.

### `@GrpcMethod(name: string)` — 메서드 데코레이터

클래스 메서드를 gRPC RPC에 바인딩합니다. `name`은 `.proto` 파일의
RPC 이름(PascalCase: `SayHello`, `FindById`)과 일치해야 합니다.

`Symbol.for("nexus:grpc:method")` 아래 프로토타입에
`{ methodKey → protoMethodName }` 맵을 저장합니다. 프레임워크는
등록 시 이 맵을 읽어 `server.addService()`에 전달할 핸들러 객체를
구성합니다.

### 메타데이터 읽기 함수

내부 함수(`getGrpcServiceName`, `getGrpcMethodNames`)가 저장된
메타데이터를 읽습니다. 테스트를 위해 익스포트되지만 공개 API의
일부는 아닙니다.

## 서비스 생명주기

```
GrpcModule.forRoot(config)
  │
  ├── GrpcService 인스턴스 생성
  ├── 서비스 구현 클래스를 DI 프로바이더로 등록
  ├── "GRPC_CONFIG" 토큰으로 설정 주입
  │
  └── 사용자 코드:
        const grpc = container.resolve(GrpcService);
        await grpc.start();   // prepare (필요시) + bindAsync
        // ... 서비스 ...
        await grpc.stop();    // tryShutdown (1초 타임아웃) + forceShutdown
```

### `prepare(resolve)`

멱등(idempotent)합니다. `.proto` 파일을 읽고, 등록된 각 서비스
구현체에 대한 핸
