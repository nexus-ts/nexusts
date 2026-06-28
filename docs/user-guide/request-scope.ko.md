# Request-scoped DI · Tier 2 v0.4

> English version: [`request-scope.md`](./request-scope.md)
> v0.3 격차 분석의 Tier 2 격차, **v0.4**에서 해소.

프레임워크의 DI 컨테이너가 세 가지 provider 스코프를 지원:

| 스코프 | 생성 시점 | 수명 |
| ----- | ------- | -------- |
| `singleton` (기본) | 한 번 | 애플리케이션 수명 |
| `request` | HTTP 요청당 한 번 | 단일 요청 — 해당 요청 내 모든 consumer 공유 |
| `transient` | 매 resolve | GC 관리 |

`request` 스코프는 멀티테넌트 앱, 요청별 감사 로깅, request-id 전파,
트랜잭션별 DB 컨텍스트의 핵심 기능.

---

## 1. 빠른 시작

\`\`\`ts
import { Inject, Injectable, REQUEST } from '@nexusts/core';

@Injectable({ scope: 'request' })
class RequestContext {
  id = crypto.randomUUID();
  userId: string | null = null;

  @Inject(REQUEST) declare req: any;
  constructor() {
    this.userId = extractUserFromToken(this.req.header('authorization'));
  }
}

@Injectable()
class AuditService {
  // 같은 `RequestContext` 인스턴스가 한 요청 내 모든 consumer에 공유됨
  // — 호출 트리 깊숙이 있더라도.
  @Inject(RequestContext) declare ctx: RequestContext;

  log(event: string) {
    console.log(\`[\${this.ctx.id}] \${event}\`);
  }
}
\`\`\`

프레임워크가 요청별 DI 스코프를 활성화하는 Hono 미들웨어를 자동 설치 — 수동 와이어링 불필요. \`scope: 'request'\`로 클래스 선언 후 inject만 하면 됨.

---

## 2. \`REQUEST\` 토큰

\`@Inject(REQUEST)\`는 활성 Hono 컨텍스트를 주입. 헤더, URL, 응답 등을 읽는 데 사용.

\`\`\`ts
@Injectable({ scope: 'request' })
class RequestContext {
  @Inject(REQUEST) declare req: any;
  constructor() {
    this.id = this.req.header('x-request-id') ?? crypto.randomUUID();
  }
}
\`\`\`

\`REQUEST\` 토큰은 모든 컨테이너(root, request, module-local)에서 해석 가능 — 값은 항상 활성 요청을 가리킴.

---

## 3. 헬퍼 (\`getRequest\`, \`getRequestScope\`, \`getRequestState\`)

생성자 주입이 어색한 깊은 호출 트리의 서비스 코드를 위해 세 가지 헬퍼 제공:

\`\`\`ts
import { getRequest, getRequestScope, getRequestState, setRequestState } from '@nexusts/core';

function auditDeepInTheCallTree() {
  const req = getRequest();          // Hono context
  const scope = getRequestScope();   // 전체 스코프 (id, context, state, container)
  if (!scope) return; // 요청 내부가 아님

  scope.state.set('visits', (scope.state.get('visits') as number ?? 0) + 1);
}
\`\`\`

\`getRequestState(key)\` / \`setRequestState(key, value)\`는 요청 수명과 동일한 타입 안전 key-value bag. 횡단 데이터(현재 사용자, request id, flash 메시지 등)에 유용.

---

## 4. 스코프 시맨틱

| Provider 스코프 | 같은 요청, 여러 consumer | 다른 요청 |
| -------------- | ------------------------- | --------- |
| \`singleton\` (기본) | 같은 인스턴스 | 같은 인스턴스 |
| \`request\` | 같은 인스턴스 (요청당) | 다른 인스턴스 |
| \`transient\` | 다른 인스턴스 | 다른 인스턴스 |

---

## 5. \`Application\` 자동 설치

\`\`\`ts
const app = new Application(AppModule);
await app.listen(3000);
// 미들웨어는 Hono 앱의 첫 번째 항목.
// 모든 요청이 새로운 RequestScope를 받음.
\`\`\`

커스텀 Hono 앱에 수동 설치:

\`\`\`ts
import { Hono } from 'hono';
import { requestScopeMiddleware } from '@nexusts/core';

const root = new DIContainer();
root.register(RequestContext as any);

const app = new Hono();
app.use('*', requestScopeMiddleware(root));
\`\`\`

---

## 6. 트랜잭션 (\`@nexusts/drizzle\` 동반)

요청 스코프 DI는 DB 트랜잭션과 자연스럽게 맞물린다. \`@nexusts/drizzle\`의 \`db.transaction(fn)\`은 트랜잭션 내부에서 \`fn\` 실행; 요청 스코프 \`Tx\` provider와 결합해 같은 트랜잭션을 요청의 모든 서비스에 공유.

(실제 Tx plumbing은 아직 출시되지 않음 — 예시. \`@nexusts/drizzle\`이 실제 트랜잭션 경계를 소유.)

---

## 7. 검증 예시

\`\`\`ts
import { describe, it, expect } from 'vitest';
import { DIContainer } from '@nexusts/core';
import { Injectable, Inject } from '@nexusts/core';
import { requestScopeMiddleware } from '@nexusts/core';
import { getRequestScope } from '@nexusts/core';

@Injectable({ scope: 'request' })
class Ctx { id = Math.random().toString(36).slice(2, 8); }

@Injectable()
class A { @Inject(Ctx) declare ctx: Ctx; }
@Injectable()
class B { @Inject(Ctx) declare ctx: Ctx; }

describe('request scope', () => {
  it('shares the same instance across consumers in one request', async () => {
    const root = new DIContainer();
    root.register(Ctx as any);
    root.register(A as any);
    root.register(B as any);

    const app = new Hono();
    app.use('*', requestScopeMiddleware(root));
    app.get('/', (c) => {
      const a = root.resolve<A>(A as any);
      const b = root.resolve<B>(B as any);
      return c.json({ same: a.ctx === b.ctx });
    });

    const res = await app.request('http://x/');
    const body = await res.json();
    expect(body.same).toBe(true);
  });
});
\`\`\`

---

## 8. 참고

- [v0.3 NestJS 격차 분석](../analysis/nestjs-comparison.md) — Tier 2 §3.3
- [v0.3 AdonisJS 격차 분석](../analysis/adonisjs-comparison.md) — Tier 2 멀티테넌트 컨텍스트
- [\`./sse.md\`](./sse.md) — 직전에 출시된 Tier 2 동반 모듈
- [\`./openapi.md\`](./openapi.md) — Tier 1 v0.4 모듈
- [AsyncLocalStorage (Node 문서)](https://nodejs.org/api/async_context.html#class-asynclocalstorage) — underlying primitive
- [NestJS request scope](https://docs.nestjs.com/fundamentals/injection-scopes) — 패턴의 표준 참조
