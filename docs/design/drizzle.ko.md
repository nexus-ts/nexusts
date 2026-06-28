# Drizzle ORM 모듈 — 디자인

> English version: [`drizzle.md`](./drizzle.md)

이 문서는 `@nexusts/drizzle`의 아키텍처를 설명한다: 서비스
래퍼, driver 추상화, model/repository 패턴, 데코레이터 기반 테이블 정의.

## 목표

1. **다중 dialect, 단일 API.** PostgreSQL, MySQL, SQLite, Bun SQLite,
   Cloudflare D1 — 모두 같은 `DrizzleService` 파사드 뒤.
2. **자동 close.** `DrizzleService`가 애플리케이션 lifecycle 훅
   (`onAppClose`)을 구현하여 수동 teardown 없이 DB 연결 정리.
3. **Model + Repository 패턴.** 데코레이터 (`@Table`, `@Column`,
   `@PrimaryKey`)로 테이블 정의, `DrizzleRepository<T>`를 통해 데이터
   접근 — Drizzle의 query builder를 감싸는 타입드 CRUD 레이어.
4. **Raw query escape hatch.** query builder에 맞지 않는 SQL
   (migrations, bulk operations)을 위한 `rawQuery()`.
5. **프레임워크 DI 통합.** `DrizzleModule.forRoot(config)`가 서비스를
   컨테이너에 연결하여 어떤 `@Injectable()` 서비스도 주입 가능.

## 아키텍처

```
┌────────────────────────────────────────────────────────┐
│                    사용자 코드                            │
│                                                        │
│  @Table("users") class UserMeta { ... }                │
│  class UserRepository extends DrizzleRepository<User>  │
│  drizzle.rawQuery("SELECT * FROM users")               │
└────────────────────────────────────────────────────────┘
                        │
                        ▼
┌────────────────────────────────────────────────────────┐
│              DrizzleService                             │
│                                                        │
│  ┌──────────────────────────────────────────────────┐  │
│  │  db: DrizzleDatabase (실제 drizzle-orm db)       │  │
│  │  open() → driver + drizzle 인스턴스 초기화      │  │
│  │  close() → 연결 graceful 정리                    │  │
│  │  rawQuery(sql, params) → 타입드 raw SQL            │  │
│  │                                                     │  │
│  │  Driver: open() 시점에 resolve                    │  │
│  │    postgresDriver → postgres.js + drizzle-orm/pg   │  │
│  │    mysqlDriver    → mysql2 + drizzle-orm/mysql     │  │
│  │    sqliteDriver   → bun:sqlite + drizzle-orm/sqlite│  │
│  │    bunSqliteDriver→ better-sqlite3 + drizzle-orm   │  │
│  │    d1Driver      → @cloudflare/d1 + drizzle-orm    │  │
│  └──────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────┘
                        │
                        ▼
┌────────────────────────────────────────────────────────┐
│              DrizzleModel (데코레이터)                  │
│                                                        │
│  @Table("users")                                       │
│  class UserMeta {                                      │
│    @PrimaryKey() @Column("id") id: number;             │
│    @Column("email") email: string;                     │
│  }                                                     │
│                                                        │
│  readTableMeta(class) → TableMeta                      │
│    { tableName, columns, primaryKey }                  │
└────────────────────────────────────────────────────────┘
                        │
                        ▼
┌────────────────────────────────────────────────────────┐
│           DrizzleRepository<T>                         │
│                                                        │
│  findById(id): T | undefined                           │
│  findAll(filter?): T[]                                  │
│  create(data): T                                       │
│  update(id, data): T                                   │
│  delete(id): boolean                                   │
│  query(fn: (db) => ...): 커스텀 쿼리                   │
└────────────────────────────────────────────────────────┘
```

## Driver 해석

`DrizzleService.open()`이 `dialect` config 필드 기반으로 driver 해석:

| Dialect | Driver | NPM 패키지 | Bun 지원 |
|---------|--------|------------|---------|
| `postgres` | `postgres.js` + `drizzle-orm/pg` | `postgres` | ✅ |
| `mysql` | `mysql2` + `drizzle-orm/mysql` | `mysql2` | ⚠️ (Node compat 필요) |
| 'sqlite' | `bun:sqlite` + `drizzle-orm/sqlite` | `bun` 내장 | ✅ |
| `sqlite` | `better-sqlite3` + drizzle-orm` | `better-sqlite3` | ⚠️ |
| `d1` | `@cloudflare/d1` + `drizzle-orm/d1` | `@cloudflare/d1` | ❌ (Workers only) |

각 driver는 npm 패키지에서 lazily 로드되므로 사용하지 않는 driver는
번들 비용 0. `resolveDriver()` 함수가 크로스-런타임 호환성을 위해
`new URL('...', import.meta.url)` 패턴 사용.

모든 driver는 `RawExecutor` 인터페이스 구현:

```ts
interface RawExecutor {
  run(sql: string, params?: unknown[]): Promise<DrizzleDriverResult>;
  all<T>(sql: string, params?: unknown[]): Promise<T[]>;
  close(): Promise<void>;
}
```

이 통일된 인터페이스 덕분에 `rawQuery()`가 5개 dialect 모두에서 동일하게
작동. `DrizzleDriverResult`는 minimal — `{ rows: T[], rowCount: number }`
뿐 — repository 메서드는 driver-agnostic 유지.

## Model 레이어 (데코레이터)

사용자는 데코레이터로 테이블 스키마 정의:

```ts
@Table("users")
class UserMeta {
  @PrimaryKey()
  @Column("id", { type: "serial" })
  id!: number;

