/**
 * `MailService` — main entry point for outbound mail.
 *
 *   const mail = new MailService({ transport: new NullTransport() });
 *   await mail.send({ to: 'a@b.com', subject: 'hi', html: '<h1>hi</h1>' });
 *
 *   mail.renderMjml('<mjml>...</mjml>', { name: 'Kim' });
 */
import { Inject, Injectable } from "@nexusts/core";
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

	/** Mail config — injected by DI container. */
	@Inject("MAIL_CONFIG") declare private config: MailConfig;

	private _transport: MailTransport | null = null;
	private _defaultFrom: MailConfig["defaultFrom"] = undefined;

	private init(): void {
		if (this._transport) return;
		const cfg = this.config ?? {};
		this._transport = cfg.transport ?? new NullTransport();
		this._defaultFrom = cfg.defaultFrom;
	}

	get transport(): MailTransport {
		this.init();
		return this._transport!;
	}
	set transport(v: MailTransport) { this._transport = v; }

	get defaultFrom(): MailConfig["defaultFrom"] { this.init(); return this._defaultFrom; }
	set defaultFrom(v: MailConfig["defaultFrom"]) { this._defaultFrom = v; }

	/** Send a single message. */
	async send(msg: MailMessage): Promise<MailSendResult> {
		this.init();
		const full = { ...msg, from: msg.from ?? this._defaultFrom };
		return this._transport!.send(full);
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
