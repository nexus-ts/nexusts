# @nexusts/drizzle — Drizzle ORM 통합 (기본 ORM)

> English version: [`drizzle.md`](./drizzle.md)

`@nexusts/drizzle`는 NexusTS의 **기본 ORM**이다. Drizzle ORM을
DI 친화적인 서비스, Lucid 스타일 repository 패턴, entity model
base class, 선언적 decorator, 자동 마이그레이션, SQL 인젝션 방지
raw query API로 감싼다.

```
@Module({
  imports: [
    DrizzleModule.forRoot({
      dialect: 'sqlite',                 // 'postgres' | 'mysql' | 'sqlite' | 'd1'
      connection: { filename: './data.db' },  // dialect-specific
      logging: true,                         // 선택 쿼리 로거
      autoMigrate: true,                     // 부팅 시 마이그레이션 자동 실행
      migrationsFolder: './drizzle',         // 생성된 SQL 파일 폴더
    }),
  ],
})

class UserService {
  @Inject(DrizzleService.TOKEN) declare db: DrizzleService;
  list() { return this.db.select().from(users).all(); }
}
```

---

## 1. 지원 dialect

| Dialect | 연결 형식 | 드라이버 |
| ------- | ----------------- | ------ |
| `postgres` | `{ url }` 또는 `{ host, port, user, password, database, ssl, pool }` | `postgres.js` (기본) → `pg` fallback |
| `mysql` | `{ host, port, user, password, database, pool }` | `mysql2` |
| 'sqlite' | `{ filename, readonly? }` | `better-sqlite3` |
| `sqlite` | `{ filename }` | `bun:sqlite` (Bun 내장) |
| `d1` | `{ binding: D1Database }` | Cloudflare D1 (Workers) |

모든 연결 드라이버 패키지는 **선택 peer dependency** — 사용할 것만
설치. `drizzle-orm` 자체는 필수 peer.

---

## 2. 빠른 시작

### 설치

```bash
bun add drizzle-orm
# 다음 중 하나:
bun add pg            # postgres fallback
bun add postgres      # postgres.js (권장)
bun add mysql2
bun add better-sqlite3
```

### 설정

```ts
// app/db/schema.ts
import { pgTable, serial, text, timestamp } from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  email: text('email').notNull().unique(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});
```

```ts
// app/app.module.ts
import { Module } from '@nexusts/core';
import { DrizzleModule } from '@nexusts/drizzle';
import { users } from './db/schema';

@Module({
  imports: [
    DrizzleModule.forRoot({
      dialect: 'postgres',
      connection: { url: process.env.DATABASE_URL! },
      logging: process.env.NODE_ENV !== 'production',
    }),
  ],
})
export class AppModule {}
```

### 사용

```ts
import { Inject } from '@nexusts/core';
import { DrizzleService } from '@nexusts/drizzle';
import { eq } from 'drizzle-orm';
import { users } from './db/schema';

@Injectable()
class UserService {
  @Inject(DrizzleService.TOKEN) declare db: DrizzleService;

  async findById(id: number) {
    return this.db.select().from(users).where(eq(users.id, id)).get();
  }

  async create(email: string) {
    return this.db.insert(users).values({ email }).returning().then((r) => r[0]);
  }

  async deleteById(id: number) {
    return this.db.delete(users).where(eq(users.id, id));
  }
}
```

---

## 3. Lucid 스타일 repository

`DrizzleRepository<TTable, TRow>`는 repository의 Lucid 등가물이다.
Drizzle의 query builder 위에 작고 타입이 명확한 surface를 노출한다.

```ts
import { DrizzleRepository, DrizzleService } from '@nexusts/drizzle';

@Injectable()
class UserRepository extends DrizzleRepository<typeof users> {
  constructor(@Inject(DrizzleService.TOKEN) db: DrizzleService) {
    super(db, users);
  }
}
```

```ts
const repo = new UserRepository(db);
await repo.findAll({ where: { email: 'a@b.com' }, limit: 10, orderBy: desc(users.createdAt) });
await repo.create({ email: 'a@b.com' });
await repo.update({ email: 'a@b.com' }, { email: 'new@b.com' });
await repo.delete({ email: 'a@b.com' });
```

### 트랜잭션

```ts
await repo.transaction(async (txRepo) => {
  await txRepo.create({ email: 'a@b.com' });
  await txRepo.create({ email: 'c@d.com' });
});
```

트랜잭션 안에서 `txRepo`는 트랜잭션 핸들에 묶인 새로운 repository.
콜백이 throw하면 자동으로 롤백.

---

## 4. Entity model + decorator

