/**
 * `nexusjs/i18n` — internationalization for the Bun-native stack.
 *
 * Public API:
 * - `I18nService` — the main service. Translates messages,
 *   formats dates / numbers / currency via `Intl`.
 * - `I18nModule.forRoot(config)` — wires the service into the
 *   DI container, optionally loads JSON files from disk.
 * - `i18nMiddleware(service)` — Hono middleware that detects the
 *   active locale per request from query / cookie / Accept-Language.
 * - `@CurrentLocale()` — controller parameter decorator that
 *   injects the active locale.
 *
 * Zero external dependencies. All primitives come from Node's
 * built-in `Intl` API.
 *
 * Quick start:
 *
 *   import { Module } from "nexusjs";
 *   import { I18nModule, I18nService, I18N_SERVICE_TOKEN } from "nexusjs/i18n";
 *
 *   @Module({
 *     imports: [
 *       I18nModule.forRoot({
 *         defaultLocale: "en",
 *         messages: {
 *           en: { hello: "Hello, :name!" },
 *           ko: { hello: "안녕하세요, :name님!" },
 *         },
 *       }),
 *     ],
 *   })
 *   class AppModule {}
 *
 *   @Injectable()
 *   class UserService {
 *     constructor(@Inject(I18N_SERVICE_TOKEN) private i18n: I18nService) {}
 *     greet(name: string, locale: string) {
 *       return this.i18n.t("hello", { name }, locale);
 *     }
 *   }
 */

export { CurrentLocale } from "./decorators.js";
export { i18nMiddleware } from "./middleware.js";
export { I18nModule } from "./module.js";
export { I18N_SERVICE_TOKEN, I18nService } from "./service.js";
export type {
	CurrencyFormatOptions,
	DateFormatOptions,
	DetectOptions,
	I18nConfig,
	Locale,
	MessageCatalog,
	MessageDict,
	NumberFormatOptions,
	PluralCategory,
	TranslateArgs,
} from "./types.js";
