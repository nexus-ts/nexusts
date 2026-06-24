# 34 · gRPC Streaming

gRPC의 네 가지 호출 방식을 모두 보여주는 예제입니다.

## 방식

| 데코레이터 | proto 시그니처 | 설명 |
|-----------|--------------|------|
| `@GrpcMethod` | `rpc M(Req) returns (Res)` | Unary |
| `@GrpcServerStream` | `rpc M(Req) returns (stream Res)` | 서버 스트리밍 |
| `@GrpcClientStream` | `rpc M(stream Req) returns (Res)` | 클라이언트 스트리밍 |
| `@GrpcBidiStream` | `rpc M(stream Req) returns (stream Res)` | 양방향 스트리밍 |

## 실행

```bash
cd examples/34-grpc-streaming
bun --hot main.ts
```

그 다음:

```bash
curl http://localhost:3000/demo/ping   # unary
curl http://localhost:3000/demo/count  # server streaming → [1,2,3,4,5]
curl http://localhost:3000/demo/sum    # client streaming → 15
curl http://localhost:3000/demo/echo   # bidi → ["[echo] hello","[echo] world"]
```