`DrizzleModel`이 base class. `@Table` / `@Column` / `@PrimaryKey`로
entity를 선언하면 — 메타데이터가 repository에서 기본 쿼리와 reflection
용으로 읽힌다.

```ts
import { DrizzleModel, Table, Column, PrimaryKey } from '@nexusts/drizzle';

@Table('users')
class User extends DrizzleModel {
  @PrimaryKey({ autoIncrement: true, type: 'integer' })
  id!: number;

  @Column({ type: 'text' })
  email!: string;

  @Column({ type: 'text', default: 'active' })
  status!: string;

  @Column()
  createdAt!: Date;
}

const meta = User.getMeta();
console.log(meta?.name);                          // 'users'
console.log([...meta?.columns.keys() ?? []]);     // ['id', 'email', 'status', 'createdAt']
```

> Drizzle **table**은 `pgTable` / `mysqlTable` / `sqliteTable`로 만든다
— model class의 decorator는 도구용 메타데이터이지 런타임 schema가
아니다. 이 분리를 통해 entity model과 Drizzle table 정의가 독립적으로
발전할 수 있다.

---

## 5. Raw query — SQL 인젝션 안전

임시 SQL에는 `db.raw\`...\``를 사용. **모든 보간 값은 바인딩 파라미터로
전송되며 SQL에 절대 연결되지 않는다.** 이것은 Drizzle이 내부적으로
사용하는 것과 같은 primitive이며, logging과 dialect 정규화를 위해
감쌌다.

```ts
// 안전 — `id`는 파라미터이며 SQL에 연결되지 않는다.
const id = "user-42";
const rows = await db.raw`SELECT * FROM users WHERE id = ${id}`.all<User>();

const first = await db.raw`SELECT * FROM users WHERE email = ${email}`.first<User>();
const result = await db.raw`UPDATE users SET status = ${'banned'} WHERE id = ${id}`.execute();
console.log(result.affectedRows);
```

### 왜 안전한가

1. Template literal이 chunks + values로 파싱된다.
2. 값들은 바인딩 파라미터로 전송된다 (postgres는 `$1, $2, ...`,
   sqlite / mysql은 `?`).
3. DB 드라이버가 SQL 텍스트와 파라미터 값을 프로토콜 레벨에서
   분리해서 유지 — SQL 파서가 코드로 오인할 수 있는 string interpolation이
   없다.

```ts
// 악의적 입력이라도 데이터베이스는 리터럴로 취급한다:
const userInput = "admin' OR 1=1 --";
const rows = await db.rawQuery<{ email: string }>(
  "SELECT * FROM users WHERE email = ?",
  [userInput],
);
// rows.length === 0  ✓
```

### 직접 파라미터화 쿼리 (template 없이)

```ts
const rows = await db.rawQuery<User>(
  "SELECT * FROM users WHERE created_at > ? ORDER BY id LIMIT ?",
  [new Date('2026-01-01'), 100],
);
```

### 생성된 SQL 검사

```ts
const q = db.raw`SELECT * FROM users WHERE id = ${id}`;
console.log(q.toSQL());             // 'SELECT * FROM users WHERE id = ?'
console.log(q.getParameters());     // ['user-42']
```

---

## 6. 마이그레이션

### 부팅 시 자동 실행

```ts
DrizzleModule.forRoot({
  dialect: 'postgres',
  connection: { url: process.env.DATABASE_URL! },
  autoMigrate: true,
  migrationsFolder: './drizzle',
});
```

### 프로그래매틱

```ts
const result = await db.migrate('./drizzle');
console.log(`Applied ${result.applied.length} migrations (total: ${result.total}).`);
```

### 마이그레이션 생성

schema에서 SQL을 생성하려면 `drizzle-kit`을 사용:

```bash
bunx drizzle-kit generate
bunx drizzle-kit migrate
```

`drizzle-kit`은 timestamp 기반 `.sql` 파일을 migrations 폴더에 쓴다.
Drizzle migrator가 다음 부팅 시 이를 가져온다.

### 적용된 마이그레이션 검사

