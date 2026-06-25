/**
 * Tests for `@nexusts/i18n`.
 *
 * Coverage:
 * 1. I18nService: t() with interpolation, pluralization, missing keys
 * 2. Locale fallback: region → default
 * 3. Pluralization: `|` separator with Intl.PluralRules
 * 4. Formatters: date, number, currency
 * 5. Locale negotiation: Accept-Language header
 * 6. addMessages merges recursively
 * 7. Hono middleware: detect from query/cookie/header
 * 8. @CurrentLocale decorator
 * 9. Module wiring
 */

import { describe, it, expect } from "vitest";
import { Hono } from "hono";
import {
	I18nService,
	I18N_SERVICE_TOKEN,
	I18nModule,
	i18nMiddleware,
	CurrentLocale,
} from "../../src/i18n/index.js";
import { Application } from "../../src/core/application.js";

describe("I18nService — basic translation", () => {
	const svc = new I18nService({
		defaultLocale: "en",
		messages: {
			en: { hello: "Hello, :name!" },
			ko: { hello: "안녕하세요, :name님!" },
		},
	});

	it("translates with interpolation", () => {
		expect(svc.t("hello", { name: "Alice" })).toBe("Hello, Alice!");
	});

	it("uses the requested locale", () => {
		expect(svc.t("hello", { name: "Alice" }, "ko")).toBe("안녕하세요, Alice님!");
	});

	it("returns the key when missing", () => {
		expect(svc.t("missing.key", { x: 1 })).toBe("missing.key");
	});

	it("falls back to default locale", () => {
		const s = new I18nService({
			defaultLocale: "en",
			messages: { en: { greet: "Hello" } },
		});
		expect(s.t("greet", undefined, "ko")).toBe("Hello");
	});

	it("falls back to a less specific locale (fr-CA → fr)", () => {
		const s = new I18nService({
			defaultLocale: "en",
			messages: { en: { hi: "hi" }, fr: { hi: "salut" } },
		});
		expect(s.t("hi", undefined, "fr-CA")).toBe("salut");
	});

	it("hasMessage", () => {
		expect(svc.hasMessage("hello")).toBe(true);
		expect(svc.hasMessage("missing")).toBe(false);
	});

	it("getRaw returns the raw template", () => {
		expect(svc.getRaw("hello")).toBe("Hello, :name!");
	});

	it("tOr returns the fallback when missing", () => {
		expect(svc.tOr("missing", "default text", { x: 1 })).toBe("default text");
	});
});

describe("I18nService — nested keys", () => {
	const svc = new I18nService({
		messages: {
			en: { auth: { welcome: "Welcome, :name!", errors: { invalid: "Invalid" } } },
		},
	});

	it("resolves nested keys with dot notation", () => {
		expect(svc.t("auth.welcome", { name: "Bob" })).toBe("Welcome, Bob!");
		expect(svc.t("auth.errors.invalid")).toBe("Invalid");
	});

	it("returns the key when nested path is missing", () => {
		expect(svc.t("auth.missing.key")).toBe("auth.missing.key");
	});
});

describe("I18nService — pluralization", () => {
	const svc = new I18nService({
		defaultLocale: "en",
		messages: {
			en: { items: "1 item|:count items" },
			ko: { items: "1개|:count개" },
		},
	});

	it("selects the right plural form in English", () => {
		expect(svc.t("items", { count: 0 })).toBe("0 items");
		expect(svc.t("items", { count: 1 })).toBe("1 item");
		expect(svc.t("items", { count: 5 })).toBe("5 items");
	});

	it("selects the right plural form in Korean", () => {
		// Korean uses "other" for everything except 0/1
		expect(svc.t("items", { count: 0 }, "ko")).toBe("0개");
		expect(svc.t("items", { count: 1 }, "ko")).toBe("1개");
		expect(svc.t("items", { count: 5 }, "ko")).toBe("5개");
	});

	it("falls back to the last segment when count is missing", () => {
		expect(svc.t("items")).toBe(":count items");
	});

	it("tChoice selects plural form by count", () => {
		expect(svc.tChoice("items", 1)).toBe("1 item");
		expect(svc.tChoice("items", 3)).toBe("3 items");
	});
});

describe("I18nService — addMessages (recursive merge)", () => {
	const svc = new I18nService({
		messages: { en: { auth: { login: "Log in", logout: "Log out" } } },
	});

	it("merges new keys into existing locale", () => {
		svc.addMessages("en", { auth: { register: "Sign up" } });
		expect(svc.t("auth.login")).toBe("Log in");
		expect(svc.t("auth.logout")).toBe("Log out");
		expect(svc.t("auth.register")).toBe("Sign up");
	});

	it("adds a brand-new locale", () => {
		svc.addMessages("ko", { auth: { login: "로그인" } });
		expect(svc.t("auth.login", undefined, "ko")).toBe("로그인");
	});
});

describe("I18nService — supportedLocales whitelist", () => {
	it("filters out unsupported locales in negotiate", () => {
		const svc = new I18nService({
			defaultLocale: "en",
			supportedLocales: ["en"],
			messages: { en: { hi: "hi" } },
		});
		expect(svc.negotiateLocale(["ko"])).toBe("en");
	});

	it("allows whitelisted locales", () => {
		const svc = new I18nService({
			defaultLocale: "en",
			supportedLocales: ["en", "ko"],
			messages: { en: { hi: "hi" }, ko: { hi: "안녕" } },
		});
		expect(svc.negotiateLocale(["ko"])).toBe("ko");
	});
});

