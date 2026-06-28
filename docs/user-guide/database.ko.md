# 데이터베이스 · 설정 및 마이그레이션

> English version: [`database.md`](./database.md)

이 가이드는기본 ORM(Drizzle)을 사용하는 NexusTS 프로젝트의 데이터베이스
설정, 마이그레이션, 시딩, 그리고 일상적인 워크플로우를 다룹니다.

---

## 1. 빠른 시작

```bash
# 1. Drizzle + SQLite로 새 프로젝트 스캐폴딩
nx init --orm drizzle --db sqlite

# 2. 스키마 수정
#    app/models/user.model.ts

# 3. 마이그레이션 생성
nx db:generate create_users

# 4. 적용
nx db:migrate

# 5. (선택) 시드 데이터
nx db:seed
```

---

## 2. 세 가지 데이터베이스 드라이버

NexusTS + Drizzle은 세 가지 SQL 드라이버를 기본 지원합니다.

| 드라이버 | 패키지 | 개발 환경 | 프로덕션 | 적합한 용도 |
|----------|--------|-----------|----------|-------------|
| `sqlite` | 없음 (Bun 내장) | 설정 불필요 | 단일 파일 (`app.db`) | 프로토타입, 엣지, 단일 서버 |
| `postgres` | `pg` 또는 `postgres` | Docker / 로컬 PG | RDS / Supabase / Neon | 프로덕션 앱 |
| `mysql` | `mysql2` | Docker / 로컬 MySQL | PlanetScale / RDS | 프로덕션 앱 |

### SQLite (기본, 설정 불필요)

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

추가 패키지가 필요 없습니다 — Bun에 `bun:sqlite`가 내장되어 있습니다.

### PostgreSQL

```bash
bun add pg
# 또는: bun add postgres
```

```ts
DrizzleModule.forRoot({
  dialect: 'postgres',
  connection: { url: process.env.DATABASE_URL! },
})
```

```env
# .env (또는 .env.production)
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
# .env (또는 .env.production)
DATABASE_URL=mysql://user:password@localhost:3306/myapp
```

---

## 3. 환경별 설정

프레임워크가 `.env.{NODE_ENV}` 파일을 자동 로드하여 환경별 설정을
분리할 수 있습니다:

```
.env               ← 공통 기본값 (git 커밋)
.env.local          ← 로컬 오버라이드 (gitignore)
.env.development    ← 개발 전용 (git 커밋)
.env.production     ← 프로덕션 시크릿 (git 커밋)
```

| 파일 | 용도 | Git? |
|------|------|------|
| `.env` | `DATABASE_URL=app.db` (SQLite 기본) | ✅ |
| `.env.local` | 내 컴퓨터만 오버라이드 | ❌ |
| `.env.production` | `DATABASE_URL=postgres://prod:5432/db` | ✅ |
| `.env.testing` | `DATABASE_URL=:memory:` | ✅ |

**해석 순서** (높을수록 우선): `process.env` > `.env.{NODE}` > `.env.local` > `.env`

