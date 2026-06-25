# 런타임 & 배포

> English version: [`runtime-deployment.md`](./runtime-deployment.md)

NexusTS는 단일 `Application` API를 통해 **Bun, Node.js, Cloudflare Workers**를 대상으로 합니다. 프레임워크는 런타임을 자동 감지하고 적절한 어댑터를 로드합니다.

---

## 1. Bun (기본값)

```ts
// main.ts
import { Application } from '@nexusts/core';
import { AppModule } from './app.module.js';

const app = new Application(AppModule);
await app.listen(3000);
```

실행:

```bash
bun app/main.ts
```

핫 리로드:

```bash
bun --hot app/main.ts
```

Bun은 **가장 빠른** 경로입니다 — 빌드 단계 없음, 트랜스파일 단계 없음. `bun:sqlite` 모듈도 네이티브 SQLite로 사용 가능합니다.

---

## 2. Node.js

프레임워크에는 `globalThis.Bun`이 없을 때 사용되는 Node 어댑터(`node:http` 기반)가 포함되어 있습니다.

### 2.1 먼저 빌드 후 실행

```bash
bun run build           # dist/ 생성
node dist/main.js       # 또는 bun dist/main.js
```

### 2.2 tsx / ts-node

빌드 없는 워크플로우의 경우:

```bash
npx tsx app/main.ts
```

`tsx`와 `ts-node` 모두 `tsconfig.json`을 존중하고 `design:paramtypes`를 emit하므로 bare-type 생성자 주입이 동작합니다.

---

## 3. Cloudflare Workers

```ts
// app/worker.ts
import { Application } from '@nexusts/core';
import { AppModule } from './app.module.js';

const app = new Application(AppModule);

export default {
  fetch: app.fetch,
};
```

`wrangler.toml`:

```toml
name = "nexus-app"
main = "app/worker.ts"
compatibility_date = "2024-12-01"

[vars]
NEXUS_DEBUG = "0"
```

배포:

```bash
bunx wrangler deploy
```

> 런타임 어댑터는 scheduled handler(v0.2) 및 Durable Objects(v0.3)와 같은 것들을 위해 `ExecutionContext`를 정규화합니다. v0.1에서는 `fetch` 핸들러만 연결됩니다.

### 주의 사항

- **요청 시 파일 시스템 액세스 없음** — 템플릿이나 애셋을 미리 번들하세요.
- **`emitDecoratorMetadata`는 Cloudflare의 esbuild가 무시합니다** — 항상 명시적 `@Inject(...)`를 사용하세요.
- **Inertia SSR은 엣지 친화적** — 프레임워크가 플러그인 가능한 어댑터를 제공합니다. 런타임 호환 렌더러를 선택하세요(React는 잘 동작; Svelte 4의 standalone `svelte/server`도 OK).

---

## 4. 환경 변수

프레임워크는 다음 세 가지 env 변수를 읽습니다.

| 변수 | 효과 |
| --- | ------ |
| `NODE_ENV` | 설정되지 않으면 기본값 `'development'` |
| `PORT` | `app.listen()`의 기본 포트 |
| `NEXUS_DEBUG` | 부팅 시 의존성 그래프를 출력하려면 `1`로 설정 |

다른 env 변수(DB URL, API 키 등)는 프레임워크가 아닌 **사용자의** config 프로바이더가 읽습니다. 권장:

```ts
@Module({
  providers: [
    {
      provide: 'CONFIG',
      useFactory: () => loadConfig(),   // 잘못된 env에 대해 throw
    },
  ],
  exports: ['CONFIG'],
})
class ConfigModule {}
```

---

## 5. 빌드 설정

`build.ts`(프로젝트가 함께 제공)는 Bun의 번들러를 사용합니다.

```ts
// build.ts
import { build } from 'bun';

const result = await build({
  entrypoints: ['app/index.ts'],
  outdir: 'dist',
  target: 'bun',
  format: 'esm',
  splitting: true,
  sourcemap: 'external',
  minify: process.env['NODE_ENV'] === 'production',
});

if (!result.success) {
  for (const message of result.logs) console.error(message);
  process.exit(1);
}
```

멀티 타겟 빌드(Bun + Node + Workers)의 경우 `entrypoints`에 항목을 추가:

```ts
entrypoints: [
  'app/main.ts',         // Bun / Node 진입점
  'app/worker.ts',           // Cloudflare 진입점
],
```

Workers의 경우 빌드 후 worker 진입점을 가리키도록 `wrangler.toml`을 구성하세요.

---

## 6. 프로덕션 체크리스트

- [ ] `NODE_ENV=production`
- [ ] `version`을 빌드 ID 또는 git SHA로 설정 (Inertia)
- [ ] 선택한 엔진으로 `app.setViewAdapter(...)`
- [ ] SSR 사용 시 `app.inertia.setSsrAdapter(...)`
- [ ] CSRF 미들웨어 활성화 (기본값)
- [ ] Rate limiting (v0.2 예정 — 지금은 Hono 미들웨어 사용)
- [ ] CORS 구성 (Hono `cors()` 미들웨어)
- [ ] Helmet 류 보안 헤더 (Hono `secureHeaders()`)
- [ ] 로깅 연결 (기본 console 로거 교체)
- [ ] 에러 트래킹 (Sentry 등)
- [ ] 프로세스 감독 (systemd, PM2, Docker 재시작 정책)

---

## 7. 컨테이너 배포 (Docker)

```dockerfile
FROM oven/bun:1.3 AS build
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile
COPY . .
RUN bun run build

FROM oven/bun:1.3 AS runtime
WORKDIR /app
COPY --from=build /app/dist ./dist
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./
EXPOSE 3000
CMD ["bun", "dist/main.js"]
```

