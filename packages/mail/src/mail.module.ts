/**
 * `MailModule` — drop-in mail.
 *
 *   @Module({
 *     imports: [
 *       MailModule.forRoot({
 *         transport: new SmtpTransport({ host: 'smtp.example.com' }),
 *         defaultFrom: 'no-reply@example.com',
 *       }),
 *     ],
 *   })
 *   export class AppModule {}
 */
import { Module } from "@nexusts/core";
import { MailService } from "./mail.service.js";
import { NullTransport } from "./transports/null.js";
import type { MailConfig } from "./types.js";
import { safeGetMeta, safeDefineMeta, safeHasMeta } from "@nexusts/core/di/safe-reflect";

@Module({
	providers: [
		MailService,
		{ provide: MailService.TOKEN, useExisting: MailService },
	],
	exports: [MailService, MailService.TOKEN],
})
export class MailModule {
	static forRoot(config: MailConfig = {}) {
		const cfg: MailConfig = {
			transport: new NullTransport(),
			...config,
		};
		@Module({
			providers: [
				MailService,
				{ provide: MailService.TOKEN, useExisting: MailService },
				{ provide: "MAIL_CONFIG", useValue: cfg },
			],
			exports: [MailService, MailService.TOKEN],
		})
		class ConfiguredMailModule {}
		Object.defineProperty(ConfiguredMailModule, "name", {
			value: "ConfiguredMailModule",
		});
		return ConfiguredMailModule;
	}
}
