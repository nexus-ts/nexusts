/**
 * File mail transport. Writes each outgoing message as a `.eml` file
 * under a directory. Useful for development and acceptance tests.
 *
 *   new FileTransport({ dir: './tmp/mail', pretty: true });
 */
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { MailMessage, MailSendResult, MailTransport } from "../types.js";

export interface FileTransportOptions {
	/** Directory where `.eml` files are written. */
	dir: string;
	/** Format the .eml with proper headers (true) or just the body (false). Default: true. */
	includeHeaders?: boolean;
	/** Pretty-print JSON content-type bodies. */
	pretty?: boolean;
}

export class FileTransport implements MailTransport {
	readonly kind = "file";
	private opts: Required<FileTransportOptions>;

	constructor(opts: FileTransportOptions) {
		this.opts = {
			dir: opts.dir,
			includeHeaders: opts.includeHeaders ?? true,
			pretty: opts.pretty ?? true,
		};
	}

	async send(msg: MailMessage): Promise<MailSendResult> {
		await mkdir(this.opts.dir, { recursive: true });
		const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
		const filename = `${id}.eml`;
		const body = this.opts.includeHeaders ? this.toEml(msg) : this.toBody(msg);
		await writeFile(join(this.opts.dir, filename), body, "utf-8");
		return { id, sentAt: Date.now() };
	}

	private toEml(msg: MailMessage): string {
		const headers: string[] = [];
		if (msg.from) headers.push(`From: ${this.formatAddr(msg.from)}`);
		headers.push(`To: ${this.formatAddr(msg.to)}`);
		if (msg.cc) headers.push(`Cc: ${this.formatAddr(msg.cc)}`);
		if (msg.replyTo) headers.push(`Reply-To: ${this.formatAddr(msg.replyTo)}`);
		headers.push(`Subject: ${msg.subject}`);
		headers.push(`Date: ${new Date().toUTCString()}`);
		headers.push(`MIME-Version: 1.0`);
		if (msg.html) {
			headers.push(`Content-Type: text/html; charset=utf-8`);
		} else {
			headers.push(`Content-Type: text/plain; charset=utf-8`);
		}
		const body = msg.html ?? msg.text ?? "";
		return `${headers.join("\r\n")}\r\n\r\n${body}`;
	}

	private toBody(msg: MailMessage): string {
		return msg.html ?? msg.text ?? "";
	}

	private formatAddr(a: MailMessage["to"]): string {
		if (Array.isArray(a)) return a.map((x) => this.formatAddr(x)).join(", ");
		if (typeof a === "string") return a;
		return a.name ? `${a.name} <${a.address}>` : a.address;
	}
}
