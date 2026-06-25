# @nexusts/drizzle — Drizzle ORM integration (default ORM)

> 한국어 버전: [`drizzle.ko.md`](./drizzle.ko.md)

`@nexusts/drizzle` is the **default ORM** for NexusTS. It wraps Drizzle
ORM with a DI-friendly service, a Lucid-style repository pattern, an
entity-model base class, declarative decorators, automatic migrations,
and a SQL-injection-safe raw-query API.

```
@Module({
  imports: [
    DrizzleModule.forRoot({
      dialect: 'bun-sqlite',                 // 'postgres' | 'mysql' | 'sqlite' | 'bun-sqlite' | 'd1'
      connection: { filename: './data.db' },  // dialect-specific
      logging: true,                         // optional query logger
      autoMigrate: true,                     // run migrations on boot
      migrationsFolder: './drizzle',         // folder of generated SQL files
    }),
  ],
})

class UserService {
  @Inject(DrizzleService.TOKEN) declare db: DrizzleService;
  list() { return this.db.select().from(users).all(); }
}
```

---

## 1. Supported dialects

| Dialect | Connection shape | Driver |
| ------- | ----------------- | ------ |
| `postgres` | `{ url }` or `{ host, port, user, password, database, ssl, pool }` | `postgres.js` (default) → `pg` fallback |
| `mysql` | `{ host, port, user, password, database, pool }` | `mysql2` |
| `sqlite` | `{ filename, readonly? }` | `better-sqlite3` |
| `bun-sqlite` | `{ filename }` | `bun:sqlite` (Bun built-in) |
| `d1` | `{ binding: D1Database }` | Cloudflare D1 (Workers) |

All connection driver packages are **optional peer dependencies** —
install only the ones you use. `drizzle-orm` itself is a required peer.

---

## 2. Quick start

### Install

```bash
bun add drizzle-orm
# One of:
bun add pg            # postgres fallback
bun add postgres      # postgres.js (preferred)
bun add mysql2
bun add better-sqlite3
```

