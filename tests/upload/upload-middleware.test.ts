/**
 * Tests for nexus/upload — end-to-end multipart handling.
 *
 * Uses Hono's `request` API to simulate a real client uploading a
 * file via `multipart/form-data`.
 */

import "reflect-metadata";
import { Hono } from "hono";
import { beforeEach, describe, expect, it } from "vitest";
import { uploadMiddleware } from "../../src/upload/upload.middleware.js";
import { UploadService } from "../../src/upload/upload.service.js";

function makeApp(svc: UploadService, fields: Array<{ fieldName: string; maxFiles: number; required: boolean }>) {
	const app = new Hono();
	app.use(async (c, next) => {
		(c as any).set("uploadFields", fields);
		return uploadMiddleware(svc)(c, next);
	});
	return app;
}

describe("Hono integration · single file upload", () => {
	let svc: UploadService;

	beforeEach(() => {
		svc = new UploadService({
			allowedMimeTypes: ["image/png", "image/jpeg"],
		});
	});

	it("parses a single file from a multipart body", async () => {
		const app = makeApp(svc, [
			{ fieldName: "avatar", maxFiles: 1, required: true },
		]);
		app.post("/upload", (c) => {
			const files = svc.getAll(c, "avatar");
			const body = {
				count: files.length,
				first: files[0]
					? { filename: files[0].filename, size: files[0].size, type: files[0].contentType }
					: null,
			};
			return c.json(body);
		});

		const form = new FormData();
		form.append("avatar", new Blob([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], { type: "image/png" }), "avatar.png");
		const res = await app.request("http://x/upload", { method: "POST", body: form });
		expect(res.status).toBe(200);
		const body = await res.json();
		expect(body.count).toBe(1);
		expect(body.first.filename).toBe("avatar.png");
		expect(body.first.size).toBe(4);
		expect(body.first.type).toBe("image/png");
	});

	it("rejects a file that violates the MIME allow list", async () => {
		const app = makeApp(svc, [
			{ fieldName: "doc", maxFiles: 1, required: true },
		]);
		app.post("/upload", () => new Response("ok"));

		const form = new FormData();
		form.append("doc", new Blob([new Uint8Array([1, 2, 3])], { type: "application/x-msdownload" }), "evil.exe");
		const res = await app.request("http://x/upload", { method: "POST", body: form });
		expect(res.status).toBe(400);
		const body = await res.json();
		expect(body.code).toBe("MIME_NOT_ALLOWED");
		expect(body.field).toBe("doc");
	});

	it("rejects when required field is missing", async () => {
		const app = makeApp(svc, [
			{ fieldName: "required-field", maxFiles: 1, required: true },
		]);
		app.post("/upload", () => new Response("ok"));

		const form = new FormData();
		form.append("something-else", "text value");
		const res = await app.request("http://x/upload", { method: "POST", body: form });
		expect(res.status).toBe(400);
		const body = await res.json();
		expect(body.code).toBe("MISSING_FIELD");
	});
});

describe("Hono integration · multiple files", () => {
	it("parses multiple files from a single field", async () => {
		const svc = new UploadService({ allowedMimeTypes: ["*"] });
		const app = makeApp(svc, [
			{ fieldName: "photos", maxFiles: 5, required: true },
		]);
		app.post("/upload", (c) => {
			const photos = svc.getAll(c, "photos");
			return c.json({ count: photos.length, names: photos.map((p) => p.filename) });
		});

		const form = new FormData();
		form.append("photos", new Blob([new Uint8Array([1])]), "a.png");
		form.append("photos", new Blob([new Uint8Array([2, 2])]), "b.png");
		form.append("photos", new Blob([new Uint8Array([3, 3, 3])]), "c.png");
		const res = await app.request("http://x/upload", { method: "POST", body: form });
		const body = await res.json();
		expect(body.count).toBe(3);
		expect(body.names).toEqual(["a.png", "b.png", "c.png"]);
	});
});

describe("Hono integration · non-multipart", () => {
	it("skips parsing for application/json", async () => {
		const svc = new UploadService();
		const app = new Hono();
		app.use(uploadMiddleware(svc));
		app.post("/upload", (c) => c.json({ ok: true }));
		const res = await app.request("http://x/upload", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ hello: "world" }),
		});
		expect(res.status).toBe(200);
		const body = await res.json();
		expect(body.ok).toBe(true);
	});
});
