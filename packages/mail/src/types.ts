/**
import { safeGetMeta, safeDefineMeta, safeHasMeta } from "@nexusts/core/di/safe-reflect";
 * `nexusjs/mail` — outbound email.
 *
 *   const mail = new MailService({ transport: new SmtpTransport({ host: 'smtp.gmail.com' }) });
 *   await mail.send({
 *     from: 'no-reply@example.com',
 *     to: 'user@example.com',
 *     subject: 'Welcome',
 *     html: '<h1>Hi</h1>',
 *   });
 *
 * Transports:
 *   - `SmtpTransport`  — SMTP via nodemailer (peer dep)
 *   - `FileTransport`  — write .eml files to a directory (dev/test)
 *   - `NullTransport`  — drop everything (tests)
 *
 *   mail.renderMjml('template', { name: 'Kim' })  // compile MJML to HTML
 */

/** A single recipient. */
export type MailAddress = string | { name?: string; address: string };

/** A mail message. */
export interface MailMessage {
	from?: MailAddress;
	to: MailAddress | MailAddress[];
	cc?: MailAddress | MailAddress[];
	bcc?: MailAddress | MailAddress[];
	replyTo?: MailAddress;
	subject: string;
	text?: string;
	html?: string;
	/** Attachments. */
	attachments?: MailAttachment[];
	/** Custom headers. */
	headers?: Record<string, string>;
	/** Priority: 1 (high), 3 (normal), 5 (low). */
	priority?: "high" | "normal" | "low";
}

export interface MailAttachment {
	filename: string;
	/** File content (Buffer / string). */
	content: Buffer | string;
	/** MIME type. Default: 'application/octet-stream'. */
	contentType?: string;
	/** Content-ID for inline images. */
	cid?: string;
}

/** Result returned by a transport after sending. */
export interface MailSendResult {
	/** Transport-specific ID (e.g. SMTP message-id). */
	id: string;
	/** When the message was sent (unix-ms). */
	sentAt: number;
}

/** Transport that knows how to deliver a message. */
export interface MailTransport {
	readonly kind: string;
	send(msg: MailMessage): Promise<MailSendResult>;
	close?(): Promise<void>;
}

/** Top-level config. */
export interface MailConfig {
	/** Transport backend. Default: NullTransport. */
	transport?: MailTransport;
	/** Default `from` address. */
	defaultFrom?: MailAddress;
	/** Whether to expose raw `nodemailer` (only if SmtpTransport is used). */
	debug?: boolean;
}