  @Column("email", { type: "text", nullable: false })
  email!: string;

  @Column("name", { type: "text", nullable: true })
  name?: string;
}
```

데코레이터는 `Reflect.defineMetadata`로 메타데이터 저장:

| 데코레이터 | 저장 |
|-----------|------|
| `@Table(name)` | 클래스의 `tableName` |
| `@Column(name, opts?)` | 클래스 배열의 Column 메타데이터 |
| `@PrimaryKey()` | 필드를 primary key로 표시 |

`readTableMeta(class)` 반환:

```ts
interface TableMeta {
  tableName: string;
  columns: ColumnMeta[];
  primaryKey: ColumnMeta | null;
}
```

이 메타데이터는 `DrizzleRepository`가 스키마 중복 없이 쿼리 빌드에 사용.

## Repository 패턴

`DrizzleRepository<T>`는 generic CRUD 클래스:

```ts
class UserRepository extends DrizzleRepository<UserMeta> {
  constructor(db: DrizzleService) {
    super(db, UserMeta);
  }

  async findByEmail(email: string) {
    return this.query(async (db) => {
      // raw drizzle-orm query builder 직접 사용
      return db.select().from(UserMeta).where(eq(UserMeta.email, email));
    });
  }
}
```

기본 메서드 (모두 `Promise` 반환):

| 메서드 | SQL |
|--------|-----|
| `findById(id)` | `SELECT * FROM table WHERE pk = ?` |
| `findAll(filter?)` | `SELECT * FROM table WHERE ...` |
| `create(data)` | `INSERT INTO table (...) VALUES (...)` |
| `update(id, data)` | `UPDATE table SET ... WHERE pk = ?` |
| `delete(id)` | `DELETE FROM table WHERE pk = ?` |
| `query(fn)` | 커스텀 — drizzle-orm `db` 객체 노출 |

`query()` escape hatch는 repository의 DI 관리 db 인스턴스를 유지하면서
Drizzle의 전체 query builder (joins, subqueries, aggregations 등)에
접근하는 방법.

## Raw Query

`rawQuery<T>(sql, params?)`는 최하위 API. 이는:

1. SQL 정규화 (trailing semicolon 제거, 공백 trim).
2. `driver.execute(sql, params)`에 전달.
3. 결과를 `T[]`로 반환.

`nexusts/cache` (DrizzleCacheStore), `nexusts/limiter`
(DrizzleRateLimitStorage), `nexusts/session`의 database-backed 저장소가
사용.

## DI 통합

```
ApplicationContainer
  └── ConfiguredDrizzleModule
        ├── DrizzleService
        ├── DrizzleService.TOKEN (Symbol alias)
        └── "DRIZZLE_CONFIG" (useValue: config)
```

`DrizzleService`는 프레임워크 lifecycle 훅의 `onAppClose`를 구현. 애플리케이션
shutdown 시 연결이 자동 close.

서로 다른 데이터베이스용 다중 DrizzleService 인스턴스는 다른 token 아래 등록하여
지원.

## 스키마 관리

Drizzle 모듈은 **migration을 자동 실행하지 않음**. 사용자는 다음으로
스키마 관리:

- 개발: Drizzle Kit (`drizzle-kit push` / `drizzle-kit migrate`).
- 프로덕션: `rawQuery()`를 통한 커스텀 migration 스크립트.
- CLI: `nx make:migration` 명령으로 migration 파일 생성 (`drizzle-kit`
  설치 필요).

모듈은 `@nexusts/drizzle/migrate`에서 프로그래매틱 migration용
`drizzle-orm/migrator` 래퍼를 제공.

## Future work

- **Migration 러너** — 부트 시 대기 중인 migration을 실행하는
  `DrizzleMigrationService` (opt-in).
- **Soft delete** — `@DeletedAt` 데코레이터와 repository의 자동 필터링.
- **타임스탬프** — `@CreatedAt` / `@UpdatedAt` 자동 채움.
- **Relation** — eager 로딩을 위한 `@BelongsTo` / `@HasMany` 데코레이터.
- **Transaction 지원** — repository 간 원자적 연산을 위한
  `DrizzleRepository.transaction(fn)`.

## 참고

- [`../user-guide/drizzle.ko.md`](../user-guide/drizzle.ko.md) — 사용자 가이드
- [`../user-guide/database.ko.md`](../user-guide/database.ko.md) — 데이터베이스 개요
- [`../design/session.ko.md`](../design/session.ko.md) — session 모듈
  (DrizzleStore 사용)