```ts
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

## 4. 스키마 설계

`app/models/` 디렉토리에 Drizzle 스키마 빌더로 테이블을 정의합니다.

### 단일 테이블

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

### 관계형

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

### PostgreSQL / MySQL 스키마

Postgres나 MySQL은 dialect별 import를 사용합니다:

```ts
import { pgTable, serial, text, timestamp } from 'drizzle-orm/pg-core';
// 또는
import { mysqlTable, int, varchar, timestamp } from 'drizzle-orm/mysql-core';
```

---

## 5. 마이그레이션 워크플로우

### 1단계: 스키마 수정

```ts
// app/models/user.model.ts — `bio` 컬럼 추가
export const users = sqliteTable('users', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  email: text('email').notNull().unique(),
  name: text('name').notNull(),
  bio: text('bio').default(''),    // ← 새 컬럼
  createdAt: integer('created_at', { mode: 'timestamp' })
    .$defaultFn(() => new Date()),
});
```

### 2단계: 마이그레이션 생성

```bash
nx db:generate add_bio_column
```

`drizzle-kit generate`가 실행되어 `app/database/migrations/` 아래에
SQL 파일이 생성됩니다:

```
app/database/migrations/
├── 0000_create_users.sql
└── 0001_add_bio_column.sql
```

### 3단계: SQL 검토

```sql
-- app/database/migrations/0001_add_bio_column.sql
ALTER TABLE users ADD COLUMN `bio` text DEFAULT '';
```

프로덕션에 적용하기 전에 항상 생성된 마이그레이션을 검토하세요.

### 4단계: 적용

```bash
nx db:migrate            # 대기 중인 마이그레이션 적용
nx db:migrate --status   # 적용된 마이그레이션 확인
```

---

## 6. CLI 명령어 참조

| 명령어 | 설명 |
|---------|------|
| `nx db:generate <name>` | 스키마 변경사항으로 마이그레이션 생성 |
| `nx db:generate <name> --sql` | 빈 SQL 파일 생성 (drizzle-kit 없이) |
| `nx db:migrate` | 대기 중인 마이그레이션 적용 |
| `nx db:migrate --status` | 적용/대기 중인 마이그레이션 확인 |
| `nx db:migrate --generate <name>` | 생성 + 적용을 한 번에 |
| `nx db:seed` | 모든 시드 파일 실행 |
| `nx db:seed --create <name>` | 새 시드 파일 스캐폴딩 |
| `nx db:seed --reset` | 테이블 드롭 후 재생성 + 시딩 |
| `nx make:model <Name>` | 모델 파일 스캐폴딩 |
| `nx make:migration <name>` | 빈 마이그레이션 스캐폴딩 |

### drizzle.config.ts

`nx init`이 생성하는 `drizzle.config.ts` 파일입니다:

```ts
import type { Config } from 'drizzle-kit';

export default {
  schema: './app/models/*.model.ts',
  out: './app/database/migrations',
  dialect: 'sqlite',
  dbCredentials: { url: process.env.DATABASE_URL ?? 'app.db' },
} satisfies Config;
```

PostgreSQL이나 MySQL로 전환할 때는 `dialect` 필드와 `dbCredentials`를
함께 수정하세요.

---

## 7. DrizzleService 사용하기

서비스에서 `DrizzleService`를 주입받아 타입 안전 쿼리를 실행합니다:

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

### Raw 쿼리 (SQL 인젝션 방지)

```ts
const result = db.raw`SELECT * FROM users WHERE email = ${email}`.all();
```

`raw\`...\`` 템플릿은 `?` 플레이스홀더를 사용하므로 **SQL 인젝션에
안전**합니다.

---

## 8. 트랜잭션

```ts
await db.transaction(async (tx) => {
  await tx.insert(users).values({ email: 'a@b.com', name: 'A' });
  await tx.insert(posts).values({
    title: 'Post', slug: 'post', content: '...', authorId: 1,
  });
});
```

어떤 작업이라도 실패하면 전체 트랜잭션이 롤백됩니다.

---

## 9. 중요 참고사항

- **프로덕션에서 마이그레이션 실행 전** 항상 데이터베이스를 백업하세요.
- **스테이징 환경에서 먼저 테스트**하세요.
- **생성된 SQL을 검토**하세요 — Drizzle-Kit이 좋지만, 사람의 검토가
  엣지 케이스(데이터 마이그레이션, 기본값 처리)를 잡아냅니다.
- **`.env.local`** 은 gitignore됩니다 — 팀 기본값과 다른 로컬 DB 경로에
  사용하세요.
- **`DATABASE_URL` env var**는 DrizzleService와 drizzle-kit 모두가
  읽으므로, 하나의 설정으로 앱과 CLI를 모두 커버합니다.