Workers의 경우 Docker 없이 `wrangler deploy`를 직접 사용하세요.

---

## 8. 프로세스 모델

| 런타임 | 프로세스 모델 | 노트 |
| ------- | ------------- | ----- |
| **Bun** | 단일 이벤트 루프 | 모든 `await`는 논블로킹; 비동기 I/O 사용 |
| **Node** | 단일 이벤트 루프 | Bun과 동일; `node:` 빌트인 사용 |
| **Workers** | 요청당 isolate | 콜드 스타트 비용; import를 가볍게 유지 |

장기 실행 작업(큐 작업, 스케줄링)의 경우 다음을 사용:

- **Bun / Node** — BullMQ, sidekiq 류 워커
- **Workers** — Cloudflare Queues, Durable Objects, Cron Triggers

이는 v0.2에서 일급 시민이 됩니다.

---

## 9. 로그

프레임워크는 기본적으로 `console`에 로그를 출력합니다. 교체하려면:

```ts
import { logger } from '@nexusts/core';  // 노출된 경우
// 또는 커스텀 미들웨어 사용:
app.server.app.use('*', async (c, next) => {
  const start = Date.now();
  await next();
  console.log(`[${c.req.method}] ${c.req.path} ${c.res.status} ${Date.now() - start}ms`);
});
```

일급 logger 추상화는 v0.2에서 예정되어 있습니다(`useExisting`으로 구현체를 교체하는 NestJS 스타일의 `@Injectable() class Logger`).

---

## 10. 정상 종료

```ts
// Bun
const server = app.listen(3000);
process.on('SIGINT', () => {
  server.stop();
  process.exit(0);
});

// Node (node:http를 통해 유사)
```

Workers는 명시적인 종료가 필요 없습니다 — Cloudflare가 요청 후 isolate를 해체합니다.

---

## 11. 타겟 선택

| 필요 | 최선의 타겟 |
| ---- | ----------- |
| 로컬 개발, 가장 빠른 반복 | **Bun** |
| systemd / PM2를 사용하는 장기 실행 서버 | **Node** |
| 글로벌 엣지, 낮은 레이턴시, 운영 부담 없음 | **Cloudflare Workers** |
| 네이티브 SQLite | **Bun** (`bun:sqlite`) |
| 최대 에코시스템 호환성 | **Node** |
| 스트리밍 SSR | **Bun** 또는 **Node** (Workers에는 크기 제한) |


---

## 12. 멀티 런타임 CI 설정

NexusTS는 세 가지 GitHub Actions 워크플로우를 제공한다.

### ci.yml — 메인 CI (Bun + Node.js 22)

모든 push/PR에서 실행된다:

```
.github/workflows/ci.yml
```

| 잡 | 런타임 | 설명 |
| --- | ------- | ---- |
| `test-bun` | Bun 1.3 / latest | 전체 테스트 스위트 + 타입체크 |
| `test-node` | Node.js 22 | bun:sqlite 제외 테스트 서브셋 |
| `lint` | Bun | biome check |
| `build` | Bun | 전체 패키지 빌드 검증 |

Node.js 런타임 테스트는 `vitest.config.node.ts`를 사용한다. Bun-native API에 의존하는 테스트는 제외된다:
- `tests/drizzle/drizzle.test.ts` — `bun:sqlite` 사용
- `tests/cache/drizzle-store.test.ts`
- `tests/session/drizzle-backend.test.ts`
- `tests/limiter/drizzle-storage.test.ts`

### ci-drizzle.yml — Drizzle 방언별 CI

`packages/drizzle/**` 또는 `tests/drizzle/**` 변경 시 실행된다:

```
.github/workflows/ci-drizzle.yml
```

| 잡 | 방언 | 서비스 컨테이너 |
| --- | ---- | -------------- |
| `bun-sqlite` | bun-sqlite | 없음 |
| `postgres` | postgres | postgres:16-alpine |
| `factory` | 방언 무관 | 없음 |

PostgreSQL 테스트는 `DATABASE_URL` 환경 변수로 연결 URL을 받는다.

### ci-workers.yml — Cloudflare Workers 패리티

`packages/redis/**`, `packages/session/**` 변경 시 실행된다:

```
.github/workflows/ci-workers.yml
```

| 잡 | 설명 |
| --- | ---- |
| `adapter-parity` | Node.js에서 MemoryAdapter/CloudflareKVAdapter 패리티 검증 |
| `miniflare-smoke` | wrangler를 이용한 로컬 Workers 스모크 테스트 |

CF Workers 어댑터는 mock KV 네임스페이스로 테스트된다 — 실제 Cloudflare 계정 불필요.

### 로컬에서 Node.js 테스트 실행

```bash
# Bun (기본)
bun run test

# Node.js 22 parity
node --experimental-vm-modules node_modules/.bin/vitest run --config vitest.config.node.ts

# 런타임 패리티 테스트만
bun run vitest run tests/runtime/
```

### README 배지

워크플로우 상태 배지는 `README.md`에 자동으로 포함되어 있다:

```markdown
[![CI (Bun)](https://github.com/nexus-ts/nexusts/actions/workflows/ci.yml/badge.svg)](...)
[![CI (Node.js)](https://github.com/nexus-ts/nexusts/actions/workflows/ci.yml/badge.svg)](...)
[![CI (Workers)](https://github.com/nexus-ts/nexusts/actions/workflows/ci-workers.yml/badge.svg)](...)
[![Drizzle Dialects](https://github.com/nexus-ts/nexusts/actions/workflows/ci-drizzle.yml/badge.svg)](...)
```
