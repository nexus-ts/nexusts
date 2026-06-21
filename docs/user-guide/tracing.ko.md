# 분산 추적 · `nexus/tracing` (Tier 2 v0.4)

> English: [`tracing.md`](./tracing.md)
> v0.3 격차 분석의 Tier 2 격차, **v0.4**에서 해소.

`nexus/tracing`은 [OpenTelemetry](https://opentelemetry.io/) API의 얇고 관용적인 래퍼:

- **`TracingService`** — `startSpan()`, `withSpan()`, 컨텍스트 전파 헬퍼를 노출하는 DI 친화적 서비스
- **`TracingModule.forRoot(config)`** — 선택한 exporter, sampler, resource 속성으로 OTel SDK 시작
- **`@Trace()` 데코레이터** — 모든 클래스 메서드를 span으로 감쌈 (sync 메서드는 sync로, async는 async로 유지)
- **`tracingMiddleware()`** — 모든 HTTP 요청에 server span을 생성하고, 들어오는 W3C `traceparent`을 추출하며, 응답 상태 + 예외를 기록하는 Hono 자동 계측
- **W3C + B3 전파** — 레거시 Zipkin 시스템을 위한 `parseTraceParent`, `formatTraceParent`, `extractB3Context`

OpenTelemetry **API** 패키지는 유일한 필수 의존성 (~7kb). **SDK** 패키지는 optional peer dep — `forRoot()`를 호출할 때만 설치.

---

## 1. 빠른 시작

\`\`\`bash
bun add @opentelemetry/api
bun add @opentelemetry/sdk-node \\
         @opentelemetry/exporter-trace-otlp-http \\
         @opentelemetry/resources \\
         @opentelemetry/semantic-conventions
\`\`\`

\`\`\`ts
// app.module.ts
import { Module } from 'nexus';
import { TracingModule } from 'nexus/tracing';

@Module({
  imports: [
    TracingModule.forRoot({
      serviceName: 'my-app',
      exporter: 'otlp-http',
      endpoint: 'http://otel-collector:4318',
      sampleRatio: 0.1,        // 10%만 보존
      environment: 'production',
    }),
  ],
})
export class AppModule {}
\`\`\`

끝. 모든 HTTP 요청이 추적되고, `@Trace()` 데코레이터가 적용된 모든 메서드는 자식 span으로 감싸지며, span이 배치되어 설정된 OTLP 엔드포인트로 전송됨.

---

## 2. `@Trace()` 데코레이터

\`\`\`ts
import { Trace } from 'nexus/tracing';

class UserService {
  @Trace()                        // span name = "UserService.findById"
  findById(id: string) { ... }

  @Trace('user.lookup')           // 명시적 span 이름
  async lookup(name: string) { ... }

  @Trace({
    name: 'user.cache.get',
    attributes: { 'cache.hit': false },
  })
  async getFromCache(key: string) { ... }
}
\`\`\`

- **sync 메서드는 sync로 유지.** 데코레이터가 `AsyncFunction`을 감지하여 `withSpan` / `withSpanSync`를 적절히 사용.
- **추적이 설정되지 않으면 no-op.** `TracingModule.forRoot()`를 호출하지 않았다면 데코레이터는 투명한 pass-through — 오버헤드 0.
- **인자를 받는 생성자가 있는 클래스에서도 동작.** `this` 보존.

---

## 3. 수동 span — `withSpan()` 및 `withSpanSync()`

클래스 메서드가 아닌 코드 (최상위 유틸리티, 큐 핸들러, 크론 작업 등):

\`\`\`ts
import { withSpan } from 'nexus/tracing';

await withSpan('nightly.cleanup', async (span) => {
  span.setAttribute('cleanup.target', 'sessions');
  span.addEvent('starting');
  await cleanupSessions();
  span.addEvent('done');
});
\`\`\`

또는 동기:

\`\`\`ts
const result = service.withSpanSync('compute', (span) => {
  span.setAttribute('input.size', 42);
  return compute();
});
\`\`\`

둘 다:

- 예외를 잡고 span을 `status=error`로 표시 + 예외를 기록한 뒤 다시 던짐
- 콜백이 반환한 값을 그대로 반환

---

## 4. 컨텍스트 전파

### 현재 trace 읽기

\`\`\`ts
import { getTracingService } from 'nexus/tracing';

const svc = ...; // TracingService instance
console.log(svc.getCurrentTraceId());  // 요청 외부에서는 undefined
\`\`\`

요청 핸들러(또는 `@Trace()` 메서드 내부)에서는 활성 trace id가 반환됨.

### 들어오는 헤더에서 추출

\`\`\`ts
const ctx = svc.extractContext(request.headers);
// 이 Context를 새 span의 parent로 사용.
\`\`\`

기본 W3C \`traceparent\` 헤더가 읽힘. \`extractB3Context()\`로 B3 single-header (\`b3: <traceId>-<spanId>-1\`)도 지원.

### 나가는 헤더로 주입

\`\`\`ts
const headers = svc.injectContext({
  'content-type': 'application/json',
});
// 활성 span이 있을 때 headers.traceparent이 설정됨
const res = await fetch('<https://other-service/path>', { headers });
\`\`\`

---

## 5. Hono 자동 계측

\`TracingModule.forRoot()\`는 Hono 미들웨어를 자동 설치 — 모든 요청이 다음 속성을 가진 \`SERVER\` span을 받음:

| 속성 | 소스 |
| --- | --- |
| \`http.method\` | \`c.req.method\` |
| \`http.route\` | 매칭된 라우트 경로 |
| \`http.target\` | \`c.req.path\` |
| \`http.scheme\` | URL 프로토콜 |
| \`http.host\` | URL 호스트 |
| \`http.user_agent\` | \`User-Agent\` 헤더 |
| \`http.client_ip\` | \`X-Forwarded-For\` / \`X-Real-IP\` |
| \`http.status_code\` | 응답 상태 |

프레임워크의 HTTP 서버가 **아닌** 커스텀 Hono 앱에서 미들웨어 사용:

\`\`\`ts
import { Hono } from 'hono';
import { tracingMiddleware, TracingService } from 'nexus/tracing';

const service = new TracingService();
const app = new Hono();
app.use('*', tracingMiddleware(service));
\`\`\`

---

## 6. 설정 레퍼런스

\`\`\`ts
interface TracingConfig {
  serviceName?: string;          // default: "nexus"
  serviceVersion?: string;       // default: "0.0.0"
  environment?: string;          // default: process.env.NODE_ENV
  exporter?: 'otlp-http' | 'otlp-grpc' | 'console' | 'memory';
  endpoint?: string;             // default: <http://localhost:4318>
  sampleRatio?: number;          // 0..1, default 1.0
  enableHttpInstrumentation?: boolean;  // default true
  enableDbInstrumentation?: boolean;    // default true (nexus/drizzle hook)
  resourceAttributes?: Record<string, string>;
  throwOnError?: boolean;        // default false
}
\`\`\`

\`exporter\` 필드가 목적지 제어:

- \`otlp-http\` (default) — \`<endpoint>/v1/traces\`로 POST (Jaeger, Tempo, Honeycomb, SigNoz 등 모두 수용)
- \`otlp-grpc\` — 같지만 gRPC. \`@opentelemetry/exporter-trace-otlp-grpc\` 패키지 필요.
- \`console\` — span을 stdout에 pretty-print (dev 전용)
- \`memory\` — span을 in-process에 유지 (테스트 전용)

---

## 7. 번들링 / peer 의존성

OTel SDK 패키지는 (~5MB) 클 수 있으므로, \`nexusjs\`의 **optional peer dep**임. \`nexus/tracing\`을 사용하지 않는 앱은 비용을 지불하지 않음.

API만 설치 시:

\`\`\`bash
bun add @opentelemetry/api
\`\`\`

…\`TracingService\`는 기본 no-op tracer로 폴백. 서비스는 완전 동작 — \`withSpan()\` 작동, \`@Trace()\` 작동, Hono 미들웨어 실행 — 하지만 span은 no-op. 이는 의도적: dev 모드 앱은 추적을 no-op으로 유지하고, \`OTEL_EXPORTER_OTLP_ENDPOINT\` 설정 + SDK 패키지 추가로 prod에서 켤 수 있음.

---

## 8. 검증

\`\`\`ts
import { describe, it, expect } from 'vitest';
import { TracingService, withSpan } from 'nexus/tracing';

describe('tracing', () => {
  it('exposes a tracer', () => {
    const svc = new TracingService();
    expect(svc.tracer).toBeDefined();
  });

  it('runs withSpan', async () => {
    const svc = new TracingService();
    const r = await svc.withSpan('op', async (s) => {
      s.setAttribute('user.id', 'u1');
      return 42;
    });
    expect(r).toBe(42);
  });
});
\`\`\`

---

## 9. 참고

- [v0.3 NestJS 격차 분석](../analysis/nestjs-comparison.md) — Tier 2 §4.4
- [\`./sse.md\`](./sse.md) — 동반 Tier 2 모듈
- [\`./request-scope.md\`](./request-scope.md) — 동반 Tier 2 모듈
- [OpenTelemetry JavaScript 문서](https://opentelemetry.io/docs/languages/js/)
- [W3C Trace Context 스펙](https://www.w3.org/TR/trace-context/)
