/**
 * Tests for nexus/mail.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { readdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
	MailService,
	NullTransport,
	FileTransport,
} from "../../src/mail/index.js";
import type { MailMessage } from "../../src/mail/types.js";

describe("NullTransport", () => {
	it("captures sent messages", async () => {
		const t = new NullTransport();
		const r = await t.send({ to: "a@b.com", subject: "hi" });
		expect(r.id).toMatch(/^null-/);
		expect(t.sent).toHaveLength(1);
	});
});

describe("FileTransport", () => {
	const dir = join(tmpdir(), `nexus-mail-${Date.now()}`);

	beforeEach(async () => {
		await rm(dir, { recursive: true, force: true });
	});

	afterEach(async () => {
		await rm(dir, { recursive: true, force: true });
	});

	it("writes .eml files", async () => {
		const t = new FileTransport({ dir });
		const msg: MailMessage = {
			from: "no-reply@example.com",
			to: "user@example.com",
			subject: "Welcome",
			html: "<h1>Hi</h1>",
		};
		const r = await t.send(msg);
		expect(r.id).toBeTruthy();
		const files = await readdir(dir);
		expect(files).toHaveLength(1);
		expect(files[0]).toMatch(/\.eml$/);
	});

	it("eml file contains subject and html body", async () => {
		const t = new FileTransport({ dir });
		await t.send({
			from: "a@b.com",
			to: "c@d.com",
			subject: "Test Subject",
			html: "<p>body</p>",
		});
		const files = await readdir(dir);
		const content = await (await import("node:fs/promises")).readFile(
			join(dir, files[0]!),
			"utf-8",
		);
		expect(content).toContain("Subject: Test Subject");
		expect(content).toContain("<p>body</p>");
	});

	it("formats multiple recipients", async () => {
		const t = new FileTransport({ dir });
		await t.send({
			from: "a@b.com",
			to: ["x@y.com", "p@q.com"],
			subject: "Multi",
		});
		const files = await readdir(dir);
		const content = await (await import("node:fs/promises")).readFile(
			join(dir, files[0]!),
			"utf-8",
		);
		expect(content).toContain("x@y.com");
		expect(content).toContain("p@q.com");
	});
});

describe("MailService", () => {
	it("uses the configured transport", async () => {
		const t = new NullTransport();
		const svc = new MailService({ transport: t });
		await svc.send({ to: "a@b.com", subject: "hi" });
		expect(t.sent).toHaveLength(1);
	});

	it("applies defaultFrom when message omits from", async () => {
		const t = new NullTransport();
		const svc = new MailService({
			transport: t,
			defaultFrom: "no-reply@example.com",
		});
		await svc.send({ to: "a@b.com", subject: "hi" });
		const sent = t.sent[0]!;
		expect(sent.from).toBe("no-reply@example.com");
	});

	it("sendBatch fans out to each recipient", async () => {
		const t = new NullTransport();
		const svc = new MailService({ transport: t });
		const results = await svc.sendBatch(
			{ subject: "Newsletter", html: "<h1>Hi</h1>" },
			["a@b.com", "c@d.com", "e@f.com"],
		);
		expect(results).toHaveLength(3);
		expect(t.sent).toHaveLength(3);
	});

	it("renderMjml throws a clear error when mjml is not installed", async () => {
		const svc = new MailService();
		await expect(svc.renderMjml("<mjml></mjml>")).rejects.toThrow(
			/renderMjml requires/,
		);
	});
});
