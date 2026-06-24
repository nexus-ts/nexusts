/**
 * Tests for nexus/upload — UploadService + decorators.
 *
 * We mock Hono's context to exercise parse / get / getAll / validate.
 * Real multipart parsing is tested in the Hono integration test
 * (`upload-middleware.test.ts`).
 */

import "reflect-metadata";
import { beforeEach, describe, expect, it } from "vitest";
import { UploadError } from "../../src/upload/types.js";
import { UploadService } from "../../src/upload/upload.service.js";

function makeMockContext(parts: Record<string, unknown>) {
	const stored: Record<string, unknown> = {};
	return {
		req: {
			raw: { headers: { get: (k: string) => k === "content-type" ? "multipart/form-data; boundary=..." : null } },
			parseBody: async () => parts,
		},
		set(key: string, val: any) { stored[key] = val; },
		get(key: string) { return stored[key]; },
	};
}

function makeFile(name: string, content: string, type: string) {
	const bytes = new TextEncoder().encode(content);
	return {
		name,
		filename: name,
		type,
		size: bytes.byteLength,
		arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
	};
}

describe("UploadService · validation", () => {
	let svc: UploadService;
	beforeEach(() => {
		svc = new UploadService({
			maxFileSize: 100,
			allowedMimeTypes: ["image/png"],
		});
	});

	it("rejects file larger than maxFileSize", async () => {
		const ctx = makeMockContext({
			avatar: makeFile("big.png", "x".repeat(200), "image/png"),
		});
		await expect(
			svc.parseAndStore(ctx, [
				{ fieldName: "avatar", maxFiles: 1, required: true },
			]),
		).rejects.toThrow(UploadError);
	});

	it("rejects file with disallowed MIME", async () => {
		const ctx = makeMockContext({
			avatar: makeFile("x.exe", "binary", "application/octet-stream"),
		});
		await expect(
			svc.parseAndStore(ctx, [
				{ fieldName: "avatar", maxFiles: 1, required: true },
			]),
		).rejects.toThrow(UploadError);
	});

	it("rejects missing required field", async () => {
		const ctx = makeMockContext({});
		await expect(
			svc.parseAndStore(ctx, [
				{ fieldName: "avatar", maxFiles: 1, required: true },
			]),
		).rejects.toThrow(UploadError);
	});

	it("rejects too many files", async () => {
		const ctx = makeMockContext({
			photos: [
				makeFile("a.png", "a", "image/png"),
				makeFile("b.png", "b", "image/png"),
				makeFile("c.png", "c", "image/png"),
			],
		});
		await expect(
			svc.parseAndStore(ctx, [
				{ fieldName: "photos", maxFiles: 2, required: true },
			]),
		).rejects.toThrow(UploadError);
	});

	it("accepts a valid file", async () => {
		const ctx = makeMockContext({
			avatar: makeFile("me.png", "PNGDATA", "image/png"),
		});
		await svc.parseAndStore(ctx, [
			{ fieldName: "avatar", maxFiles: 1, required: true },
		]);
		const f = svc.get(ctx, "avatar");
		expect(f).toBeDefined();
		expect(f?.contentType).toBe("image/png");
		expect(f?.size).toBe(7);
	});
});

describe("UploadService · wildcard MIME matching", () => {
	it("accepts image/* when listed as wildcard", async () => {
		const svc = new UploadService({ allowedMimeTypes: ["image/*"] });
		const ctx = makeMockContext({
			avatar: makeFile("me.jpg", "JPGDATA", "image/jpeg"),
		});
		await svc.parseAndStore(ctx, [
			{ fieldName: "avatar", maxFiles: 1, required: true },
		]);
		expect(svc.get(ctx, "avatar")).toBeDefined();
	});

	it("rejects non-image when only image/* is allowed", async () => {
		const svc = new UploadService({ allowedMimeTypes: ["image/*"] });
		const ctx = makeMockContext({
			doc: makeFile("x.pdf", "PDFDATA", "application/pdf"),
		});
		await expect(
			svc.parseAndStore(ctx, [
				{ fieldName: "doc", maxFiles: 1, required: true },
			]),
		).rejects.toThrow(UploadError);
	});
});

describe("UploadService · get / getAll", () => {
	it("returns undefined for unknown field", () => {
		const svc = new UploadService();
		const ctx = { get: () => undefined };
		expect(svc.get(ctx as any, "missing")).toBeUndefined();
		expect(svc.getAll(ctx as any, "missing")).toEqual([]);
	});

	it("returns single file from get, array from getAll for multi", async () => {
		const svc = new UploadService({ allowedMimeTypes: ["*"] });
		const ctx = makeMockContext({
			photos: [
				makeFile("a.png", "a", "image/png"),
				makeFile("b.png", "b", "image/png"),
			],
		});
		await svc.parseAndStore(ctx, [
			{ fieldName: "photos", maxFiles: 5, required: true },
		]);
		const all = svc.getAll(ctx, "photos");
		expect(all).toHaveLength(2);
		// `get` returns the first file when stored as an array.
		expect(svc.get(ctx, "photos")?.filename).toBe("a.png");
	});
});

describe("UploadService · allowed field is optional", () => {
	it("does not throw when optional field is missing", async () => {
		const svc = new UploadService();
		const ctx = makeMockContext({});
		await svc.parseAndStore(ctx, [
			{ fieldName: "doc", maxFiles: 1, required: false },
		]);
		expect(svc.get(ctx, "doc")).toBeUndefined();
	});
});
