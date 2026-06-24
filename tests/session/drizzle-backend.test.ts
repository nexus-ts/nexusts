/**
 * Tests for DrizzleSessionStorage.
 */

import "reflect-metadata";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DrizzleService } from "../../src/drizzle/index.js";
import { DrizzleSessionStorage } from "../../src/session/backends/drizzle.js";
import { SessionService } from "../../src/session/index.js";

let hasBunSqlite = false;
try {
	require("bun:sqlite");
	hasBunSqlite = true;
} catch (err) {
	// not bun; tests will be skipped
	void err;
}

const describeIf = hasBunSqlite ? describe : describe.skip;

describeIf("DrizzleSessionStorage (real SQLite)", () => {
	let svc: DrizzleService;
	let storage: DrizzleSessionStorage;

	beforeEach(async () => {
		svc = new DrizzleService({
			dialect: "bun-sqlite",
			connection: { filename: ":memory:" },
		});
		await svc.open();
		await svc.raw`CREATE TABLE nexus_sessions (
			id TEXT PRIMARY KEY,
			user_id TEXT,
			data TEXT,
			created_at TEXT,
			last_seen_at TEXT,
			expires_at TEXT,
			absolute_expires_at TEXT,
			metadata TEXT
		)`.execute();
		storage = new DrizzleSessionStorage({ db: svc });
	});

	afterEach(async () => {
		await svc.close();
	});

	it("create() persists a session", async () => {
		const rec = await storage.create({ data: { foo: "bar" } });
		expect(rec.id).toBeTruthy();
		const rows = await svc.raw`SELECT * FROM nexus_sessions`.all<{
			id: string;
		}>();
		expect(rows).toHaveLength(1);
	});

	it("read() returns the record", async () => {
		const rec = await storage.create({ data: { a: 1 } });
		const read = await storage.read(rec.id);
		expect(read?.id).toBe(rec.id);
		expect(read?.data).toEqual({ a: 1 });
	});

	it("read() returns null for missing id", async () => {
		const r = await storage.read("missing");
		expect(r).toBeNull();
	});

	it("update() extends expiry", async () => {
		const rec = await storage.create({ data: {}, ttlSeconds: 60 });
		const before = rec.expiresAt.getTime();
		const updated = await storage.update(rec.id, { extendSeconds: 600 });
		expect(updated?.expiresAt.getTime()).toBeGreaterThan(before);
	});

	it("destroy() removes the record", async () => {
		const rec = await storage.create({ data: {} });
		expect(await storage.destroy(rec.id)).toBe(true);
		expect(await storage.read(rec.id)).toBeNull();
	});

	it("gc() removes expired sessions", async () => {
		const rec = await storage.create({ data: {} });
		// Manually set expires_at to the past via a one-off raw query
		await svc.rawQuery(
			"UPDATE nexus_sessions SET expires_at = ? WHERE id = ?",
			[new Date(Date.now() - 1000).toISOString(), rec.id],
		);
		await storage.gc();
		const r = await storage.read(rec.id);
		expect(r).toBeNull();
	});

	it("SessionService integrates with drizzle backend", async () => {
		const session = new SessionService({
			backend: "database",
			database: { db: svc },
		});
		const rec = await session.create({ data: { hello: "world" } });
		const read = await session.read(rec.id);
		expect(read?.data).toEqual({ hello: "world" });
	});
});
