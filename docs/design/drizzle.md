# Drizzle ORM Module — design

> 한국어 버전: [`drizzle.ko.md`](./drizzle.ko.md)

This document explains the architecture of `@nexusts/drizzle`:
the service wrapper, driver abstraction, model/repository pattern,
and decorator-based table definitions.

## Goals

1. **Multi-dialect, one API.** PostgreSQL, MySQL, SQLite, Bun SQLite,
   and Cloudflare D1 — all behind the same `DrizzleService` facade.
2. **Auto-closable.** `DrizzleService` implements application lifecycle
   hooks (`onAppClose`) so the database connection is cleaned up
   without manual teardown.
3. **Model + Repository pattern.** Define tables with decorators
   (`@Table`, `@Column`, `@PrimaryKey`) and access data through
   `DrizzleRepository<T>` — a typed CRUD layer that wraps Drizzle's
   query builder.
4. **Raw query escape hatch.** `rawQuery()` for SQL statements that
   don't fit the query builder (migrations, bulk operations).
5. **Framework DI integration.** `DrizzleModule.forRoot(config)` wires
   the service into the container so any `@Injectable()` service can
   inject it.

## Architecture

```
┌────────────────────────────────────────────────────────┐
│                    User code                            │
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
│  │  db: DrizzleDatabase (the actual drizzle-orm db)  │  │
│  │  open() → initializes driver + drizzle instance   │  │
│  │  close() → tears down connection gracefully       │  │
│  │  rawQuery(sql, params) → typed raw SQL            │  │
│  │                                                     │  │
│  │  Driver: resolved at open() time                   │  │
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
│              DrizzleModel (decorators)                 │
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
│  query(fn: (db) => ...): custom queries                │
└────────────────────────────────────────────────────────┘
```

## Driver resolution

`DrizzleService.open()` resolves the driver based on the `dialect`
config field:

| Dialect | Driver | NPM package | Bun support |
|---------|--------|-------------|-------------|
| `postgres` | `postgres.js` + `drizzle-orm/pg` | `postgres` | ✅ |
| `mysql` | `mysql2` + `drizzle-orm/mysql` | `mysql2` | ⚠️ (needs Node compat) |
| 'sqlite' | `bun:sqlite` + `drizzle-orm/sqlite` | `bun` built-in | ✅ |
| `sqlite` | `better-sqlite3` + `drizzle-orm/better-sqlite` | `better-sqlite3` | ⚠️ |
| `d1` | `@cloudflare/d1` + `drizzle-orm/d1` | `@cloudflare/d1` | ❌ (Workers only) |

Each driver is loaded lazily from its npm package, so unused drivers
add zero bundle cost. The `resolveDriver()` function uses
`new URL('...', import.meta.url)` patterns to ensure cross-runtime
compatibility.

Every driver implements the `RawExecutor` interface:

```ts
interface RawExecutor {
  run(sql: string, params?: unknown[]): Promise<DrizzleDriverResult>;
  all<T>(sql: string, params?: unknown[]): Promise<T[]>;
  close(): Promise<void>;
}
```

This uniform interface means `rawQuery()` works identically across
all five dialects. The `DrizzleDriverResult` is minimal — just
`{ rows: T[], rowCount: number }` — so repository methods stay
driver-agnostic.

## The Model layer (decorators)

Users define table schemas with decorators:

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

The decorators store metadata via `Reflect.defineMetadata`:

| Decorator | Stores |
|-----------|--------|
| `@Table(name)` | `tableName` on the class |
| `@Column(name, opts?)` | Column metadata in an array on the class |
| `@PrimaryKey()` | Marks the field as the primary key |

`readTableMeta(class)` returns:

```ts
interface TableMeta {
  tableName: string;
  columns: ColumnMeta[];
  primaryKey: ColumnMeta | null;
}
```

This metadata is used by `DrizzleRepository` to build queries without
requiring the user to duplicate the schema.

## Repository pattern

`DrizzleRepository<T>` is a generic CRUD class:

```ts
class UserRepository extends DrizzleRepository<UserMeta> {
  constructor(db: DrizzleService) {
    super(db, UserMeta);
  }

  async findByEmail(email: string) {
    return this.query(async (db) => {
      // Use the raw drizzle-orm query builder directly
      return db.select().from(UserMeta).where(eq(UserMeta.email, email));
    });
  }
}
```

Base methods (all return `Promise`):

| Method | SQL |
|--------|-----|
| `findById(id)` | `SELECT * FROM table WHERE pk = ?` |
| `findAll(filter?)` | `SELECT * FROM table WHERE ...` |
| `create(data)` | `INSERT INTO table (...) VALUES (...)` |
| `update(id, data)` | `UPDATE table SET ... WHERE pk = ?` |
| `delete(id)` | `DELETE FROM table WHERE pk = ?` |
| `query(fn)` | Custom — exposes the drizzle-orm `db` object |

The `query()` escape hatch is how users access Drizzle's full query
builder (joins, subqueries, aggregations, etc.) while still receiving
the repository's DI-managed db instance.

## Raw Query

`rawQuery<T>(sql, params?)` is the lowest-level API. It:

1. Normalizes the SQL (strips trailing semicolons, trims whitespace).
2. Passes it to `driver.execute(sql, params)`.
3. Returns typed results as `T[]`.

Used by modules like `nexusts/cache` (DrizzleCacheStore),
`nexusts/limiter` (DrizzleRateLimitStorage), and `nexusts/session`
for their database-backed storage.

## DI integration

```
ApplicationContainer
  └── ConfiguredDrizzleModule
        ├── DrizzleService
        ├── DrizzleService.TOKEN (Symbol alias)
        └── "DRIZZLE_CONFIG" (useValue: config)
```

`DrizzleService` implements `onAppClose` from the framework's
lifecycle hooks. When the application shuts down, the connection
is closed automatically.

Multiple DrizzleService instances (for different databases) are
supported by registering separate instances under different tokens.

## Schema management

The Drizzle module does **not** run migrations automatically. Users
manage their schema via:

- Drizzle Kit (`drizzle-kit push` / `drizzle-kit migrate`) for
  development.
- Custom migration scripts via `rawQuery()` for production.
- The CLI's `nx make:migration` command for generating migration
  files (requires `drizzle-kit` installed).

The module provides migration helpers in `@nexusts/drizzle/migrate`
that wrap `drizzle-orm/migrator` for programmatic migration.

## Future work

- **Migration runner** — a `DrizzleMigrationService` that runs pending
  migrations at boot (opt-in).
- **Soft deletes** — a `@DeletedAt` decorator and auto-filtering in
  the repository.
- **Timestamps** — `@CreatedAt` / `@UpdatedAt` auto-population.
- **Relations** — `@BelongsTo` / `@HasMany` decorators for eager
  loading.
- **Transaction support** — `DrizzleRepository.transaction(fn)` for
  atomic operations across repositories.

## See also

- [`../user-guide/drizzle.md`](../user-guide/drizzle.md) — user guide
- [`../user-guide/database.md`](../user-guide/database.md) — database overview
- [`../design/session.md`](../design/session.md) — session module (uses DrizzleStore)
