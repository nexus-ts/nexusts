/**
 * Ambient type declarations for optional mail peer dependencies.
 */
declare module "nodemailer" {
	export interface SendMailOptions {
		from?: string;
		to?: string;
		cc?: string;
		bcc?: string;
		replyTo?: string;
		subject?: string;
		text?: string;
		html?: string;
		attachments?: Array<{
			filename?: string;
			content?: Buffer | string;
			contentType?: string;
			cid?: string;
		}>;
		headers?: Record<string, string>;
		priority?: "high" | "normal" | "low";
	}
	export interface SendMailResult {
		messageId?: string;
		accepted?: string[];
		rejected?: string[];
		pending?: string[];
		response?: string;
	}
	export interface Transporter {
		sendMail(options: SendMailOptions): Promise<SendMailResult>;
		close(): Promise<void>;
	}
	const nodemailer: {
		createTransport(options: any): Transporter;
	};
	export default nodemailer;
}

declare module "mjml" {
	export function mjml2html(
		input: string,
		options?: { validationLevel?: "strict" | "soft" | "skip" },
	): {
		html: string;
		errors: Array<{ line: number; message: string; tagName: string }>;
	};
}
