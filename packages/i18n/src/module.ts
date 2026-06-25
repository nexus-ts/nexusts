/**
 * `I18nModule` — wires `I18nService` into the DI container.
 *
 * Usage:
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
 * The middleware is also exported (`i18nMiddleware()`) and
 * installed by the module's static `install()` helper:
 *
 *   const app = new Application(AppModule);
 *   I18nModule.install(app, container);  // or via @Module middleware config
 */

import { Module } from "@nexusts/core";
import { Inject } from "@nexusts/core";
import type { Application } from "@nexusts/core";
import {
	I18nService,
	I18N_SERVICE_TOKEN,
} from "./service.js";
import { i18nMiddleware } from "./middleware.js";
import type { I18nConfig, Locale, MessageCatalog } from "./types.js";
import { safeGetMeta, safeDefineMeta, safeHasMeta } from "@nexusts/core/di/safe-reflect";

@Module({
	providers: [
		I18nService,
		{ provide: I18N_SERVICE_TOKEN, useExisting: I18nService },
	],
	exports: [I18nService, I18N_SERVICE_TOKEN],
})
export class I18nModule {
	static forRoot(config: I18nConfig = {}) {
		const fullConfig: Required<I18nConfig> = {
			defaultLocale: config.defaultLocale ?? "en",
			fallback: config.fallback ?? true,
			fallbackToDefault: config.fallbackToDefault ?? true,
			supportedLocales: config.supportedLocales ?? [],
			messages: config.messages ?? {},
			messagesDir: config.messagesDir ?? "",
			detectQueryKey: config.detectQueryKey ?? "lang",
			detectCookieKey: config.detectCookieKey ?? "lang",
		};

		@Module({
			providers: [
				{
					provide: I18nService,
					useFactory: () => {
						const svc = new I18nService({
							defaultLocale: fullConfig.defaultLocale,
							fallback: fullConfig.fallback,
							fallbackToDefault: fullConfig.fallbackToDefault,
							supportedLocales: fullConfig.supportedLocales,
						});
						if (fullConfig.messages) {
							svc.setMessages(fullConfig.messages as MessageCatalog);
						}
						if (fullConfig.messagesDir) {
							loadFromDir(svc, fullConfig.messagesDir);
						}
						return svc;
					},
				},
				{ provide: I18N_SERVICE_TOKEN, useExisting: I18nService },
				{ provide: "I18N_CONFIG", useValue: fullConfig },
			],
			exports: [I18nService, I18N_SERVICE_TOKEN, "I18N_CONFIG"],
		})
		class ConfiguredI18nModule {
			constructor(@Inject(I18N_SERVICE_TOKEN) readonly service: I18nService) {}

			/** Returns a Hono middleware bound to the configured service. */
			middleware() {
				return i18nMiddleware(this.service, {
					queryKey: fullConfig.detectQueryKey,
					cookieKey: fullConfig.detectCookieKey,
				});
			}
		}
		Object.defineProperty(ConfiguredI18nModule, "name", {
			value: "ConfiguredI18nModule",
		});

		// Add static `install` helper.
		(ConfiguredI18nModule as unknown as { install: (app: Application) => void }).install = (
			app: Application,
		) => {
			// Lazy: the module is constructed when the app boots.
			// The user typically accesses the middleware via
			// `app.i18nMiddleware()` instead.
			void app;
		};

		return ConfiguredI18nModule as unknown as typeof ConfiguredI18nModule & {
			readonly config: typeof fullConfig;
		};
	}
}

/* ------------------------------------------------------------------ *
 * Loader: messages from disk
 * ------------------------------------------------------------------ */

function loadFromDir(svc: I18nService, dir: string): void {
	// Lazy-import `node:fs` so this module is edge-safe.
	let fs: typeof import("node:fs");
	let path: typeof import("node:path");
	try {
		fs = require("node:fs");
		path = require("node:path");
	} catch {
		throw new Error(
			"I18nModule messagesDir requires a Node-like runtime. " +
				"On Cloudflare Workers, register messages programmatically " +
				"via I18nModule.forRoot({ messages: {...} }).",
		);
	}

	const stat = fs.statSync(dir);
	if (!stat.isDirectory()) {
		throw new Error(`I18nModule messagesDir is not a directory: ${dir}`);
	}
	for (const file of fs.readdirSync(dir)) {
		if (!file.endsWith(".json")) continue;
		const locale = file.replace(/\.json$/, "");
		const content = fs.readFileSync(path.join(dir, file), "utf8");
		try {
			const dict = JSON.parse(content);
			svc.addMessages(locale, dict);
		} catch (err) {
			throw new Error(
				`I18nModule: failed to parse ${file}: ${(err as Error).message}`,
			);
		}
	}
}
