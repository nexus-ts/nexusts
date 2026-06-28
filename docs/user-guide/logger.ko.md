# 구조화 로깅 · `@nexusts/logger`

> English version: [`logger.md`](./logger.md)

`@nexusts/logger`는 Pino 기반의 구조화된 레벨 기반 로깅을
제공합니다. 개발 환경에서는 pretty-print, 프로덕션에서는
컴팩트 JSON을 출력하며, `AsyncLocalStorage`를 통해 요청
스코프가 적용되어 — 요청 내의 모든 로그에 자동으로
`requestId`, `userId` 등이 포함됩니다.

---

## 주요 기능

- **6가지 로그 레벨:** `trace`, `debug`, `info`, `warn`, `error`, `fatal`
- **구조화된 메타데이터:** 메시지와 함께 객체 전달 가능
- **Pretty-print** (개발) / **JSON** (프로덕션) — `NODE_ENV`로 자동 감지
- **요청 스코프 컨텍스트:** 요청 내 모든 로그에 자동 태깅
- **Child 로거:** 영구 바인딩이 적용된 스코프 로거 생성
- **플러그 가능한 트랜스포트:** Pino, Pretty, Null 또는 커스텀
- **무음 모드:** 테스트에서 모든 출력 억제
- **설정 없는 기본값:** 모든 환경에 적합한 기본값 제공

---

## 빠른 시작

```ts
import { Module } from '@nexusts/core';
import { LoggerModule } from '@nexusts/logger';

@Module({
  imports: [
    LoggerModule.forRoot({
      level: 'info',         // 출력할 최소 레벨
      pretty: process.env.NODE_ENV !== 'production',
      base: { service: 'my-app' },
    }),
  ],
})
export class AppModule {}
```

임포트 경로:

```ts
import { Logger, LoggerModule } from '@nexusts/logger';
```

프로덕션 사용을 위한 추가 npm 설치는 필요하지 않습니다 — `pino`가
`@nexusts/logger`의 직접 의존성으로 번들링되어 있습니다.
개발 환경에서 컬러 pretty-print 출력을 원한다면 선택적으로
`pino-pretty`를 설치하세요.

---

## 서비스에서 사용

### 방법 1: 직접 생성 (DI 불필요)

가장 간단한 방법 — 인젝션 필요 없음:

```ts
import { Injectable } from '@nexusts/core';
import { Logger } from '@nexusts/logger';

@Injectable()
class UserService {
  private logger = new Logger();

  async signUp(email: string) {
    this.logger.info({ email }, '회원 가입 완료');
    // ...
  }
}
```

`Logger`는 내부적으로 단일 Pino 인스턴스를 공유하므로 `new Logger()`를
여러 번 호출해도 가볍습니다. 요청 스코프 컨텍스트(`AsyncLocalStorage`)도
인젝션 없이 자동으로 동작합니다.

### 방법 2: 필드 인젝션 (표준 데코레이터)

```ts
import { Inject, Injectable } from '@nexusts/core';
import { Logger } from '@nexusts/logger';

@Injectable()
class UserService {
  @Inject(Logger.TOKEN) declare logger: Logger;

  async signUp(email: string) {
    this.logger.info({ email }, '회원 가입 완료');
    // ...
  }
}
```

### 로그 메서드

모든 레벨은 두 가지 호출 시그니처를 제공합니다:

```ts
// 구조화된 메타데이터와 함께
logger.info({ userId: 42, role: 'admin' }, '사용자 로그인');

// 문자열만 사용
logger.info('서버 시작됨');

// 모든 레벨이 동일한 패턴을 따름
logger.trace({ step: 'init' }, '시작');
logger.debug({ query }, 'SQL 실행됨');
logger.info({ event: 'purchase' }, '주문 접수');
logger.warn({ key: 'homepage' }, '캐시 미스');
logger.error({ err, orderId: 99 }, '결제 실패');
logger.fatal({ reason: 'OOM' }, '메모리 부족, 종료 중');
```

---

## 설정

### `LoggerModule.forRoot(options)`

| 옵션 | 타입 | 기본값 | 설명 |
| ---- | ---- | ------ | ---- |
| `level` | `LogLevel` | `'info'` (프로덕션), `'debug'` (개발) | 출력할 최소 레벨 |
| `pretty` | `boolean` | `NODE_ENV !== 'production'` | Pretty-print 출력 |
| `transports` | `LogTransport[]` | 자동 (Pino 또는 Pretty) | 커스텀 트랜스포트 |
| `base` | `Record<string, unknown>` | `{}` | 모든 레코드에 포함될 정적 필드 |
| `silent` | `boolean` | `false` | 모든 출력 억제 |

