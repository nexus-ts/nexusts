# 의존성 주입

> English version: [`dependency-injection.md`](./dependency-injection.md)

NexusTS는 NestJS 스타일의 의존성 주입을 사용합니다. 서비스, 리포지토리, 어댑터는 `@Module({ providers, exports })`을 통해 연결되며, 생성 시점에 자동으로 해석됩니다.

## 0. 두 가지 인젝션 패턴

NexusTS는 두 가지 DI 패턴을 함께 지원합니다:

### 필드 인젝션 (표준 데코레이터, v0.9+)

```ts
import { Injectable, Inject } from '@nexusts/core';

@Injectable()
export class UserService {
  @Inject('LOG') declare log: { info: (msg: string) => void };

  findAll() {
    this.log.info('UserService.findAll');
    return [{ id: 1, name: 'Alice' }];
  }
}
```

이 패턴은 TC39 표준 ES 데코레이터와 함께 동작합니다 —
`experimentalDecorators`나 `reflect-metadata`가 필요 없습니다.

### 생성자 인젝션 (레거시, v0.8 이하)

```ts
@Injectable()
export class UserService {
  constructor(
    @Inject('LOG') private readonly log: { info: (msg: string) => void },
  ) {}
  // ...
}
```

생성자 인젝션은 `experimentalDecorators: true`와 각 파라미터에
명시적인 `@Inject(Token)`이 필요합니다 (Bun의 TS 트랜스파일러가
`design:paramtypes`를 내보내지 않기 때문).

> **마이그레이션 팁**: `@Inject(T) declare t: T;`를
> `@Inject(T) declare t: T;`로 바꾸고 생성자를 제거하세요. DI
> 컨테이너가 자동으로 필드 인젝션을 감지합니다.

---

서비스는 `@Injectable()`이 붙은 일반 클래스입니다.

```ts
// app/services/user.service.ts
import { Inject, Injectable } from '@nexusts/core';
import type { UserRepository } from '../repositories/user.repository.js';

@Injectable()
export class UserService {
  constructor(
    @Inject('LOG') private readonly log: { info: (msg: string) => void },
  ) {}

  findAll() {
    this.log.info('UserService.findAll');
    return [{ id: 1, name: 'Alice' }];
  }
}
```

컨테이너는 모듈의 `providers` 목록에서 의존성 그래프를 만들고, 첫 사용 시 지연 해석합니다.

---

## 2. 왜 명시적 `@Inject(...)`인가?

TypeScript는 생성자 파라미터 타입을 `design:paramtypes` 메타데이터에서 읽을 수 있지만 — 이는 `tsc`로 빌드하고 `emitDecoratorMetadata: true`(더 이상 불필요 — 제거됨)일 때만 가능합니다. Bun의 네이티브 TypeScript transformer는 그 메타데이터를 emit하지 **않습니다**.

따라서 NexusTS는 각 파라미터의 **명시적 `@Inject(Token)`**을 표준으로 채택했습니다. 이는 `tsc`, `ts-node`, Bun 모두에서 휴대 가능하게 만듭니다.

```ts
// 항상 휴대 가능 — 권장.
@Inject(UserRepository) declare repo: UserRepository;

// tsc에서 동작, Bun transformer는 무시.
constructor(private repo: UserRepository) {}
```

> `bun app/...`(기본값)에서는 항상 명시적 `@Inject(...)`를 사용하세요.

---

## 3. Providers

`Provider`는 요청 시 값을 만드는 모든 것입니다. 다섯 가지 형태가 있습니다.

### 3.1 클래스 프로바이더 (가장 일반적)

```ts
@Module({
  providers: [UserService],   // shorthand: { provide: UserService, useClass: UserService }
})
```

### 3.2 값 프로바이더

```ts
import { drizzle } from 'drizzle-orm/bun-sqlite';

@Module({
  providers: [
    { provide: 'DB', useValue: drizzle('app.db') },
  ],
})
```

다음과 같이 주입:

```ts
@Injectable()
class UserRepository {
  @Inject('DB') declare db: any;
}
```

### 3.3 팩토리 프로바이더

```ts
@Module({
  providers: [
    {
      provide: 'CONFIG',
      useFactory: () => ({
        env: process.env['NODE_ENV'] ?? 'development',
        port: Number(process.env['PORT'] ?? 3000),
      }),
    },
  ],
})
```

### 3.4 별칭 프로바이더

```ts
@Module({
  providers: [
    { provide: 'LOGGER', useExisting: 'CONSOLE_LOGGER' },
    { provide: 'CONSOLE_LOGGER', useValue: console },
  ],
})
```

### 3.5 토큰 프로바이더 (symbol/string 키)

```ts
const CONFIG = Symbol('CONFIG');

@Module({
  providers: [
    { provide: CONFIG, useValue: { port: 3000 } },
  ],
})
```

---

## 4. 모듈

`@Module`은 무엇을 소유하고 무엇을 공유할지 선언합니다.

