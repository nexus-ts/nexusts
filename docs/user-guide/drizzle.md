# nexus/drizzle — Drizzle ORM integration (default ORM)

> 한국어 버전: [`drizzle.ko.md`](./drizzle.ko.md)

`nexus/drizzle` is the **default ORM** for NexusJS. It wraps Drizzle
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
  constructor(@Inject(DrizzleService.TOKEN) private db: DrizzleService) {}
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

### Configure

```ts
// src/db/schema.ts
import { pgTable, serial, text, timestamp } from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  email: text('email').notNull().unique(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});
```

```ts
// src/app/app.module.ts
import { Module } from 'nexus';
import { DrizzleModule } from 'nexus/drizzle';
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
import { Inject } from 'nexus';
import { DrizzleService } from 'nexus/drizzle';
import { eq } from 'drizzle-orm';
import { users } from './db/schema';

@Injectable()
class UserService {
  constructor(@Inject(DrizzleService.TOKEN) private db: DrizzleService) {}

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
import { DrizzleRepository, DrizzleService } from 'nexus/drizzle';

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
import { DrizzleModel, Table, Column, PrimaryKey } from 'nexus/drizzle';

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

`nexus/drizzle` is the data backbone for the rest of the framework.
Three modules ship a Drizzle backend out of the box.

### `nexus/session` — DrizzleSessionStorage

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

### `nexus/health` — DrizzleHealthIndicator

```ts
import { DrizzleHealthIndicator } from 'nexus/health';

const db = ...; // DrizzleService
new DrizzleHealthIndicator('database', db, { timeoutMs: 3000 });
```

Runs `SELECT 1` (or a custom probe) against the database, returns
`'up'` / `'down'` with `latencyMs` in the data field.

### `nexus/limiter` — DrizzleRateLimitStorage

```ts
import { DrizzleRateLimitStorage } from 'nexus/limiter';

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

## 11. Closing gap with AdonisJS Lucid

| AdonisJS Lucid | NexusJS drizzle equivalent |
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

## 12. See also

- [`./cross-cutting-features.md`](./cross-cutting-features.md) — limiter, shield, cache, drive, mail
- [`./production-basics.md`](./production-basics.md) — health, config, logger, static
- [`../design/architecture.md`](../design/architecture.md) — overall module design
- [`../analysis/adonisjs-comparison.md`](../analysis/adonisjs-comparison.md) — why drizzle closes the Lucid gap
- [Drizzle ORM documentation](https://orm.drizzle.team/)
- [drizzle-kit CLI](https://orm.drizzle.team/kit-docs/overview)