```ts
const applied = await db.appliedMigrations();
for (const m of applied) {
  console.log(`#${m.id} ${m.hash} applied at ${m.appliedAt}`);
}
```

---

## 7. 트랜잭션

```ts
await db.transaction(async (tx) => {
  await tx.raw`UPDATE accounts SET balance = balance - ${100} WHERE id = ${from}`.execute();
  await tx.raw`UPDATE accounts SET balance = balance + ${100} WHERE id = ${to}`.execute();
});
```

성공 시 commit. 콜백이 throw하면 underlying DB가 롤백. SQLite
(동기)의 경우 async 경계를 넘는 롤백은 best-effort.

---

## 8. Multi-dialect placeholder 변환

`db.raw`는 항상 `?` placeholder를 출력한다. 드라이버가 이를
dialect의 native 형식으로 변환한 후 전송한다:

| Dialect | Native placeholder |
| ------- | ------------------ |
| `postgres` / `sqlite` w/ postgres.js | `$1, $2, ...` |
| `mysql` / 'sqlite' / `sqlite` / `d1` | `?, ?, ...` |

신경 쓰지 않고 portable 코드를 작성할 수 있다.

---

## 9. 다른 nexus/* 모듈과의 통합

`@nexusts/drizzle`는 나머지 프레임워크의 데이터 백본이다. 세 모듈이
Drizzle 백엔드를 기본 제공한다.

### `@nexusts/session` — DrizzleSessionStorage

```ts
@Module({
  imports: [
    DrizzleModule.forRoot({ dialect: 'postgres', connection: { url: process.env.DATABASE_URL! } }),
    SessionModule.forRoot({
      backend: 'database',
      database: { db: drizzleService, tableName: 'nexus_sessions' },
    }),
  ],
})

-- schema (migration으로 관리)
CREATE TABLE nexus_sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  data JSONB,
  created_at TIMESTAMP NOT NULL,
  last_seen_at TIMESTAMP NOT NULL,
  expires_at TIMESTAMP NOT NULL,
  absolute_expires_at TIMESTAMP,
  metadata JSONB
);
```

`DrizzleSessionStorage` 백엔드는 Drizzle 서비스를 통해 세션 레코드를
읽기/쓰기. schema 컬럼명은 `database.tableName` + `columns` 맵으로
설정 가능.

### `@nexusts/health` — DrizzleHealthIndicator

```ts
import { DrizzleHealthIndicator } from '@nexusts/health';

const db = ...; // DrizzleService
new DrizzleHealthIndicator('database', db, { timeoutMs: 3000 });
```

데이터베이스에 `SELECT 1` (또는 커스텀 probe)을 실행하여
`'up'` / `'down'`을 반환하고 `latencyMs`를 data 필드에 포함.

### `@nexusts/limiter` — DrizzleRateLimitStorage

```ts
import { DrizzleRateLimitStorage } from '@nexusts/limiter';

LimiterModule.forRoot({
  storage: new DrizzleRateLimitStorage(drizzleService),
  rules: [{ path: '/api/*', points: 100, duration: '1m' }],
});

-- schema (migration으로 관리)
CREATE TABLE nexus_rate_limits (
  key TEXT PRIMARY KEY,
  strategy TEXT NOT NULL,
  max_points INTEGER NOT NULL,
  points INTEGER NOT NULL DEFAULT 0,
  reset_at TEXT,
  log TEXT
);
```

여러 Bun 프로세스 / pod에서 rate-limit 상태를 공유해야 할 때 사용.
스토리지는 행당 atomic (consume당 단일 UPDATE 문).

---

## 10. Drizzle Module API

```ts
class DrizzleModule {
  static forRoot(config: DrizzleConfig): Type;
}

interface DrizzleConfig {
  dialect: DrizzleDialect;
  connection: PostgresConnectionOptions | MysqlConnectionOptions | SqliteConnectionOptions | D1ConnectionOptions;
  logging?: boolean | ((q: string, p: unknown[]) => void);
  schema?: string;            // postgres: schema 이름
  migrationsFolder?: string;
  autoMigrate?: boolean;
}
```

```ts
class DrizzleService {
  static readonly TOKEN: symbol;

  open(): Promise<void>;        // lazy-open 연결
  close(): Promise<void>;

  // 타입 안전 Drizzle passthrough
  select(): PgSelectBuilder | ...;
  insert(table): ...;
  update(table): ...;
  delete(table): ...;

  // SQL 인젝션 방지 raw query
  raw: (strings, ...values) => RawQuery;
  rawQuery<T>(sql, params?): Promise<T[]>;

  // 트랜잭션
  transaction<T>(fn: (tx: DrizzleService) => Promise<T>): Promise<T>;

  // 마이그레이션
  migrate(folder: string): Promise<MigrateResult>;
  appliedMigrations(): Promise<MigrationRecord[]>;
}
```

---

## 11. 시딩 팩토리 (Factory)

`Factory<TData>`는 Drizzle 테이블용 테스트 데이터 팩토리다.  
`@faker-js/faker`와 함께 현실적인 픽스처를 생성하거나, faker 없이 정적 데이터만 사용할 수도 있다.

### 설치

```bash
bun add -d @faker-js/faker   # 선택 사항 — faker를 쓰지 않아도 Factory는 동작한다
```

### 팩토리 정의

```ts
// database/factories/user.factory.ts
import { Factory } from '@nexusts/drizzle';
import { users } from '../schema.js';