```ts
// 프로덕션 전체 설정
LoggerModule.forRoot({
  level: 'info',
  pretty: false,                    // 로그 수집기를 위한 JSON
  base: { service: 'payment-api', region: 'us-east-1' },
});

// 개발 전체 설정
LoggerModule.forRoot({
  level: 'debug',
  pretty: true,                     // 컬러 터미널 출력
  base: { service: 'payment-api' },
});

// 테스트 — 출력 없음
LoggerModule.forRoot({
  silent: true,
});
```

---

## 요청 스코프 컨텍스트

로거는 `AsyncLocalStorage`를 사용하여 비동기 경계를 넘어
컨텍스트를 전파합니다. `logger.with()` 블록 내부의 모든
`logger.info()` 호출은 자동으로 컨텍스트를 로그 레코드에
병합합니다.

### 기본 사용

```ts
import { Logger } from '@nexusts/logger';
import { randomUUID } from 'node:crypto';

class RequestHandler {
  private logger = new Logger();

  async handle(request: Request) {
    await this.logger.with(
      {
        requestId: randomUUID(),
        userId: request.headers.get('x-user-id') ?? 'anon',
      },
      async () => {
        this.logger.info('요청 처리 중');          // ← requestId + userId 태깅됨
        // 중첩된 비동기 호출도 컨텍스트를 상속
        await this.process();
      },
    );
  }

  private async process() {
    this.logger.info('중첩 호출 내부');            // ← 동일한 requestId + userId
  }
}
```

### 미들웨어 패턴

미들웨어에서 요청 스코프 로깅 설정:

```ts
import { MiddlewareConsumer, Injectable, NestMiddleware } from '@nexusts/core';
import { Logger } from '@nexusts/logger';
import { randomUUID } from 'node:crypto';

@Injectable()
class RequestLoggerMiddleware implements NestMiddleware {
  private logger = new Logger();

  use(req: any, _res: any, next: () => void) {
    this.logger.with(
      {
        requestId: randomUUID(),
        method: req.method,
        url: req.url,
      },
      () => next(),
    );
  }
}
```

### 현재 컨텍스트 읽기

```ts
const ctx = logger.context;
// { requestId: '...', userId: '...' }
```

---

## Child 로거

영구적으로 바인딩이 적용된 child 로거를 생성합니다:

```ts
class OrderService {
  @Inject(Logger.TOKEN) declare logger: Logger;
  private _orderLogger: Logger | null = null;

  private get orderLogger(): Logger {
    if (!this._orderLogger) {
      this._orderLogger = this.logger.child({ service: 'order', version: 'v2' });
    }
    return this._orderLogger;
  }

  async createOrder(data: OrderData) {
    this.orderLogger.info({ data }, '주문 생성 중');
    // 출력: { "service": "order", "version": "v2", "data": {...}, "msg": "주문 생성 중" }
  }
}
```

Child 로거는 부모와 동일한 트랜스포트와 `AsyncLocalStorage`
인스턴스를 공유하므로, child의 영구 바인딩 위에 요청 스코프
컨텍스트가 계속 적용됩니다.

---

## 트랜스포트

### 내장 트랜스포트

| 트랜스포트 | 사용 시기 | 출력 |
| ---------- | --------- | ---- |
| `PinoTransport` | 프로덕션 (`pretty: false`) | `pino`를 통한 컴팩트 JSON |
| `PrettyTransport` | 개발 (`pretty: true`) | `pino-pretty`를 통한 컬러 출력 |
| `NullTransport` | 테스트 / 무음 모드 | 모든 레코드 폐기 |

`level` / `pretty` 단축 옵션을 사용하면 트랜스포트가 자동
선택됩니다. 명시적으로 설정할 수도 있습니다:

```ts
import { LoggerModule, PinoTransport, PrettyTransport } from '@nexusts/logger';

LoggerModule.forRoot({
  transports: [
    new PinoTransport('info', { service: 'my-app' }),
  ],
});
```

### 커스텀 트랜스포트

`LogTransport` 인터페이스를 구현합니다:

```ts
import { LogTransport, LogRecord } from '@nexusts/logger';

class FileTransport implements LogTransport {
  readonly name = 'file';
  readonly isDefault = false;

  constructor(private filePath: string) {}

  write(record: LogRecord): void {
    // 레코드를 파일, 데이터베이스, 외부 서비스 등에 기록
    // write 메서드는 동기적으로 호출됨; 비동기 작업은 내부에서 큐잉
    const line = JSON.stringify(record) + '\n';
    // 파일에 추가 …
  }
}
```

그런 다음 전달합니다:

```ts
LoggerModule.forRoot({
  transports: [new FileTransport('/var/log/app.log')],
});
```

### 지연 로딩되는 피어 의존성

`PrettyTransport`를 사용하는데 `pino-pretty`가 설치되지 않은
경우, 로거는 일반 JSON으로 폴백합니다. pretty-print 헬퍼 설치:

```bash
# 개발 환경 컬러 출력을 위해
bun add pino-pretty
```

