/**
 * Public entry point for `nexusjs/mail`.
 */

export { MailModule } from "./mail.module.js";
export { MailService } from "./mail.service.js";
export type {
	FileTransportOptions,
	SmtpTransportOptions,
} from "./transports/index.js";
export {
	FileTransport,
	NullTransport,
	SmtpTransport,
} from "./transports/index.js";
export * from "./types.js";
