/**
 * Null mail transport. Drops every message. Useful in tests.
 */
import type { MailMessage, MailSendResult, MailTransport } from "../types.js";

export class NullTransport implements MailTransport {
	readonly kind = "null";
	/** Captured messages for inspection in tests. */
	sent: MailMessage[] = [];

	async send(msg: MailMessage): Promise<MailSendResult> {
		this.sent.push(msg);
		return {
			id: `null-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
			sentAt: Date.now(),
		};
	}
}
