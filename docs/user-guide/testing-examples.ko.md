# 예제 앱 테스트하기

> English version: [`testing-examples.md`](./testing-examples.md)

`examples/` 폴더에는 **27개의 동작하는 미니 앱**이 들어 있습니다 — 모듈당 하나씩 —
이는 살아있는 문서이자 동시에 회귀 테스트 슈트 역할을 합니다. 매 릴리즈 전에
smoke 테스트로 실행해서 깨진 import, 변경된 export, 빠진 `@Module` 래퍼 등이
출시되지 않도록 검증합니다.

이 가이드는 smoke test runner의 동작, 개별 예제 실행법, 새 예제 추가법을
설명합니다.

---

## 무엇을 검증하나

`examples/` 안의 번호 매겨진 폴더마다 다음을 확인합니다:

1. **Structure** — `main.ts` 존재, `README.md` 가 200자 이상이며
   "How to run" 섹션 포함.
2. **Boot** — `bun run main.ts` 가 정상 부팅. 테스트는 8초 안에
   "listening" / "started" / "ready" / "on port" / "on http" 로그
   라인을 기다린 뒤 `SIGTERM` 을 보내고 정상 종료를 확인.

Smoke runner는 HTTP 엔드포인트를 실제로 호출하지는 않습니다. 27개 예제가
서로 매우 다른 표면(HTTP, gRPC, SSE, WebSocket, queue, …)을 노출하기
때문입니다. 깨끗하게 부팅하는 것 자체를 계약으로 봅니다.

테스트 슈트는 `tests/examples/smoke.test.ts` 에 있으며 `vitest` 로 실행합니다.

---

## 실행 방법

```bash
# 모든 예제 smoke test 실행
bun x vitest run tests/examples/smoke.test.ts

# 이름으로 단일 예제 실행 (부분 일치)
bun x vitest run tests/examples/smoke.test.ts -t "04-session"
bun x vitest run tests/examples/smoke.test.ts -t "01-basic"
```

기대 출력 (발췌):

```
 ✓ tests/examples/smoke.test.ts (55 tests) 1714ms

 Test Files  1 passed (1)
      Tests  55 passed (55)
```

---

## 동작 원리

Runner는 각 예제를 실제 Bun 서브프로세스로 실행합니다 — 즉, 전체 import 그래프를
그대로 검증합니다. `bun build` 체크만으로는 런타임 DI 실패를 잡을 수 없기
때문입니다.

### 예제별 tsconfig

Bun의 기본 TypeScript 설정은 **새로운**(stage-3) decorator 시맨틱을
사용합니다. 이 모드에서는 method decorator가 `(target, key)` 두 개만 받고
`descriptor === undefined` 입니다. 프레임워크는 legacy decorator를
사용하므로 `descriptor.value` 가 필요합니다. `main.ts` 옆에 `tsconfig.json`
이 없으면 모든 예제가 `TypeError: undefined is not an object (evaluating
'descriptor.value')` 로 실패합니다.

Runner는 `beforeAll`에서 각 예제 폴더에 stub `tsconfig.json` 을 써넣어
이를 해결합니다:

```jsonc
{
  "compilerOptions": {
    "experimentalDecorators": true,
    "useDefineForClassFields": false,
    "noEmit": true,
    "types": ["bun-types"]
  },
  "include": ["./**/*.ts", "../../src/**/*.ts"]
}
```

`afterAll` 에서 stub이 제거되므로 테스트가 끝나면 소스 트리는 깨끗합니다.
공유 `examples/tsconfig.json` 은 **동작하지 않습니다** — Bun은 entry
파일 옆의 `tsconfig.json` 을 찾지, 부모 디렉토리의 것은 찾지 않습니다.

### 순차 포트 할당

각 예제 `main.ts` 는 `port: 3000` 을 하드코딩합니다. 포트 충돌을 피하기 위해
runner는 14000부터 순차적으로 포트를 할당합니다:

| 예제 | 포트 |
| ---- | ---- |
| `01-basic-mvc` | 14000 |
| `02-routing-styles` | 14001 |
| … | … |
| `27-request-scope` | 14026 |

서브프로세스에는 `PORT` env var 가 설정되지만, 대부분의 예제는 이를 무시하고
3000을 직접 사용합니다. 그래도 문제없습니다 — 예제의 HTTP 트래픽은 실제로
호출되지 않으므로 포트 충돌은 무해합니다.

### 환경 격리

외부 의존성이 있는 모듈이 네트워크에 접속하지 못하도록 다음 env vars를
모든 서브프로세스에 강제 설정합니다:

- `NODE_ENV=test`
- `OTEL_SDK_DISABLED=true` — tracing 예제
- `OTEL_EXPORTER_OTLP_ENDPOINT=` — gRPC + tracing 예제
- `APP_KEY=0123456789abcdef0123456789abcdef` — crypto 예제
- `NO_COLOR=1` — 로그에서 ANSI 제거

