/**
 * `MailService` — main entry point for outbound mail.
 *
 *   const mail = new MailService({ transport: new NullTransport() });
 *   await mail.send({ to: 'a@b.com', subject: 'hi', html: '<h1>hi</h1>' });
 *
 *   mail.renderMjml('<mjml>...</mjml>', { name: 'Kim' });
 */
import { Inject, Injectable } from "../core/decorators/index.js";
import { NullTransport } from "./transports/null.js";
import type {
	MailConfig,
	MailMessage,
	MailSendResult,
	MailTransport,
} from "./types.js";

@Injectable()
export class MailService {
	/** DI token. */
	static readonly TOKEN = Symbol.for("nexus:MailService");

	transport: MailTransport;
	defaultFrom?: MailConfig["defaultFrom"];

	constructor(@Inject("MAIL_CONFIG") config: MailConfig = {}) {
		this.transport = config.transport ?? new NullTransport();
		this.defaultFrom = config.defaultFrom;
	}

	/** Send a single message. */
	async send(msg: MailMessage): Promise<MailSendResult> {
		const full = { ...msg, from: msg.from ?? this.defaultFrom };
		return this.transport.send(full);
	}

	/** Send the same message to many recipients (one envelope per call). */
	async sendBatch(msg: Omit<MailMessage, "to">, recipients: string[]): Promise<MailSendResult[]> {
		const results: MailSendResult[] = [];
		for (const to of recipients) {
			results.push(await this.send({ ...msg, to }));
		}
		return results;
	}

	/**
	 * Render an MJML template. The optional `mjml` peer dep is loaded lazily.
	 * Throws a clear error if not installed.
	 */
	async renderMjml(template: string, _vars?: Record<string, unknown>): Promise<string> {
		try {
			const mod = await import("mjml");
			const { html } = mod.mjml2html(template);
			return html;
		} catch (err) {
			throw new Error(
				"renderMjml requires the 'mjml' package. Install it with: bun add mjml",
			);
		}
	}
}
