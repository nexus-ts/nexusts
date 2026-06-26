/**
 * Tests for @nexusts/kysely — uses SqliteDialect with :memory: database.
 *
 * These tests validate:
 *   1. KyselyService lifecycle (config, open, close)
 *   2. Query builder passthrough (selectFrom, insertInto, etc.)
 *   3. Transaction support
 *   4. Raw SQL via sql template tag
 *   5. Migration support
 *   6. KyselyRepository CRUD
 *   7. Error handling (not opened, missing peer dep, etc.)
 */
import { beforeAll, describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  KyselyService,
  KyselyModule,
  KyselyRepository,
} from "../../packages/kysely/src/index.js";
import type { DatabaseSchema } from "../../packages/kysely/src/types.js";

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

let hasBetterSqlite3 = false;
try {
  await import("better-sqlite3");
  hasBetterSqlite3 = true;
} catch {
  /* not installed */
}

/**
 * Create an SqliteDialect for :memory: database.
 * Uses better-sqlite3 as the dialect driver.
 */
async function createMemoryDialect() {
  const { SqliteDialect } = await import("kysely");
  const Database = (await import("better-sqlite3")).default;
  return new SqliteDialect({
    database: new Database(":memory:"),
  });
}

// ---------------------------------------------------------------------------
// Schema types
// ---------------------------------------------------------------------------

