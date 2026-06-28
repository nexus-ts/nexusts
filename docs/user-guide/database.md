# Database · Setup & Migrations

> 한국어 버전: [`database.ko.md`](./database.ko.md)

This guide covers database configuration, migrations, seeding, and the
day-to-day workflow for NexusTS projects.

NexusTS ships two first-party database modules:

- **`@nexusts/drizzle`** — Default ORM with 5 dialects, ORM-style table definitions
- **`@nexusts/kysely`** — Type-safe SQL query builder with compile-time type checking

Choose **Drizzle** for ORM-style development with table definitions.
Choose **[Kysely](./kysely.md)** for SQL-first development with maximum type safety.

---

## 1. Quick start

```bash
# 1. Scaffold a new project with Drizzle + SQLite
nx init --orm drizzle --db sqlite

# 2. Edit your schema
#    app/models/user.model.ts

# 3. Generate a migration
nx db:generate create_users

# 4. Apply it
nx db:migrate

# 5. (Optional) Seed data
nx db:seed
```

---

## 2. Three database drivers

NexusTS + Drizzle supports three SQL drivers out of the box. Pick the
one that matches your deployment target.

| Driver | Package | Dev setup | Production | Best for |
|--------|---------|-----------|------------|----------|
| `sqlite` | none (Bun built-in) | Zero config | Single file (`app.db`) | Prototyping, edge, single-server |
| `postgres` | `pg` or `postgres` | Docker / local PG | RDS / Supabase / Neon | Production apps |
| `mysql` | `mysql2` | Docker / local MySQL | PlanetScale / RDS | Production apps |

### SQLite (default, zero config)

```ts
// app/app.module.ts
import { DrizzleModule } from '@nexusts/drizzle';

@Module({
  imports: [
    DrizzleModule.forRoot({
      dialect: 'sqlite',
      connection: { url: 'app.db' },
    }),
  ],
})
export class AppModule {}
```

```env
# .env
DATABASE_URL=app.db
```

No extra packages needed — Bun ships with `bun:sqlite` built in.

### PostgreSQL

```bash
bun add pg
# or: bun add postgres
```

```ts
DrizzleModule.forRoot({
  dialect: 'postgres',
  connection: { url: process.env.DATABASE_URL! },
})
```

```env
# .env (or .env.production)
DATABASE_URL=postgres://user:password@localhost:5432/myapp
```

### MySQL

```bash
bun add mysql2
```

```ts
DrizzleModule.forRoot({
  dialect: 'mysql',
  connection: { url: process.env.DATABASE_URL! },
})
```

```env
# .env (or .env.production)
DATABASE_URL=mysql://user:password@localhost:3306/myapp
```

---

## 3. Environment-aware configuration

The framework auto-loads `.env.{NODE_ENV}` files so you can keep
per-environment settings separate:

```
.env               ← shared defaults (committed)
.env.local          ← local overrides (gitignored)
.env.development    ← dev-specific (committed)
.env.production     ← prod secrets (committed)
```

| File | Purpose | Git? |
|------|---------|------|
| `.env` | `DATABASE_URL=app.db` (SQLite default) | ✅ |
| `.env.local` | Override for your machine only | ❌ |
| `.env.production` | `DATABASE_URL=postgres://prod:5432/db` | ✅ |
| `.env.testing` | `DATABASE_URL=:memory:` | ✅ |

**Resolution order** (higher wins): `process.env` > `.env.{NODE}` > `.env.local` > `.env`

```ts
// ConfigModule validates everything at boot
import { z } from 'zod';
import { ConfigModule } from '@nexusts/config';

ConfigModule.forRoot({
  schema: z.object({
    DATABASE_URL: z.string().min(1),
    PORT: z.coerce.number().default(3000),
  }),
  exitOnError: process.env.NODE_ENV === 'production',
})
```

---

## 4. Schema design

Define your tables in `app/models/` using Drizzle's schema builder.

### Single table

```ts
// app/models/user.model.ts
import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';

export const users = sqliteTable('users', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  email: text('email').notNull().unique(),
  name: text('name').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' })
    .$defaultFn(() => new Date()),
});

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
```

### With relations

```ts
// app/models/post.model.ts
import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
import { users } from './user.model';

export const posts = sqliteTable('posts', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  title: text('title').notNull(),
  slug: text('slug').notNull().unique(),
  content: text('content').notNull(),
  authorId: integer('author_id')
    .references(() => users.id)
    .notNull(),
  published: integer('published', { mode: 'boolean' }).default(false),
  createdAt: integer('created_at', { mode: 'timestamp' })
    .$defaultFn(() => new Date()),
});
```

