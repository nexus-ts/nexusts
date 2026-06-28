# @nexusts/kysely — Typed SQL Query Builder

`@nexusts/kysely` provides a first-class integration with [Kysely](https://kysely.dev/),
a type-safe SQL query builder for TypeScript. This module gives you:

- **`KyselyService`** — wraps a Kysely instance with lazy initialization, DI support, and lifecycle management
- **`KyselyRepository`** — Lucid-style repository pattern with typed CRUD operations
- **`KyselyModule.forRoot()`** — dynamic module registration with config and migration support
- **Built-in migration support** — via Kysely's `Migrator` class
- **Transaction support** — ACID transactions with a scoped query builder
- **Schema building** — full access to Kysely's schema builder for DDL

---

## Installation

```bash
bun add @nexusts/kysely
bun add kysely      # peer dependency
```

You'll also need a dialect driver, e.g.:

```bash
# SQLite
bun add better-sqlite3

# PostgreSQL
bun add pg

# MySQL
bun add mysql2
```

---

## Quick Start

### 1. Define your database schema type

```ts
interface DB {
  users: {
    id: Generated<number>;
    email: string;
    name: string;
    age: number;
    created_at: Generated<string>;
  };
  posts: {
    id: Generated<number>;
    title: string;
    content: string;
    user_id: number;
  };
}
```

### 2. Register the module

```ts
import { SqliteDialect } from "kysely";
import Database from "better-sqlite3";
import { Module } from "@nexusts/core";
import { KyselyModule } from "@nexusts/kysely";

@Module({
  imports: [
    KyselyModule.forRoot({
      config: {
        dialect: new SqliteDialect({
          database: new Database("app.db"),
        }),
      },
      logging: true,  // log all queries
    }),
  ],
})
class AppModule {}
```

### 3. Inject and use KyselyService

```ts
import { Inject, Injectable } from "@nexusts/core";
import { KyselyService } from "@nexusts/kysely";

@Injectable()
class UserService {
  @Inject(KyselyService.TOKEN) declare db: KyselyService<DB>;

  async findAll() {
    return this.db.selectFrom("users")
      .selectAll()
      .orderBy("created_at", "desc")
      .execute();
  }

  async findById(id: number) {
    return this.db.selectFrom("users")
      .selectAll()
      .where("id", "=", id)
      .executeTakeFirst();
  }

  async create(data: { email: string; name: string; age: number }) {
    return this.db.insertInto("users")
      .values(data)
      .returningAll()
      .executeTakeFirst();
  }
}
```

---

## KyselyService API

### Query Builders

| Method | Description | Returns |
|--------|-------------|---------|
| `selectFrom(table)` | Start a SELECT query | `SelectQueryBuilder` |
| `insertInto(table)` | Start an INSERT query | `InsertQueryBuilder` |
| `updateTable(table)` | Start an UPDATE query | `UpdateQueryBuilder` |
| `deleteFrom(table)` | Start a DELETE query | `DeleteQueryBuilder` |
| `schema` | Access schema builder | `SchemaBuilder` |

### Transactions

```ts
const result = await db.transaction(async (trx) => {
  const user = await trx.insertInto("users")
    .values({ email: "a@b.com", name: "Alice", age: 30 })
    .returningAll()
    .executeTakeFirst();

  await trx.insertInto("posts")
    .values({ title: "Hello", content: "World", user_id: user.id })
    .execute();

  return user;
});
```

### Migrations

```ts
import { FileMigrationProvider, Migrator } from "kysely";
import * as fs from "node:fs";
import * as path from "node:path";

@Module({
  imports: [
    KyselyModule.forRoot({
      config: { dialect: new SqliteDialect({ database: new Database("app.db") }) },
      migrations: {
        provider: new FileMigrationProvider({
          fs,
          path,
          migrationFolder: path.join(import.meta.dir, "migrations"),
        }),
        autoMigrate: true,  // run on boot
      },
    }),
  ],
})
class AppModule {}
```

Then create migration files (e.g., `migrations/001_create_users.ts`):

```ts
import type { Kysely } from "kysely";

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createTable("users")
    .addColumn("id", "integer", (col) => col.primaryKey().autoIncrement())
    .addColumn("email", "varchar(255)", (col) => col.notNull().unique())
    .addColumn("name", "varchar(255)", (col) => col.notNull())
    .addColumn("age", "integer", (col) => col.notNull())
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable("users").execute();
}
```

### CLI-based migration workflow

NexusTS provides `nx db:generate` and `nx db:migrate` CLI commands
for Kysely — no external CLI needed, unlike Drizzle's `drizzle-kit`:

```bash
# 1. Generate a migration file (TypeScript with up/down functions)
nx db:generate create_users_table --orm kysely
# → app/database/migrations/20260626_123000_create_users_table.ts

# 2. Review and edit the generated file
#    app/database/migrations/20260626_123000_create_users_table.ts

# 3. Apply pending migrations
nx db:migrate --orm kysely
# → Kysely Migrator loads .ts files, runs up(), tracks in kysely_migration table
```

**How `nx db:migrate --orm kysely` works:**

1. Generates a temporary `.mjs` script that sets up `bun:sqlite` + `SqliteDialect`
2. Uses `FsMigrationProvider` to scan `app/database/migrations/` folder
3. Runs Kysely's built-in `Migrator.migrateToLatest()`
4. Tracks applied migrations in `kysely_migration` table
5. Cleans up the temporary file

**Migration status:**

```bash
nx db:migrate --status --orm kysely
# Migration status:
#   001_create_users: Success
#   002_add_email: Success
```

### Drizzle vs Kysely migration comparison

| Feature | Drizzle | Kysely |
|---------|---------|--------|
| Engine | `drizzle-kit` (external CLI) | Kysely `Migrator` (built-in) |
| File format | SQL (`*.sql`) | TypeScript (`*.ts`) |
| Dev dependency | `drizzle-kit` ^0.31.0 | None |
| Track table | `__nexus_migrations` | `kysely_migration` |
| Generate command | `nx db:generate [name]` | `nx db:generate [name] --orm kysely` |
| Apply command | `nx db:migrate` | `nx db:migrate --orm kysely` |
| Rollback | Manual SQL | `migrator.migrateTo(target)` |
| Auto-run on boot | `autoMigrate: true` | `migrations.autoMigrate: true` |

---

## KyselyRepository — Lucid-style CRUD

The `KyselyRepository` provides familiar CRUD methods inspired by
AdonisJS Lucid and DrizzleRepository:

```ts
import { Inject, Injectable } from "@nexusts/core";
import { KyselyService, KyselyRepository } from "@nexusts/kysely";

@Injectable()
class UserRepository extends KyselyRepository<DB, "users"> {
  @Inject(KyselyService.TOKEN) declare db: KyselyService<DB>;
  protected readonly tableName = "users";
}
```

### Repository Methods

| Method | Description |
|--------|-------------|
| `findAll(opts?)` | All rows with optional `where`, `limit`, `offset`, `orderBy` |
| `findOne(where)` | First matching row |
| `findById(id)` | Find by primary key (assumes `id` column) |
| `create(values)` | Insert and return created row |
| `createMany(values)` | Bulk insert and return created rows |
| `update(where, patch)` | Update matching rows |
| `updateById(id, patch)` | Update by primary key |
| `delete(where)` | Delete matching rows |
| `deleteById(id)` | Delete by primary key |
| `count(where?)` | Count rows (optionally filtered) |
| `transaction(fn)` | Execute operations in a transaction |

### Example

```ts
class UserController {
  @Inject(UserRepository) declare users: UserRepository;

  @Get("/")
  list() {
    return this.users.findAll({
      where: (qb) => qb.where("age", ">=", 18),
      orderBy: (qb) => qb.orderBy("name", "asc"),
      limit: 20,
    });
  }

  @Post("/")
  async create(ctx: Context) {
    const body = await ctx.req.json();
    return this.users.create(body);
  }
}
```

---

## Advanced: Async Configuration

For dialects that require async initialization (e.g., PostgreSQL pools):

```ts
KyselyModule.forRootAsync({
  imports: [ConfigModule],
  inject: [ConfigService],
  useFactory: async (config: ConfigService) => {
    const { Pool } = await import("pg");
    const { PostgresDialect } = await import("kysely");
    return {
      config: {
        dialect: new PostgresDialect({
          pool: new Pool({
            connectionString: config.get("DATABASE_URL"),
          }),
        }),
      },
      logging: config.get("DEBUG") === "true",
    };
  },
});
```

---

## Type Safety

Kysely provides compile-time type safety through its generic `DB`
schema type. The `@nexusts/kysely` integration preserves full type
inference:

```ts
// ✅ Type-safe — IDE knows users has id, email, name, age
const user = await db.selectFrom("users")
  .where("email", "=", "a@b.com")
  .select(["id", "email", "name"])
  .executeTakeFirst();

// ✅ Type-safe insert
await db.insertInto("users")
  .values({ email: "a@b.com", name: "Alice", age: 30 })
  .execute();

// ❌ Type error — "foobar" is not a column of "users"
await db.selectFrom("users")
  .where("foobar", "=", 1)
  .execute();
```

---

## Working with Different Dialects

Kysely supports multiple dialects. Install the corresponding driver
and pass the dialect to `KyselyConfig`:

```ts
// SQLite (better-sqlite3)
import { SqliteDialect } from "kysely";
import Database from "better-sqlite3";
const dialect = new SqliteDialect({ database: new Database("app.db") });

// PostgreSQL
import { PostgresDialect } from "kysely";
import { Pool } from "pg";
const dialect = new PostgresDialect({ pool: new Pool({ connectionString: "postgres://..." }) });

// MySQL
import { MysqlDialect } from "kysely";
import { createPool } from "mysql2";
const dialect = new MysqlDialect({ pool: createPool({ uri: "mysql://..." }) });
```

---

## Comparison: Kysely vs Drizzle

| Feature | `@nexusts/kysely` | `@nexusts/drizzle` |
|---------|-------------------|-------------------|
| Query style | SQL-like chainable builder | ORM-style table objects |
| Type safety | Compile-time via generic `DB` type | Runtime via table definitions |
| Schema definition | TypeScript interface | Drizzle `pgTable` / `sqliteTable` |
| Raw SQL | Via `sql\`\`` template tag | Via `sql\`\`` template tag + typed `RawQuery` |
| Migrations | Kysely `Migrator` (built-in) | Drizzle Kit (external CLI) |
| Repository | `KyselyRepository` (Lucid-style) | `DrizzleRepository` (Lucid-style) |
| Dialects | All Kysely dialects | 5 dialects (sqlite, postgres, mysql, sqlite, d1) |
| Bundle size | Kysely itself + driver | Drizzle ORM + driver |
| Use case | SQL-first, maximum type safety | ORM-first, easy table definitions |

Choose **Kysely** when you want full SQL control with maximum type
safety. Choose **Drizzle** when you prefer ORM-style table definitions
and Drizzle Kit for migrations.

---

## See Also

- [Kysely Documentation](https://kysely.dev/docs)
- [Example: Kysely CRUD](../../examples/36-kysely-crud)
- [Drizzle Integration](../user-guide/drizzle.md)
- [Database Overview](../user-guide/database.md)