### 생명주기

각 예제에 대해:

```ts
spawn("bun", ["run", mainTs], { cwd, env, stdio: ["ignore", "pipe", "pipe"] });

// 3가지 중 하나가 먼저 발생할 때까지 race:
//   1. stdout 이 /listening|server|started|ready|on port|on http/i 매치 → 성공
//   2. 프로세스가 SIGTERM 이 아닌 시그널로 종료 → 부팅 중 crash
//   3. 8초 타이머 만료 → timeout (실패)
```

성공한 `SIGTERM` 발송 후 1.5초 grace를 두고 `SIGKILL` 을 보내서, 다음
테스트로 포트 release 가 새지 않도록 합니다.

---

## 새 예제 추가

1. **순차 번호 부여** — 다음 번호 사용 (`28-…`, `29-…`).
2. **기존 예제 구조를 미러링:**

   ```
   examples/28-my-feature/
   ├── main.ts        # "@nexusts/core" 로 import (로컬 path alias 없음)
   ├── README.md      # 영문, "How to run" / `bun main.ts` 블록 포함
   └── (선택) views/, public/, proto/, …
   ```

3. **200줄 이내로 유지** — 동작하는 예제는 한 가지 기능에 집중한
   작고 명확한 데모여야 합니다.
4. **예제 폴더에 `tsconfig.json` 을 추가하지 마세요** — runner가
   자동으로 생성하고 제거합니다.
5. **프로덕션 스타일 앱이라도 `port: 3000` 하드코딩 OK** — smoke
   test가 동작하려면 success marker 중 하나만 출력하면 됩니다.
   실제 포트는 상관없습니다.
6. **`examples/README.md` 의 표에 추가**.

커밋하면 smoke test가 CI의 일부로 실행되며, 예제가 깨져있으면
실패합니다. 다시 푸시하기 전에 고치세요.

---

## 왜 부팅만 검증하고 HTTP는 안 하나

smoke test에서는 의도적으로 HTTP 요청을 피합니다. 이유:

- **표면 불일치** — 27개 예제, 27가지 다른 프로토콜 (HTTP, gRPC, SSE,
  WebSocket, queue, mail file transport). 예제별 HTTP probe를
  작성하면 예제 코드보다 테스트 코드가 더 많아집니다.
- **속도** — 부팅 + SIGTERM은 예제당 ~60ms. HTTP 라운드트립과
  timeout을 추가하면 각 100-200ms 가 더 걸립니다.
- **오탐** — 실제 외부 서비스(Redis, Postgres)가 필요한 예제는
  mock이 필요하고, 이는 테스트를 예제 내부 구조에 결합시킵니다.

부팅 테스트는 회귀의 ~95% (빠진 import, 변경된 export, 깨진 DI wiring,
빠진 decorator) 를 잡습니다. 나머지 5% — handler 로직 버그 — 는 예제
작성자의 리뷰 책임입니다.

만약 풀 HTTP smoke test가 필요하다면, 별도 `tests/examples/e2e/*.test.ts`
슈트를 관심 있는 예제 한정으로 작성하세요. 부팅 슈트는 27개 모두
2초 이내에 끝나므로 매 커밋마다 돌릴 수 있습니다.

---

## 문제 해결

### "TypeError: undefined is not an object (evaluating 'descriptor.value')"

legacy decorator 설정이 있는 `tsconfig.json` 이 없는 예제입니다. runner가
자동으로 추가해야 합니다 — 이 에러가 보인다면 runner가 깨진 것입니다.
`tests/examples/smoke.test.ts` 의 `beforeAll` 이 모든 예제에 대해
`ensureExampleTsconfig` 를 호출하는지 확인하세요.

### "No provider for 'X'"

DI 그래프에 등록되지 않은 클래스를 예제가 참조하고 있습니다. 해당
`@Module` 의 `controllers` / `providers` 에 클래스를 추가하거나, 예제가
`app.container.resolve(X)` 를 사용한다면 **`app.container` 는 root
모듈의 providers만 본다**는 점을 기억하세요. 모듈 스코프 서비스는
`app.modules[0].container.resolve(X)` 또는 `new X()` 를 사용하세요.

### "Listening on port …" 메시지가 안 보임

예제가 부팅 후 hang 했을 수 있습니다. 예: `await app.listen(3000)` 은
성공했지만 후속 로그가 없습니다. 예제를 수정해서 인식되는 marker 중
하나를 출력하거나, 합당한 커스텀 메시지가 있다면 `smoke.test.ts` 의
`bootExample` 정규식을 변경하세요.

### 예제당 2초 이상 걸림

예제가 진짜로 부팅이 느린 경우이거나, success regex와 너무 일찍
매치되는 로그를 출력하는 경우입니다. 테스트 실행 중 예제 stdout 을
확인하세요.