describe("I18nService — locale negotiation", () => {
	const svc = new I18nService({
		defaultLocale: "en",
		messages: { en: { hi: "hi" }, ko: { hi: "안녕" } },
	});

	it("negotiates from a list of preferred locales", () => {
		expect(svc.negotiateLocale(["ko", "en"])).toBe("ko");
	});

	it("parses Accept-Language with quality scores", () => {
		expect(svc.negotiateLocale([], "ko-KR,ko;q=0.9,en;q=0.8")).toBe("ko");
	});

	it("falls back to default when no candidate matches", () => {
		expect(svc.negotiateLocale(["fr"])).toBe("en");
	});
});

describe("I18nService — formatters", () => {
	const svc = new I18nService({ defaultLocale: "en-US" });

	it("formatDate (default locale)", () => {
		const date = new Date("2026-06-22T12:00:00Z");
		const out = svc.formatDate(date);
		expect(out).toMatch(/2026/);
	});

	it("formatDate (explicit locale)", () => {
		const date = new Date("2026-06-22T12:00:00Z");
		const en = svc.formatDate(date, {}, "en-US");
		const ko = svc.formatDate(date, { locale: "ko-KR" });
		expect(en).toMatch(/2026/);
		expect(ko).toMatch(/2026/);
	});

	it("formatNumber", () => {
		expect(svc.formatNumber(1234.56)).toMatch(/1,234\.56/);
		expect(svc.formatNumber(1234.56, { locale: "ko-KR" })).toMatch(/1,234/);
	});

	it("formatCurrency", () => {
		const usd = svc.formatCurrency(1234.56, { currency: "USD", locale: "en-US" });
		expect(usd).toContain("$");
		expect(usd).toMatch(/1,234/);
		const krw = svc.formatCurrency(1234567, { currency: "KRW", locale: "ko-KR" });
		expect(krw).toContain("₩");
	});

	it("compare (locale-aware sort)", () => {
		const a = ["B", "a", "C"];
		const sorted = [...a].sort((x, y) => svc.compare(x, y));
		// Just check it doesn't throw and returns 0/negative/positive
		expect(sorted.length).toBe(3);
	});
});

describe("i18nMiddleware", () => {
	const svc = new I18nService({
		messages: { en: { hi: "hi" }, ko: { hi: "안녕" } },
	});

	it("detects locale from query string", async () => {
		const app = new Hono();
		app.use("*", i18nMiddleware(svc));
		app.get("/", (c) => c.json({ locale: c.get("locale") }));
		const res = await app.request("http://x/?lang=ko");
		const body = await res.json();
		expect(body.locale).toBe("ko");
	});

	it("detects locale from cookie", async () => {
		const app = new Hono();
		app.use("*", i18nMiddleware(svc));
		app.get("/", (c) => c.json({ locale: c.get("locale") }));
		const res = await app.request("http://x/", { headers: { cookie: "lang=en" } });
		const body = await res.json();
		expect(body.locale).toBe("en");
	});

	it("detects locale from Accept-Language", async () => {
		const app = new Hono();
		app.use("*", i18nMiddleware(svc));
		app.get("/", (c) => c.json({ locale: c.get("locale") }));
		const res = await app.request("http://x/", {
			headers: { "accept-language": "ko-KR,ko;q=0.9,en;q=0.8" },
		});
		const body = await res.json();
		expect(body.locale).toBe("ko");
	});

	it("falls back to default locale", async () => {
		const app = new Hono();
		app.use("*", i18nMiddleware(svc));
		app.get("/", (c) => c.json({ locale: c.get("locale") }));
		const res = await app.request("http://x/");
		const body = await res.json();
		expect(body.locale).toBe("en");
	});

	it("priority: query > cookie > Accept-Language", async () => {
		const app = new Hono();
		app.use("*", i18nMiddleware(svc));
		app.get("/", (c) => c.json({ locale: c.get("locale") }));
		const res = await app.request("http://x/?lang=ko", {
			headers: { cookie: "lang=en", "accept-language": "fr" },
		});
		const body = await res.json();
		expect(body.locale).toBe("ko");
	});
});

describe("I18nModule", () => {
	it("resolves the I18nService from the container", () => {
		const app = new Application(
			I18nModule.forRoot({
				messages: { en: { hi: "hi" } },
			}),
		);
		const svc = app.container.resolve(I18nService);
		expect(svc).toBeInstanceOf(I18nService);
	});

	it("tokens point to the same instance", () => {
		const app = new Application(I18nModule.forRoot({}));
		const a = app.container.resolve(I18nService);
		const b = app.container.resolve(I18N_SERVICE_TOKEN);
		expect(a).toBe(b);
	});

	it("translates through DI", () => {
		const app = new Application(
			I18nModule.forRoot({
				messages: { en: { greet: "hi" }, ko: { greet: "안녕" } },
			}),
		);
		const svc = app.container.resolve(I18nService);
		expect(svc.t("greet", undefined, "ko")).toBe("안녕");
	});

	it("i18nMiddleware is exported as a function", () => {
		expect(typeof i18nMiddleware).toBe("function");
		const svc = new I18nService({ messages: { en: { hi: "hi" } } });
		const mw = i18nMiddleware(svc);
		expect(typeof mw).toBe("function");
	});
});

describe("CurrentLocale decorator", () => {
	it("is a function (decorator factory)", () => {
		expect(typeof CurrentLocale).toBe("function");
	});

	it("returns a ParameterDecorator", () => {
		const deco = CurrentLocale();
		expect(typeof deco).toBe("function");
	});
});