pino 자체는 `@nexusts/logger`에 번들링되어 있습니다 — 수동 설치가
필요하지 않습니다.

---

## 무음 모드 (테스트)

테스트 중에 모든 로그 출력을 억제합니다:

```ts
LoggerModule.forRoot({
  silent: true,
});
```

또는 `NullTransport`로 교체:

```ts
import { LoggerModule, NullTransport } from '@nexusts/logger';

LoggerModule.forRoot({
  transports: [new NullTransport()],
});
```

---

## 라이프사이클: `await logger.ready()`

Pino 트랜스포트는 비동기적으로 초기화됩니다. 첫 로그를
출력하기 전에 트랜스포트가 완전히 준비되었는지 확인하려면
(예: 통합 테스트) `ready()`를 호출합니다:

```ts
@Injectable()
class AppBootstrap {
  private logger = new Logger();

  async onStart() {
    await this.logger.ready();
    this.logger.info('로거가 완전히 초기화되었습니다');
  }
}
```

실제로는 트랜스포트가 준비될 때까지 폴백(`console.log`)으로
출력하므로, 일반 애플리케이션 코드에서 `ready()`를 await할
필요는 없습니다.

---

## 예제

### 기본 컨트롤러

```ts
import { Controller, Get, Inject } from '@nexusts/core';
import { Logger } from '@nexusts/logger';

@Controller('/users')
class UserController {
  private logger = new Logger();

  @Get()
  list() {
    this.logger.info({ path: '/users' }, '사용자 목록 조회');
    return { users: [] };
  }
}
```

### 스택 트레이스와 함께 에러 로깅

```ts
try {
  await this.processOrder(orderId);
} catch (err) {
  this.logger.error(
    { err, orderId, userId: this.userId },
    '주문 처리 실패',
  );
  throw err;
}
```

### 크론 작업에서 로깅

```ts
import { Cron } from '@nexusts/schedule';
import { Inject } from '@nexusts/core';
import { Logger } from '@nexusts/logger';

class CleanupJob {
  private logger = new Logger();

  @Cron('0 3 * * *')
  async nightlyCleanup() {
    this.logger.info('야간 정리 시작');
    // …
    this.logger.info('야간 정리 완료');
  }
}
```

---

## API 참조

### `Logger` 클래스

| 메서드 / 프로퍼티 | 설명 |
| ----------------- | ---- |
| `trace(meta, msg)` / `trace(msg)` | `trace` 레벨 로그 |
| `debug(meta, msg)` / `debug(msg)` | `debug` 레벨 로그 |
| `info(meta, msg)` / `info(msg)` | `info` 레벨 로그 |
| `warn(meta, msg)` / `warn(msg)` | `warn` 레벨 로그 |
| `error(meta, msg)` / `error(msg)` | `error` 레벨 로그 |
| `fatal(meta, msg)` / `fatal(msg)` | `fatal` 레벨 로그 |
| `with(context, fn)` | 요청 스코프 컨텍스트 내에서 `fn` 실행 |
| `child(bindings)` | 영구 바인딩이 있는 child 로거 생성 |
| `ready()` | 트랜스포트 초기화 완료 대기 |
| `context` (getter) | 현재 `AsyncLocalStorage` 컨텍스트 읽기 |
| `transports` | 활성 `LogTransport` 인스턴스 배열 |
| `silent` | 로깅 억제 여부 |
| `level` | 현재 최소 레벨 |
| `TOKEN` (static) | DI 주입 토큰: `Symbol.for('nexus:Logger')` |

### `LoggerModule`

| 메서드 | 설명 |
| ------ | ---- |
| `forRoot(options)` | 전역 설정으로 로거 등록 |

### 타입

```ts
type LogLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal';

interface LoggerOptions {
  level?: LogLevel;
  pretty?: boolean;
  transports?: LogTransport[];
  base?: Record<string, unknown>;
  silent?: boolean;
}

interface LogRecord {
  level: LogLevel;
  time: number;
  msg: string;
  [key: string]: unknown;
}

interface LogTransport {
  readonly name: string;
  readonly isDefault?: boolean;
  write(record: LogRecord): void;
}

interface LogContext {
  requestId?: string;
  userId?: string;
  tenantId?: string;
  [key: string]: unknown;
}
```

---

## 참고

- [`../design/logger.md`](../design/logger.md) — 디자인 문서
- [`production-basics.ko.md`](./production-basics.ko.md) — health, config, logger, static 한 곳에서
- [`tracing.ko.md`](./tracing.ko.md) — 로그 상관 관계를 통한 분산 추적
- [`cross-cutting-features.ko.md`](./cross-cutting-features.ko.md) — 횡단 관심사 모듈 개요
- [Pino 문서](https://getpino.io/) — 로거 백엔드
- [pino-pretty](https://github.com/pinojs/pino-pretty) — pretty-print 트랜스포트
