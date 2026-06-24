/**
 * Tests for nexus/drive.
 */

import "reflect-metadata";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
	DriveService,
	LocalDriver,
	MemoryDriver,
} from "../../src/drive/index.js";

describe("MemoryDriver", () => {
	let driver: MemoryDriver;
	beforeEach(() => {
		driver = new MemoryDriver();
	});

	it("put/get round trip", async () => {
		await driver.put("k1", Buffer.from("hello"));
		const v = await driver.get("k1");
		expect(v.toString()).toBe("hello");
	});

	it("throws on get of missing key", async () => {
		await expect(driver.get("missing")).rejects.toThrow();
	});

	it("delete returns true on existing, false on missing", async () => {
		await driver.put("k1", "v");
		expect(await driver.delete("k1")).toBe(true);
		expect(await driver.delete("k1")).toBe(false);
	});

	it("exists()", async () => {
		await driver.put("k1", "v");
		expect(await driver.exists("k1")).toBe(true);
		expect(await driver.exists("missing")).toBe(false);
	});

	it("head() returns metadata", async () => {
		await driver.put("a.txt", "hello", { contentType: "text/plain" });
		const m = await driver.head("a.txt");
		expect(m.size).toBe(5);
		expect(m.contentType).toBe("text/plain");
		expect(m.lastModified).toBeGreaterThan(0);
	});

	it("list() with prefix", async () => {
		await driver.put("a/x", "1");
		await driver.put("a/y", "2");
		await driver.put("b/z", "3");
		const r = await driver.list({ prefix: "a/" });
		expect(r.keys.sort()).toEqual(["a/x", "a/y"]);
		expect(r.hasMore).toBe(false);
	});

	it("list() with limit and cursor", async () => {
		for (let i = 0; i < 5; i++) await driver.put(`k${i}`, "v");
		const r1 = await driver.list({ limit: 2 });
		expect(r1.keys).toHaveLength(2);
		expect(r1.hasMore).toBe(true);
		expect(r1.cursor).toBeDefined();
		const r2 = await driver.list({ limit: 2, cursor: r1.cursor });
		expect(r2.keys).toHaveLength(2);
	});

	it("getSignedUrl() returns a sentinel URL", async () => {
		await driver.put("a", "1");
		const url = await driver.getSignedUrl("a");
		expect(url).toMatch(/^memory:\/\//);
	});

	it("copy()", async () => {
		await driver.put("src", "hello");
		await driver.copy("src", "dest");
		expect((await driver.get("src")).toString()).toBe("hello");
		expect((await driver.get("dest")).toString()).toBe("hello");
	});

	it("move()", async () => {
		await driver.put("src", "hello");
		await driver.move("src", "dest");
		expect(await driver.exists("src")).toBe(false);
		expect((await driver.get("dest")).toString()).toBe("hello");
	});
});

describe("LocalDriver", () => {
	const root = join(tmpdir(), `nexus-drive-${Date.now()}`);

	beforeEach(async () => {
		await mkdir(root, { recursive: true });
	});

	afterEach(async () => {
		await rm(root, { recursive: true, force: true });
	});

	it("writes and reads a file", async () => {
		const driver = new LocalDriver({ root });
		await driver.put("a.txt", "hello");
		expect((await driver.get("a.txt")).toString()).toBe("hello");
	});

	it("creates intermediate directories", async () => {
		const driver = new LocalDriver({ root });
		await driver.put("sub/dir/file.txt", "deep");
		expect((await driver.get("sub/dir/file.txt")).toString()).toBe("deep");
	});

	it("rejects path traversal", async () => {
		const driver = new LocalDriver({ root });
		await expect(driver.get("../etc/passwd")).rejects.toThrow(/traversal/);
		await expect(driver.put("../escape", "x")).rejects.toThrow(/traversal/);
	});

	it("delete/exists/head", async () => {
		const driver = new LocalDriver({ root });
		await driver.put("a.txt", "hello");
		expect(await driver.exists("a.txt")).toBe(true);
		const m = await driver.head("a.txt");
		expect(m.size).toBe(5);
		expect(await driver.delete("a.txt")).toBe(true);
		expect(await driver.exists("a.txt")).toBe(false);
	});

	it("list() walks subdirectories", async () => {
		const driver = new LocalDriver({ root });
		await driver.put("a/1", "x");
		await driver.put("a/2", "y");
		await driver.put("b/3", "z");
		const r = await driver.list({ prefix: "a/" });
		expect(r.keys.sort()).toEqual(["a/1", "a/2"]);
	});

	it("getSignedUrl() returns a public URL prefix", async () => {
		const driver = new LocalDriver({ root, publicUrlPrefix: "/static" });
		const url = await driver.getSignedUrl("a.txt");
		expect(url).toBe("/static/a.txt");
	});
});

describe("DriveService (façade)", () => {
	it("uses the configured driver", async () => {
		const driver = new MemoryDriver();
		const svc = new DriveService({ driver });
		await svc.put("a", "hello");
		expect((await svc.get("a")).toString()).toBe("hello");
		expect(await svc.exists("a")).toBe(true);
	});

	it("delegates getSignedUrl", async () => {
		const driver = new MemoryDriver();
		const svc = new DriveService({ driver });
		await svc.put("a", "1");
		const url = await svc.getSignedUrl("a");
		expect(url).toMatch(/^memory:\/\//);
	});

	it("uses a custom signedUrlBuilder when provided", async () => {
		const driver = new MemoryDriver();
		const svc = new DriveService({
			driver,
			signedUrlBuilder: async (k) => `https://cdn.example.com/${k}`,
		});
		await svc.put("a.txt", "1");
		const url = await svc.getSignedUrl("a.txt");
		expect(url).toBe("https://cdn.example.com/a.txt");
	});
});