export const UserFactory = new Factory(users, (faker) => ({
  email:     faker.internet.email(),
  username:  faker.internet.username(),
  createdAt: new Date(),
}));
```

### 메서드

| 메서드 | 설명 |
| ------ | ---- |
| `make(overrides?)` | DB insert 없이 plain object 생성 |
| `makeMany(n, overrides?)` | plain object 배열 생성 |
| `create(db, overrides?)` | 단일 행 insert 후 데이터 반환 |
| `createMany(db, n, overrides?)` | 여러 행을 한 번의 insert로 처리 |

`overrides`는 팩토리 정의값을 부분 덮어쓴다.

### 시드 파일에서 사용

```ts
// database/seeds/01_users.ts
import type { SeedContext } from '@nexusts/cli';
import { UserFactory } from '../factories/user.factory.js';

export default async function seed(ctx: SeedContext) {
  // 10명의 사용자 생성
  await UserFactory.createMany(ctx.db, 10);

  // 특정 값 덮어쓰기
  await UserFactory.create(ctx.db, { email: 'admin@example.com' });
}
```

시드 파일 스캐폴딩:

```bash
nx db:seed --create users    # db/seeds/users.ts 파일 생성
nx db:seed                    # db/seeds/ 내 모든 시드 실행
nx db:seed --file 01_users   # 단일 파일만 실행
nx db:seed --reset           # 테이블 초기화 후 시드 실행 (DESTRUCTIVE)
```

### 테스트에서 사용 (faker 없이)

faker 없이 정적 정의를 사용하면 테스트 환경에서 의존성 없이 동작한다:

```ts
import { Factory } from '@nexusts/drizzle';
import { users } from '../schema.js';

const UserFactory = new Factory(users, () => ({
  email: 'test@example.com',
  username: 'testuser',
}));

it('creates a user', async () => {
  const row = await UserFactory.make({ email: 'override@example.com' });
  expect(row.email).toBe('override@example.com');
});
```

---

## 12. AdonisJS Lucid 격차 해소

| AdonisJS Lucid | NexusTS drizzle 등가물 |
| -------------- | --------------------------- |
| `Model` base class | `DrizzleModel` |
| `@column`, `@column.dateTime` 등 | `@Column`, `@PrimaryKey` |
| `Database.from(table)` | `db.select().from(table)` |
| `await User.find(id)` | `repo.findById(id)` |
| `user.save()` | `repo.create(values)` / `repo.updateById(id, patch)` |
| `await User.all()` | `repo.findAll()` |
| `await User.query().where('email', email).first()` | `repo.findOne({ email })` |
| `Database.transaction(async (trx) => {...})` | `db.transaction(async (tx) => {...})` |
| Migration runner | `db.migrate(folder)` |
| Lucid relations | Drizzle relations API (via `drizzle-orm`) |
| `Database.rawQuery(sql, bindings)` | `db.rawQuery(sql, params)` / `db.raw\`...\`` |
| 여러 연결 dialect | `DrizzleModule.forRoot({ dialect, ... })` |

Lucid에서 오는 사용자를 위해 `DrizzleRepository` 클래스와
`DrizzleService` facade가 가장 가까운 대응이다. 얻는 것:

- Lucid 모델의 static 메서드처럼 작동하는 static 류 메서드
  (`.findAll`, `.findOne`, `.create`).
- Decorator 기반 entity 메타데이터.
- SQL 인젝션이 구조적으로 방지되는 통합 `raw\`...\`` primitive.

주요 차이점: Lucid는 자체 query builder를 가진 *단일* ORM이지만,
Drizzle는 underlying SQL 위의 얇은 타입 레이어다. Lucid magic의
작은 양을 1급 SQL 투명성과 zero runtime overhead로 바꾼다.

---

## 13. 참고

- [`./cross-cutting-features.md`](./cross-cutting-features.md) — limiter, shield, cache, drive, mail
- [`./production-basics.md`](./production-basics.md) — health, config, logger, static
- [`../design/architecture.md`](../design/architecture.md) — 전체 모듈 설계
- [`../analysis/adonisjs-comparison.md`](../analysis/adonisjs-comparison.md) — drizzle가 Lucid 격차를 해소하는 이유
- [Drizzle ORM 문서](https://orm.drizzle.team/)
- [drizzle-kit CLI](https://orm.drizzle.team/kit-docs/overview)