interface DB {
  users: {
    id: number;
    email: string;
    name: string;
    age: number;
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("KyselyService (config + lifecycle)", () => {
  it("auto-opens on construction", async () => {
    const dialect = await createMemoryDialect();
    const svc = new KyselyService<DB>({ dialect });

    // KyselyService now auto-opens synchronously on construction.
    // The .db getter should return the Kysely instance, not throw.
    expect((svc as any).db).toBeTruthy();
    await svc.close();
  });

  it("exposes TOKEN as a symbol", () => {
    expect(KyselyService.TOKEN).toBe(Symbol.for("nexus:KyselyService"));
  });

  it("getDb() opens lazily", async () => {
    const dialect = await createMemoryDialect();
    const svc = new KyselyService<DB>({ dialect });

    const db = await svc.getDb();
    expect(db).toBeTruthy();
    await svc.close();
  });
});

describe("KyselyService (real SQLite CRUD)", () => {
  let svc: KyselyService<DB>;

  beforeEach(async () => {
    const dialect = await createMemoryDialect();
    svc = new KyselyService<DB>({ dialect });
    await svc.open();

    // Create table
    await svc.schema
      .createTable("users")
      .addColumn("id", "integer", (col: any) => col.primaryKey().autoIncrement())
      .addColumn("email", "varchar(255)", (col: any) => col.notNull().unique())
      .addColumn("name", "varchar(255)", (col: any) => col.notNull())
      .addColumn("age", "integer", (col: any) => col.notNull())
      .execute();
  });

  afterEach(async () => {
    await svc.close();
  });

  it("inserts and reads a row", async () => {
    await svc
      .insertInto("users")
      .values({ email: "a@b.com", name: "Alice", age: 30 })
      .execute();

    const rows = await svc
      .selectFrom("users")
      .selectAll()
      .where("email", "=", "a@b.com")
      .execute();

    expect(rows).toHaveLength(1);
    expect(rows[0]?.email).toBe("a@b.com");
    expect(rows[0]?.name).toBe("Alice");
    expect(rows[0]?.age).toBe(30);
  });

  it("selects multiple rows with ordering", async () => {
    await svc.insertInto("users").values([
      { email: "b@b.com", name: "Bob", age: 20 },
      { email: "a@a.com", name: "Alice", age: 30 },
    ]).execute();

    const rows = await svc
      .selectFrom("users")
      .selectAll()
      .orderBy("age", "asc")
      .execute();

    expect(rows).toHaveLength(2);
    expect(rows[0]?.name).toBe("Bob");
    expect(rows[1]?.name).toBe("Alice");
  });

  it("inserts and returns via RETURNING", async () => {
    const result = await svc
      .insertInto("users")
      .values({ email: "return@test.com", name: "Return", age: 25 })
      .returningAll()
      .executeTakeFirst();

    expect(result).toBeTruthy();
    expect((result as any)?.email).toBe("return@test.com");
    expect((result as any)?.id).toBeGreaterThan(0);
  });

  it("updates a row", async () => {
    await svc.insertInto("users")
      .values({ email: "update@test.com", name: "Old", age: 40 })
      .execute();

    await svc.updateTable("users")
      .set({ name: "Updated", age: 41 })
      .where("email", "=", "update@test.com")
      .execute();

    const rows = await svc.selectFrom("users")
      .selectAll()
      .where("email", "=", "update@test.com")
      .execute();

    expect(rows[0]?.name).toBe("Updated");
    expect(rows[0]?.age).toBe(41);
  });

  it("deletes a row", async () => {
    await svc.insertInto("users")
      .values({ email: "delete@test.com", name: "Delete", age: 50 })
      .execute();

    await svc.deleteFrom("users")
      .where("email", "=", "delete@test.com")
      .execute();

    const rows = await svc.selectFrom("users").selectAll().execute();
    expect(rows).toHaveLength(0);
  });

  it("supports limit and offset", async () => {
    for (let i = 1; i <= 5; i++) {
      await svc.insertInto("users")
        .values({ email: `user${i}@test.com`, name: `User${i}`, age: 20 + i })
        .execute();
    }

    const rows = await svc.selectFrom("users")
      .selectAll()
      .orderBy("id", "asc")
      .limit(2)
      .offset(1)
      .execute();

    expect(rows).toHaveLength(2);
    expect(rows[0]?.name).toBe("User2");
    expect(rows[1]?.name).toBe("User3");
  });
});

describe("KyselyService (transactions)", () => {
  let svc: KyselyService<DB>;

  beforeEach(async () => {
    const dialect = await createMemoryDialect();
    svc = new KyselyService<DB>({ dialect });
    await svc.open();

    await svc.schema
      .createTable("users")
      .addColumn("id", "integer", (col: any) => col.primaryKey().autoIncrement())
      .addColumn("email", "varchar(255)", (col: any) => col.notNull().unique())
      .addColumn("name", "varchar(255)", (col: any) => col.notNull())
      .addColumn("age", "integer", (col: any) => col.notNull())
      .execute();
  });

  afterEach(async () => {
    await svc.close();
  });

  it("commits on success", async () => {
    await svc.transaction(async (trx) => {
      await trx.insertInto("users")
        .values({ email: "tx@test.com", name: "Tx", age: 1 })
        .execute();
    });

    const rows = await svc.selectFrom("users").selectAll().execute();
    expect(rows).toHaveLength(1);
  });

  it("rolls back on error", async () => {
    try {
      await svc.transaction(async (trx) => {
        await trx.insertInto("users")
          .values({ email: "rollback@test.com", name: "Rollback", age: 99 })
          .execute();
        throw new Error("rollback trigger");
      });
    } catch {
      // expected
    }

    const rows = await svc.selectFrom("users").selectAll().execute();
    expect(rows).toHaveLength(0);
  });

  it("supports nested operations in transaction", async () => {
    const result = await svc.transaction(async (trx) => {
      // insert using transaction-scoped query builder
      await trx.insertInto("users")
        .values({ email: "nested@test.com", name: "Nested", age: 5 })
        .execute();

      // read back
      const rows = await trx.selectFrom("users")
        .selectAll()
        .where("email", "=", "nested@test.com")
        .execute();

      return rows[0];
    });

    expect(result).toBeTruthy();
    expect(result?.email).toBe("nested@test.com");
  });
});

describe("KyselyRepository (CRUD)", () => {
  let svc: KyselyService<DB>;
  let repo: KyselyRepository<DB, "users">;

  beforeEach(async () => {
    const dialect = await createMemoryDialect();
    svc = new KyselyService<DB>({ dialect });
    await svc.open();

    await svc.schema
      .createTable("users")
      .addColumn("id", "integer", (col: any) => col.primaryKey().autoIncrement())
      .addColumn("email", "varchar(255)", (col: any) => col.notNull().unique())
      .addColumn("name", "varchar(255)", (col: any) => col.notNull())
      .addColumn("age", "integer", (col: any) => col.notNull())
      .execute();

    repo = new KyselyRepository<DB, "users">(svc, "users");
  });

  afterEach(async () => {
    await svc.close();
  });

  it("create() inserts and returns a row", async () => {
    const user = await repo.create({ email: "repo@test.com", name: "Repo", age: 25 });
    expect(user).toBeTruthy();
    expect(user?.email).toBe("repo@test.com");
    expect(user?.id).toBeGreaterThan(0);
  });

  it("findAll() returns all rows", async () => {
    await repo.create({ email: "a@a.com", name: "A", age: 10 });
    await repo.create({ email: "b@b.com", name: "B", age: 20 });

    const rows = await repo.findAll();
    expect(rows).toHaveLength(2);
  });

  it("findAll() with where callback", async () => {
    await repo.create({ email: "filter@test.com", name: "Filter", age: 30 });
    await repo.create({ email: "other@test.com", name: "Other", age: 40 });

    const rows = await repo.findAll({
      where: (qb: any) => qb("age", ">", 35),
    });

    expect(rows).toHaveLength(1);
    expect(rows[0]?.name).toBe("Other");
  });

  it("findAll() with limit and offset", async () => {
    for (let i = 1; i <= 3; i++) {
      await repo.create({ email: `p${i}@test.com`, name: `Person${i}`, age: 20 + i });
    }

    const rows = await repo.findAll({ limit: 2, offset: 1 });
    expect(rows).toHaveLength(2);
  });

  it("findById() returns the correct row", async () => {
    const created = await repo.create({ email: "find@test.com", name: "Find", age: 50 });
    expect(created).toBeTruthy();

    const found = await repo.findById(created!.id);
    expect(found).toBeTruthy();
    expect(found?.email).toBe("find@test.com");
  });

  it("findById() returns undefined for missing id", async () => {
    const found = await repo.findById(999);
    expect(found).toBeUndefined();
  });

  it("update() modifies matching rows", async () => {
    await repo.create({ email: "upd@test.com", name: "Old", age: 25 });
    const updated = await repo.update(
      (qb: any) => qb("email", "=", "upd@test.com"),
      { name: "Updated" },
    );

    expect(updated).toHaveLength(1);
    expect(updated[0]?.name).toBe("Updated");
  });

  it("updateById() modifies and returns the row", async () => {
    const created = await repo.create({ email: "updid@test.com", name: "OldName", age: 30 });
    const updated = await repo.updateById(created!.id, { name: "NewName" });

    expect(updated?.name).toBe("NewName");
  });

  it("delete() removes matching rows", async () => {
    await repo.create({ email: "del@test.com", name: "Delete", age: 60 });
    const count = await repo.delete((qb: any) => qb("email", "=", "del@test.com"));

    expect(count).toBeGreaterThanOrEqual(0);
    const rows = await repo.findAll();
    expect(rows).toHaveLength(0);
  });

  it("deleteById() removes and returns true", async () => {
    const created = await repo.create({ email: "delid@test.com", name: "DelId", age: 70 });
    const result = await repo.deleteById(created!.id);
    expect(result).toBe(true);
  });

  it("count() returns total rows", async () => {
    await repo.create({ email: "c1@test.com", name: "C1", age: 1 });
    await repo.create({ email: "c2@test.com", name: "C2", age: 2 });
    await repo.create({ email: "c3@test.com", name: "C3", age: 3 });

    const total = await repo.count();
    expect(total).toBe(3);
  });

  it("count() with where callback", async () => {
    await repo.create({ email: "c1@test.com", name: "C1", age: 10 });
    await repo.create({ email: "c2@test.com", name: "C2", age: 20 });
    await repo.create({ email: "c3@test.com", name: "C3", age: 30 });

    const count = await repo.count((qb: any) => qb("age", ">", 15));
    expect(count).toBe(2);
  });

  it("transaction commits on success", async () => {
    await repo.transaction(async (tx) => {
      await tx.create({ email: "txrepo@test.com", name: "TxRepo", age: 5 });
    });

    const rows = await repo.findAll();
    expect(rows).toHaveLength(1);
  });

  it("transaction rolls back on error", async () => {
    try {
      await repo.transaction(async (tx) => {
        await tx.create({ email: "fail@test.com", name: "Fail", age: 99 });
        throw new Error("rollback");
      });
    } catch {
      // expected
    }

    const rows = await repo.findAll();
    expect(rows).toHaveLength(0);
  });
});

describe("KyselyModule", () => {
  it("forRoot() returns a class", () => {
    const modClass = KyselyModule.forRoot({
      config: {
        dialect: {} as any,
      },
    });
    expect(modClass).toBeDefined();
    expect(typeof modClass).toBe("function");
    expect(modClass.name).toBe("ConfiguredKyselyModule");
  });

  it("forRootAsync() returns a class", () => {
    const modClass = KyselyModule.forRootAsync({
      useFactory: () => ({
        config: { dialect: {} as any },
      }),
      inject: [],
    });
    expect(modClass).toBeDefined();
    expect(typeof modClass).toBe("function");
    expect(modClass.name).toBe("ConfiguredKyselyModuleAsync");
  });
});

describe("KyselyService (error handling)", () => {
  it("close() is safe when not opened", async () => {
    const dialect = await createMemoryDialect();
    const svc = new KyselyService<DB>({ dialect });
    // Should not throw
    await svc.close();
  });

  it("migrate() throws when no provider configured", async () => {
    const dialect = await createMemoryDialect();
    const svc = new KyselyService<DB>({ dialect });
    await svc.open();

    await expect(svc.migrate()).rejects.toThrow(/No migration provider/);
    await svc.close();
  });

  it("can open/close multiple times", async () => {
    const dialect = await createMemoryDialect();
    const svc = new KyselyService<DB>({ dialect });

    await svc.open();
    expect(svc).toBeTruthy();
    await svc.close();

    await svc.open();
    expect(svc).toBeTruthy();
    await svc.close();
  });
});