```ts
@Module({
  imports: [OtherModule],          // 다른 모듈의 exports 가져오기
  controllers: [UserController],   // HTTP 핸들러
  providers: [UserService, UserRepository, { provide: 'DB', useValue: db }],
  exports: [UserService],          // 이 토큰을 importer에 제공
})
export class UserModule {}
```

> **캡슐화.** `exports`에 없는 것은 선언된 모듈 내부에 private입니다. `OtherModule`은 `UserModule`이 다시 export하지 않는 한 `UserRepository`를 주입할 수 없습니다.

### 모듈 트리

일반적인 앱:

```ts
@Module({ imports: [UserModule, OrderModule, AuthModule] })
class AppModule {}
```

각 모듈은 자체 **자식 컨테이너**(`DIContainer`)를 가지며, export된 토큰은 부모에 노출되어 import하는 모듈이 해석할 수 있습니다.

---

## 5. 생성자 주입

```ts
@Injectable()
class OrderService {
  constructor(
    @Inject(UserService) private users: UserService,
    @Inject('PAYMENT_GATEWAY') private payments: PaymentGateway,
  ) {}
}
```

컨테이너는 파라미터 목록을 순회하며 각 토큰을 해석하고 인스턴스를 생성합니다. 해석 실패는 누락된 토큰을 가리키는 에러를 던집니다.

---

## 6. 프로퍼티 주입

권장하지는 않지만, 클래스 필드 데코레이터(드물게 사용됨)를 통해 지원됩니다.

```ts
@Injectable()
class LegacyService {
  @Inject('LEGACY_DB')
  private legacyDb!: any;
}
```

생성자 주입을 권장합니다 — 의존성을 명시적이고 테스트 가능하게 만듭니다.

---

## 7. 스코프

| 스코프 | 동작 | 기본값? |
| ----- | --------- | -------- |
| `singleton` | 컨테이너당 인스턴스 1개 | 예 |
| `transient` | `resolve()`마다 새 인스턴스 | 아니오 |

```ts
@Module({
  providers: [
    UserService,                                // singleton
    {
      provide: 'REQUEST_ID',
      useFactory: () => crypto.randomUUID(),
      scope: 'transient',                       // resolve마다 새 인스턴스
    },
  ],
})
```

`request` 스코프(HTTP 요청당 인스턴스 1개)는 v0.2에서 계획되어 있습니다.

---

## 8. 순환 의존성

컨테이너는 사이클을 감지하고 의미 있는 에러를 던집니다.

```
Error: Circular dependency detected for token "A"
  A → B → C → A
```

팩토리를 도입하여 사이클을 끊으세요.

```ts
// 이전: A가 B를 import, B가 A를 import → 사이클.
@Injectable()
class A { @Inject(B) declare b: B; }
@Injectable()
class B { @Inject(A) declare a: A; }

// 이후: B는 forward-reference 팩토리를 통해 A를 받음.
@Injectable()
class B {
  private a?: A;
  setA(a: A) { this.a = a; }
}
```

---

## 9. 테스트에서 mock 사용

자식 컨테이너를 수동으로 만들어 프로바이더를 교체합니다.

```ts
import { DIContainer } from '@nexusts/core';

const container = new DIContainer();
container.register({ provide: 'DB', useValue: mockDb });
container.register(UserRepository);

const repo = container.resolve(UserRepository);   // mock된 DB를 받음
```

`Application.bootstrap()` 오버라이드(planned for v0.2):

```ts
// 미래 API — 아직 구현되지 않음.
const app = Application.bootstrap(AppModule, {
  overrides: [
    { provide: 'DB', useValue: mockDb },
  ],
});
```

---

## 10. 일반적인 패턴

### Database / ORM

```ts
@Module({
  providers: [
    { provide: 'DB', useValue: drizzle('app.db') },
    UserRepository,
  ],
  exports: [UserRepository],
})
class DatabaseModule {}

@Module({
  imports: [DatabaseModule],
  providers: [UserService],
})
class UserModule {}
```

### Configuration

```ts
@Module({
  providers: [
    {
      provide: 'CONFIG',
      useFactory: () => loadConfig(),   // env가 잘못되면 throw
    },
  ],
  exports: ['CONFIG'],
})
class ConfigModule {}
```

### Logging

```ts
@Module({
  providers: [
    { provide: 'LOG', useValue: console },
  ],
})
class AppModule {
  // 모든 서비스가 같은 로거를 `@Inject('LOG')`할 수 있음.
}
```

---

## 11. 디버깅

부팅 시 의존성 그래프를 출력하려면 `NEXUS_DEBUG=1`을 설정하세요.

```bash
NEXUS_DEBUG=1 bun app/main.ts
```

출력:

```
[nexus] Modules: 3
[nexus] Controllers: [UserController, OrderController]
[nexus] Providers (root): [Inertia, CONFIG, DB]
[nexus] Inertia: enabled
```