### PostgreSQL / MySQL schemas

For Postgres or MySQL, use the dialect-specific import:

```ts
import { pgTable, serial, text, timestamp } from 'drizzle-orm/pg-core';
// or
import { mysqlTable, int, varchar, timestamp } from 'drizzle-orm/mysql-core';
```

---

## 5. Migration workflow

### Step 1: Edit your schema

```ts
// app/models/user.model.ts — add a `bio` column
export const users = sqliteTable('users', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  email: text('email').notNull().unique(),
  name: text('name').notNull(),
  bio: text('bio').default(''),    // ← new column
  createdAt: integer('created_at', { mode: 'timestamp' })
    .$defaultFn(() => new Date()),
});
```

### Step 2: Generate the migration

```bash
nx db:generate add_bio_column
```

This runs `drizzle-kit generate` and produces an SQL file under
`app/database/migrations/`:

```
app/database/migrations/
├── 0000_create_users.sql
└── 0001_add_bio_column.sql
```

### Step 3: Review the SQL

```sql
-- app/database/migrations/0001_add_bio_column.sql
ALTER TABLE users ADD COLUMN `bio` text DEFAULT '';
```

Always review generated migrations before applying them in production.

### Step 4: Apply

```bash
nx db:migrate            # apply pending migrations
nx db:migrate --status   # check which migrations are applied
```

---

## 6. CLI reference

| Command | Description |
|---------|-------------|
| `nx db:generate <name>` | Generate a migration from schema changes |
| `nx db:generate <name> --sql` | Create an empty SQL file (no drizzle-kit) |
| `nx db:migrate` | Apply pending migrations |
| `nx db:migrate --status` | List applied / pending migrations |
| `nx db:migrate --generate <name>` | Generate + apply in one step |
| `nx db:seed` | Run all seed files |
| `nx db:seed --create <name>` | Scaffold a new seed file |
| `nx db:seed --reset` | Drop + re-create tables before seeding |
| `nx make:model <Name>` | Scaffold a model file |
| `nx make:migration <name>` | Scaffold an empty migration |

### drizzle.config.ts

The `drizzle.config.ts` file is generated by `nx init` and tells
`drizzle-kit` where to find your schema and where to output
migrations:

```ts
import type { Config } from 'drizzle-kit';

export default {
  schema: './app/models/*.model.ts',
  out: './app/database/migrations',
  dialect: 'sqlite',
  dbCredentials: { url: process.env.DATABASE_URL ?? 'app.db' },
} satisfies Config;
```

If you switch to PostgreSQL or MySQL, update the `dialect` field and
`dbCredentials` accordingly.

---

## 7. Using the DrizzleService

Inject `DrizzleService` into your services for type-safe queries:

```ts
import { Inject, Injectable } from '@nexusts/core';
import { DrizzleService } from '@nexusts/drizzle';
import { eq } from 'drizzle-orm';
import { users } from '../models/user.model.js';

@Injectable()
export class UserService {
  constructor(
    @Inject(DrizzleService.TOKEN) private db: DrizzleService,
  ) {}

  async findAll() {
    return this.db.select().from(users).all();
  }

  async findById(id: number) {
    return this.db.select().from(users)
      .where(eq(users.id, id)).get();
  }

  async create(data: NewUser) {
    return (await this.db.insert(users)
      .values(data).returning())[0];
  }
}
```

### Raw queries (SQL-injection-safe)

```ts
const result = db.raw`SELECT * FROM users WHERE email = ${email}`.all();
```

The `raw\`...\``template uses parameterised placeholders (`?`),
making it **immune to SQL injection** by construction.

---

## 8. Transactions

```ts
await db.transaction(async (tx) => {
  await tx.insert(users).values({ email: 'a@b.com', name: 'A' });
  await tx.insert(posts).values({
    title: 'Post',
    slug: 'post',
    content: '...',
    authorId: 1,
  });
});
```

If any operation fails, the entire transaction is rolled back.

---

## 9. Important notes

- **Always back up your database** before running migrations in production.
- **Test migrations** in a staging environment first.
- **Review generated SQL** — Drizzle-Kit is good, but human review
  catches edge cases (e.g. data migration, default values).
- **`.env.local`** is gitignored — use it for local database paths
  that differ from the team default.
- **The `DATABASE_URL` env var** is read by both DrizzleService and
  drizzle-kit, so one setting covers both the app and the CLI.