> **Bun 사용자 주의**: `bun:sqlite`를 강력히 권장합니다. Bun 1.3+에서
> `better-sqlite3`는 로드 실패합니다. `bun add drizzle-orm`만 설치하고
> `dialect: 'bun-sqlite'`로 설정하세요 (별도 driver 패키지 불필요).
> 자세한 내용은 **[common-pitfalls.md §6](./common-pitfalls.md#6-bunsqlite-vs-better-sqlite3-선택)**.

### Configure

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

### Use

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

## 3. Lucid-style repository

`DrizzleRepository<TTable, TRow>` is the Lucid-equivalent of a
repository. It exposes a small, typed surface on top of Drizzle's
query builder.

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

### Transactions

```ts
await repo.transaction(async (txRepo) => {
  await txRepo.create({ email: 'a@b.com' });
  await txRepo.create({ email: 'c@d.com' });
});
```

Inside a transaction `txRepo` is a fresh repository bound to the
transaction handle. Rolls back automatically if the callback throws.

---

## 4. Entity model + decorators

`DrizzleModel` is the base class. Use `@Table` / `@Column` /
`@PrimaryKey` to declare your entities — the metadata is read by the
repository for default queries and reflection.

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

> The Drizzle **table** is created with `pgTable` / `mysqlTable` /
> `sqliteTable` — the decorators on the model class are metadata for
> tooling, not the runtime schema. This separation lets the entity
> model and the Drizzle table definition evolve independently.

---

## 5. Raw queries — SQL-injection safe

Use `db.raw\`...\`` for ad-hoc SQL. **Every interpolated value is sent
as a bound parameter**, never concatenated. This is the same primitive
Drizzle uses internally; we wrap it with logging and dialect
normalization.

```ts
// Safe — `id` is a parameter, not concatenated into the SQL.
const id = "user-42";
const rows = await db.raw`SELECT * FROM users WHERE id = ${id}`.all<User>();

const first = await db.raw`SELECT * FROM users WHERE email = ${email}`.first<User>();
const result = await db.raw`UPDATE users SET status = ${'banned'} WHERE id = ${id}`.execute();
console.log(result.affectedRows);
```

### Why it's safe

1. The template literal is parsed into chunks + values.
2. The values are sent as bound parameters (`$1, $2, ...` for postgres,
   `?` for sqlite / mysql).
3. The database driver maintains the separation between SQL text and
   parameter values at the protocol level — there's no string
   interpolation that the SQL parser could mistake for code.

```ts
// Even with this malicious input, the database treats it as a literal:
const userInput = "admin' OR 1=1 --";
const rows = await db.rawQuery<{ email: string }>(
  "SELECT * FROM users WHERE email = ?",
  [userInput],
);
// rows.length === 0  ✓
```

### Direct parameterized query (no template)

```ts
const rows = await db.rawQuery<User>(
  "SELECT * FROM users WHERE created_at > ? ORDER BY id LIMIT ?",
  [new Date('2026-01-01'), 100],
);
```

### "Can I get the raw database handle?"

Sometimes you want the raw `bun:sqlite` / `pg` / `mysql2` client — for
admin queries, transactions, or `EXPLAIN` analysis. `DrizzleService.client`
**isn't** the raw handle; it's the Drizzle wrapper. Use these instead:

```ts
// Option 1: Drizzle query builder (recommended)
const users = await db.select().from(usersTable).all();

// Option 2: Drizzle's sql`` template for raw SQL
const rows = await db
  .select()
  .from(sql`users WHERE id = ${id}`)
  .all();

// Option 3: Drizzle's session API for very raw queries
const session = db.client.$client ?? db.client;
const result = await session.execute('SELECT 1');
```

If you absolutely need a low-level connection (rare), use
`DrizzleModule.forRoot({ logging: true })` to log every SQL statement,
or grab the handle via `db.driver.db` (internal — may change).

> For the most common gotcha around `DrizzleService.client` see
> **[common-pitfalls.md §3](./common-pitfalls.md#3-drizzlestoredserviceclient에-raw-쿼리-메서드가-없음)**.

### Inspecting the generated SQL

```ts
const q = db.raw`SELECT * FROM users WHERE id = ${id}`;
console.log(q.toSQL());             // 'SELECT * FROM users WHERE id = ?'
console.log(q.getParameters());     // ['user-42']
```

---

## 6. Migrations

### Auto-run on boot

```ts
DrizzleModule.forRoot({
  dialect: 'postgres',
  connection: { url: process.env.DATABASE_URL! },
  autoMigrate: true,
  migrationsFolder: './drizzle',
});
```

### Programmatic

```ts
const result = await db.migrate('./drizzle');
console.log(`Applied ${result.applied.length} migrations (total: ${result.total}).`);
```

### Generate migrations

Use `drizzle-kit` to generate SQL from your schema:

```bash
bunx drizzle-kit generate
bunx drizzle-kit migrate
```

`drizzle-kit` writes timestamped `.sql` files into your migrations
folder. The Drizzle migrator picks them up on the next boot.

### Inspect applied migrations

```ts
const applied = await db.appliedMigrations();
for (const m of applied) {
  console.log(`#${m.id} ${m.hash} applied at ${m.appliedAt}`);
}
```

---

## 7. Transactions

```ts
await db.transaction(async (tx) => {
  await tx.raw`UPDATE accounts SET balance = balance - ${100} WHERE id = ${from}`.execute();
  await tx.raw`UPDATE accounts SET balance = balance + ${100} WHERE id = ${to}`.execute();
});
```

The transaction commits on success. If the callback throws, the
underlying database rolls back. For SQLite (synchronous), the rollback
is best-effort across async boundaries.

---

## 8. Multi-dialect placeholder translation

`db.raw` always emits `?` placeholders. The driver translates them to
the dialect's native form before sending:

| Dialect | Native placeholder |
| ------- | ------------------ |
| `postgres` / `bun-sqlite` w/ postgres.js | `$1, $2, ...` |
| `mysql` / `sqlite` / `bun-sqlite` / `d1` | `?, ?, ...` |

You can write portable code without thinking about it.

---

## 9. Integration with other nexus/* modules

`@nexusts/drizzle` is the data backbone for the rest of the framework.
Three modules ship a Drizzle backend out of the box.

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

-- schema (managed by your migration)
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

The `DrizzleSessionStorage` backend reads / writes session records
through the Drizzle service. The schema column names are configurable
via `database.tableName` + the `columns` map.

### `@nexusts/health` — DrizzleHealthIndicator

```ts
import { DrizzleHealthIndicator } from '@nexusts/health';

const db = ...; // DrizzleService
new DrizzleHealthIndicator('database', db, { timeoutMs: 3000 });
```

Runs `SELECT 1` (or a custom probe) against the database, returns
`'up'` / `'down'` with `latencyMs` in the data field.

### `@nexusts/cache` — DrizzleCacheStore

```ts
import { DrizzleCacheStore } from '@nexusts/cache';

CacheModule.forRoot({
  store: new DrizzleCacheStore(drizzleService, {
    tableName: 'nexus_cache',
    tagsTableName: 'nexus_cache_tags',
  }),
  defaultTtl: 300,
});

-- schema (managed by your migration)
CREATE TABLE nexus_cache (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,            -- JSON-encoded
  expires_at TEXT,                     -- ISO timestamp, null = never
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE nexus_cache_tags (
  tag        TEXT NOT NULL,
  key        TEXT NOT NULL,
  PRIMARY KEY (tag, key)
);
```

The `DrizzleCacheStore` is the first backend that supports
**real tag-based invalidation**: `cache.invalidateByTag('users')`
removes every entry tagged 'users' in a single statement, regardless
of how many keys share the tag. MemoryStore also supports tags
(via an in-memory index), but the Drizzle version is durable and
shared across pods.

The store also implements `gc()` for sweeping expired entries.

### `@nexusts/limiter` — DrizzleRateLimitStorage

```ts
import { DrizzleRateLimitStorage } from '@nexusts/limiter';

LimiterModule.forRoot({
  storage: new DrizzleRateLimitStorage(drizzleService),
  rules: [{ path: '/api/*', points: 100, duration: '1m' }],
});

-- schema (managed by your migration)
CREATE TABLE nexus_rate_limits (
  key TEXT PRIMARY KEY,
  strategy TEXT NOT NULL,
  max_points INTEGER NOT NULL,
  points INTEGER NOT NULL DEFAULT 0,
  reset_at TEXT,
  log TEXT
);
```

Use this when you need rate-limit state to be shared across multiple
Bun processes / pods. The storage is atomic per-row (single UPDATE
statement per consume).

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
  schema?: string;            // postgres: schema name
  migrationsFolder?: string;
  autoMigrate?: boolean;
}
```

```ts
class DrizzleService {
  static readonly TOKEN: symbol;

  open(): Promise<void>;        // lazy-open the connection
  close(): Promise<void>;

  // Type-safe Drizzle passthroughs
  select(): PgSelectBuilder | ...;
  insert(table): ...;
  update(table): ...;
  delete(table): ...;

  // SQL-injection-safe raw queries
  raw: (strings, ...values) => RawQuery;
  rawQuery<T>(sql, params?): Promise<T[]>;

  // Transactions
  transaction<T>(fn: (tx: DrizzleService) => Promise<T>): Promise<T>;

  // Migrations
  migrate(folder: string): Promise<MigrateResult>;
  appliedMigrations(): Promise<MigrationRecord[]>;
}
```

---

## 11. Re-exported drizzle-orm operators

`@nexusts/drizzle` re-exports the most commonly used drizzle-orm operators
so you can use them without an extra import:

```ts
import { eq, and, sql, like, inArray, isNull, asc, desc, count, relations } from '@nexusts/drizzle';

// Instead of:
// import { eq, and, sql, like, inArray, isNull, asc, desc, count, relations } from 'drizzle-orm';
```

Full list of re-exports:

| Category | Operators |
|----------|-----------|
| Comparison | `eq`, `ne`, `gt`, `gte`, `lt`, `lte`, `between`, `notBetween` |
| Logical | `and`, `or`, `not` |
| Pattern | `like`, `ilike`, `notLike`, `notIlike` |
| Array | `inArray`, `notInArray` |
| Null | `isNull`, `isNotNull` |
| Ordering | `asc`, `desc` |
| Aggregates | `count`, `sum`, `avg`, `min`, `max` |
| Other | `sql`, `relations` |

---

## 12. @Entity decorator

The `@Entity()` decorator auto-injects the table schema into a
`DrizzleRepository` subclass, so the constructor only needs
`DrizzleService` — no need to pass the table explicitly.

```ts
import { Entity, DrizzleRepository, DrizzleService } from '@nexusts/drizzle';
import { users } from '../schema/users.js';

@Entity(users)
class UserRepository extends DrizzleRepository<typeof users> {
  // Only DrizzleService is needed in the constructor
  constructor(db: DrizzleService) {
    super(db, users);  // table is auto-injected
  }
}
```

Then use it like any other DI provider:

```ts
@Injectable()
class UserService {
  @Inject(UserRepository) declare users: UserRepository;

  async findAll() {
    return this.users.findAll();
  }
}
```

---

## 13. Validation schemas (Zod from Drizzle tables)

`@nexusts/drizzle/validation` generates Zod schemas directly from your
Drizzle table definitions, so your `@Validate()` decorators stay in sync
with your database schema automatically.

```ts
import { z } from 'zod';
import { createInsertSchema, createSelectSchema } from '@nexusts/drizzle/validation';
import { users } from '../schema/users.js';

const insertUserSchema = createInsertSchema(users);
type InsertUser = z.infer<typeof insertUserSchema>;

// Standard decorator mode (v0.9+):
@Post('/users')
async create(ctx: Context) {
  const body = insertUserSchema.parse(await ctx.req.json()) as InsertUser;
  return this.users.create(body);
}

// Legacy mode (experimentalDecorators: true):
// @Post('/users')
// @Validate({ body: insertUserSchema })
// async create(@Body() body: InsertUser) {
//   return this.users.create(body);
// }
```

Available helpers:

| Helper | Purpose |
|--------|---------|
| `createSelectSchema(table)` | Full schema — all columns, required where `notNull` |
| `createInsertSchema(table)` | Omits auto-generated columns (serial, timestamps with defaults) |
| `createUpdateSchema(table)` | All fields optional — for PATCH endpoints |

---

## 14. Migration helpers

`generateMigrations()` and `pushSchema()` wrap `drizzle-kit`
programmatically — no CLI needed:

```ts
import { generateMigrations, pushSchema } from '@nexusts/drizzle';

// Generate migration files from schema
await generateMigrations({
  schema: './src/schema',
  out: './drizzle',
  dialect: 'postgresql',
});

// Push schema directly (development only — not for production)
await pushSchema({
  schema: './src/schema',
  dialect: 'sqlite',
  url: './data.db',
});
```

> These helpers create a temporary `drizzle.config.generated.ts`, run
> `drizzle-kit generate` or `drizzle-kit push`, then clean up. They
> require `drizzle-kit` to be installed (`bun add -d drizzle-kit`).

---

## 15. Seeding Factory

`Factory<TData>` generates test data for Drizzle tables. It works
with or without `@faker-js/faker`.

### Install

```bash
bun add -d @faker-js/faker   # optional — Factory works without it
```

### Define a factory

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

### Methods

| Method | Description |
| ------ | ----------- |
| `make(overrides?)` | Generate a plain object (no DB insert) |
| `makeMany(n, overrides?)` | Generate an array of plain objects |
| `create(db, overrides?)` | Insert a single row and return the data |
| `createMany(db, n, overrides?)` | Insert multiple rows in one statement |

`overrides` partially override the factory defaults.

### Usage in seed files

```ts
// database/seeds/01_users.ts
import type { SeedContext } from '@nexusts/cli';
import { UserFactory } from '../factories/user.factory.js';

export default async function seed(ctx: SeedContext) {
  await UserFactory.createMany(ctx.db, 10);
  await UserFactory.create(ctx.db, { email: 'admin@example.com' });
}
```

```bash
nx db:seed --create users
nx db:seed
```

### Usage in tests (without faker)

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

## 17. Closing gap with AdonisJS Lucid

| AdonisJS Lucid | NexusTS drizzle equivalent |
| -------------- | --------------------------- |
| `Model` base class | `DrizzleModel` |
| `@column`, `@column.dateTime`, etc. | `@Column`, `@PrimaryKey` |
| `Database.from(table)` | `db.select().from(table)` |
| `await User.find(id)` | `repo.findById(id)` |
| `user.save()` | `repo.create(values)` / `repo.updateById(id, patch)` |
| `await User.all()` | `repo.findAll()` |
| `await User.query().where('email', email).first()` | `repo.findOne({ email })` |
| `Database.transaction(async (trx) => {...})` | `db.transaction(async (tx) => {...})` |
| Migration runner | `db.migrate(folder)` |
| Lucid relations | Drizzle relations API (via `drizzle-orm`) |
| `Database.rawQuery(sql, bindings)` | `db.rawQuery(sql, params)` / `db.raw\`...\`` |
| Schema-based validation | `createInsertSchema(table)` — Zod from Drizzle tables |
| Programmatic migrations | `generateMigrations()` — wraps drizzle-kit |
| Repository auto-wiring | `@Entity(table)` decorator |
| Re-exported operators | `eq`, `and`, `like`, `sql`, … from `@nexusts/drizzle` |
| Multiple connection dialects | `DrizzleModule.forRoot({ dialect, ... })` |

For users coming from Lucid, the `DrizzleRepository` class plus the
`DrizzleService` facade are the closest analog. You get:

- Static-ish methods (`.findAll`, `.findOne`, `.create`) — just like
  Lucid's static methods on models.
- Decorator-driven entity metadata.
- A unified `raw\`...\`` primitive that is SQL-injection-safe by
  construction.

The main difference: Lucid is a *single* ORM with its own query
builder, while Drizzle is a thin typed layer over the underlying SQL.
You trade a small amount of Lucid magic for first-class SQL
transparency and zero runtime overhead.

---

## 18. See also

- [`./cross-cutting-features.md`](./cross-cutting-features.md) — limiter, shield, cache, drive, mail
- [`./production-basics.md`](./production-basics.md) — health, config, logger, static
- [`../design/architecture.md`](../design/architecture.md) — overall module design
- [`../analysis/adonisjs-comparison.md`](../analysis/adonisjs-comparison.md) — why drizzle closes the Lucid gap
- [Drizzle ORM documentation](https://orm.drizzle.team/)
- [drizzle-kit CLI](https://orm.drizzle.team/kit-docs/overview)
