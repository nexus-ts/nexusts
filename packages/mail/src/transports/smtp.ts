/**
 * SMTP mail transport. Uses `nodemailer` as an optional peer dep.
 *
 *   const transport = new SmtpTransport({
 *     host: 'smtp.gmail.com',
 *     port: 465,
 *     secure: true,
 *     auth: { user: '...', pass: '...' },
 *   });
 *   const mail = new MailService({ transport });
 */
import type { MailMessage, MailSendResult, MailTransport } from "../types.js";

export interface SmtpTransportOptions {
	host: string;
	port?: number;
	secure?: boolean;
	auth?: { user: string; pass: string };
	/** Optional pool of pre-opened connections. */
	pool?: boolean;
	/** Maximum connections. */
	maxConnections?: number;
	/** Sender override. */
	defaultFrom?: string;
	/** `nodemailer` extra options. */
	extras?: Record<string, any>;
}

export class SmtpTransport implements MailTransport {
	readonly kind = "smtp";
	private opts: SmtpTransportOptions;
	private _transporter: any = null;

	constructor(opts: SmtpTransportOptions) {
		this.opts = opts;
	}

	private async transporter() {
		if (this._transporter) return this._transporter;
		try {
			const mod = await import("nodemailer");
			this._transporter = mod.default.createTransport({
				host: this.opts.host,
				port: this.opts.port,
				secure: this.opts.secure,
				auth: this.opts.auth,
				pool: this.opts.pool,
				maxConnections: this.opts.maxConnections,
				...this.opts.extras,
			});
		} catch (_err) {
			throw new Error(
				"SmtpTransport requires nodemailer. Install it with: bun add nodemailer",
			);
		}
		return this._transporter;
	}

	async send(msg: MailMessage): Promise<MailSendResult> {
		const t = await this.transporter();
		const from = this.formatAddr(msg.from ?? this.opts.defaultFrom);
		const res = await t.sendMail({
			from,
			to: this.formatAddr(msg.to),
			cc: msg.cc ? this.formatAddr(msg.cc) : undefined,
			bcc: msg.bcc ? this.formatAddr(msg.bcc) : undefined,
			replyTo: msg.replyTo ? this.formatAddr(msg.replyTo) : undefined,
			subject: msg.subject,
			text: msg.text,
			html: msg.html,
			attachments: msg.attachments?.map((a) => ({
				filename: a.filename,
				content: a.content,
				contentType: a.contentType,
				cid: a.cid,
			})),
			headers: msg.headers,
			priority: msg.priority,
		});
		return {
			id: res.messageId ?? `smtp-${Date.now()}`,
			sentAt: Date.now(),
		};
	}

	async close(): Promise<void> {
		if (this._transporter) {
			await this._transporter.close();
			this._transporter = null;
		}
	}

	private formatAddr(a: MailMessage["to"] | undefined): string {
		if (!a) return "";
		if (Array.isArray(a)) return a.map((x) => this.formatAddr(x)).join(", ");
		if (typeof a === "string") return a;
		return a.name ? `${a.name} <${a.address}>` : a.address;
	}
}
