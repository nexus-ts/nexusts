/**
 * Tests for nexus/static.
 */

import "reflect-metadata";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Hono } from "hono";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { StaticService } from "../../src/static/index.js";

const root = join(tmpdir(), `nexus-static-test-${Date.now()}`);

beforeAll(async () => {
	await mkdir(join(root, "sub"), { recursive: true });
	await writeFile(join(root, "hello.txt"), "Hello, world!\n");
	await writeFile(join(root, "sub", "page.html"), "<h1>page</h1>");
	await writeFile(join(root, "sub", "data.json"), '{"a":1}');
});

afterAll(async () => {
	await rm(root, { recursive: true, force: true });
});

function app(svc: StaticService): Hono {
	const app = new Hono();
	app.use("/*", svc.middleware());
	app.use("*", (c) => c.text("next", 200));
	return app;
}

describe("StaticService", () => {
	it("serves a file from the configured root", async () => {
		const svc = new StaticService({ root });
		const res = await app(svc).request("http://x/hello.txt");
		expect(res.status).toBe(200);
		expect(res.headers.get("Content-Type")).toContain("text/plain");
		const body = await res.text();
		expect(body).toContain("Hello, world!");
	});

	it("serves with correct Content-Type for json", async () => {
		const svc = new StaticService({ root });
		const res = await app(svc).request("http://x/sub/data.json");
		expect(res.status).toBe(200);
		expect(res.headers.get("Content-Type")).toContain("application/json");
	});

	it("falls through to next for missing files", async () => {
		const svc = new StaticService({ root });
		const res = await app(svc).request("http://x/missing.txt");
		expect(res.status).toBe(200);
		expect(await res.text()).toBe("next");
	});

	it("serves index.html for directory requests", async () => {
		const dir = join(tmpdir(), `nexus-static-idx-${Date.now()}`);
		await mkdir(join(dir, "sub"), { recursive: true });
		await writeFile(join(dir, "sub", "index.html"), "<h1>idx</h1>");
		const svc = new StaticService({ root: dir });
		const res = await app(svc).request("http://x/sub/");
		expect(res.status).toBe(200);
		expect(await res.text()).toContain("idx");
		await rm(dir, { recursive: true, force: true });
	});

	it("rejects path traversal attempts", async () => {
		const svc = new StaticService({ root });
		const res = await app(svc).request("http://x/../etc/passwd");
		expect(await res.text()).toBe("next");
	});

	it("returns 304 on ETag match", async () => {
		const svc = new StaticService({ root });
		// First request to get the ETag.
		const first = await app(svc).request("http://x/hello.txt");
		const etag = first.headers.get("ETag");
		expect(etag).toBeTruthy();
		// Second request with If-None-Match.
		const second = await app(svc).request("http://x/hello.txt", {
			headers: { "if-none-match": etag! },
		});
		expect(second.status).toBe(304);
	});

	it("handles range requests with 206", async () => {
		const svc = new StaticService({ root });
		const res = await app(svc).request("http://x/hello.txt", {
			headers: { range: "bytes=0-4" },
		});
		expect(res.status).toBe(206);
		expect(res.headers.get("Content-Range")).toContain("bytes 0-4/");
		const body = await res.text();
		expect(body).toBe("Hello");
	});

	it("returns next for paths outside the configured prefix", async () => {
		const svc = new StaticService({ root, prefix: "/static" });
		const local = new Hono();
		local.use("/static/*", svc.middleware());
		local.use("*", (c) => c.text("next", 200));
		const res = await local.request("http://x/hello.txt");
		expect(await res.text()).toBe("next");
	});
});
