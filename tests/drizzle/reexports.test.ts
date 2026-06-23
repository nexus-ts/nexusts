import "reflect-metadata";
import { describe, it, expect } from "vitest";
import {
  Entity,
  getEntityTable,
  generateMigrations,
  pushSchema,
  eq, ne, and, or, sql, asc, desc,
  like, ilike, inArray, isNull,
} from "@nexusts/drizzle";
import type { DrizzleRepository, DrizzleService } from "@nexusts/drizzle";

describe("drizzle re-exports", () => {
  it("exports operators", () => {
    expect(typeof eq).toBe("function");
    expect(typeof ne).toBe("function");
    expect(typeof and).toBe("function");
    expect(typeof or).toBe("function");
    expect(typeof sql).toBe("function");
    expect(typeof like).toBe("function");
    expect(typeof ilike).toBe("function");
    expect(typeof inArray).toBe("function");
    expect(typeof isNull).toBe("function");
    expect(typeof asc).toBe("function");
    expect(typeof desc).toBe("function");
  });

  it("exports Entity decorator", () => {
    expect(typeof Entity).toBe("function");
    expect(typeof getEntityTable).toBe("function");
  });

  it("exports migration helpers", () => {
    expect(typeof generateMigrations).toBe("function");
    expect(typeof pushSchema).toBe("function");
  });

  it("Entity decorator stores table metadata", () => {
    const fakeTable = { _: { name: "test" } };
    @Entity(fakeTable as any)
    class TestRepo {}
    expect(getEntityTable(TestRepo as any)).toBe(fakeTable);
  });
});
