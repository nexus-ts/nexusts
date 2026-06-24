/**
 * `I18nService` — locale-aware translation + formatting.
 *
 * Usage:
 *
 *   const i18n = new I18nService({
 *     defaultLocale: "en",
 *     messages: {
 *       en: { hello: "Hello, :name!" },
 *       ko: { hello: "안녕하세요, :name님!" },
 *     },
 *   });
 *
 *   i18n.t("hello", { name: "Alice" });              // → "Hello, Alice!"
 *   i18n.t("hello", { name: "Alice" }, "ko");       // → "안녕하세요, Alice님!"
 *
 * The service is registered as a DI singleton by
 * `I18nModule.forRoot(config)`. The Hono middleware (built-in)
 * extracts the locale from the request and stores it in the
 * request context. Controllers can read it via the
 * `@CurrentLocale()` decorator.
 *
 * Message format:
 *
 *   "auth.welcome": "Welcome, :name!"            # interpolation
 *   "items.count":  "no items|:count items"      # pluralization (| separator)
 *   "deep.key":     "value"                       # nested lookup
 *
 * The plural-form separator uses `Intl.PluralRules` to pick the
 * right form. The number of `|` segments is configurable per
 * locale via the `pluralCategories()` helper.
 *
 * Locale fallback chain:
 *   - Exact match (`fr-CA`)
 *   - Region fallback (`fr`)
 *   - Default locale
 */

import type {
	CurrencyFormatOptions,
	DateFormatOptions,
	Locale,
	MessageCatalog,
	MessageDict,
	NumberFormatOptions,
	PluralCategory,
	TranslateArgs,
} from "./types.js";

const DEFAULT_PLURAL_CATEGORIES: PluralCategory[] = [
	"zero",
	"one",
	"two",
	"few",
	"many",
	"other",
];

export const I18N_SERVICE_TOKEN = Symbol.for("nexus:I18nService");

export class I18nService {
	private messages: MessageCatalog = {};
	private defaultLocale: Locale;
	private fallback: boolean;
	private fallbackToDefault: boolean;
	private supportedLocales: Set<Locale> | null = null;
	/** Cached `Intl.PluralRules` per locale. */
	private pluralRulesCache = new Map<Locale, Intl.PluralRules>();
	/** Cached `Intl.DateTimeFormat` per (locale, options) key. */
	private dateFormatCache = new Map<string, Intl.DateTimeFormat>();
	/** Cached `Intl.NumberFormat` per (locale, options) key. */
	private numberFormatCache = new Map<string, Intl.NumberFormat>();
	/** Cached `Intl.Collator` per locale. */
	private collatorCache = new Map<Locale, Intl.Collator>();

	constructor(config: {
		defaultLocale?: Locale;
		fallback?: boolean;
		fallbackToDefault?: boolean;
		supportedLocales?: Locale[];
		messages?: MessageCatalog;
	} = {}) {
		this.defaultLocale = config.defaultLocale ?? "en";
		this.fallback = config.fallback ?? true;
		this.fallbackToDefault = config.fallbackToDefault ?? true;
		if (config.supportedLocales && config.supportedLocales.length > 0) {
			this.supportedLocales = new Set(config.supportedLocales);
		}
		if (config.messages) {
			for (const [locale, dict] of Object.entries(config.messages)) {
				this.addMessages(locale, dict);
			}
		}
	}

	/* ---------------- messages ---------------- */

	/**
	 * Add (or merge) messages for a locale. Nested dicts are merged
	 * recursively — so you can call `addMessages` multiple times
	 * for the same locale.
	 */
	addMessages(locale: Locale, dict: MessageDict): void {
		const existing = this.messages[locale] ?? {};
		this.messages[locale] = mergeDict(existing, dict);
	}

	/** Replace the entire message catalog. */
	setMessages(catalog: MessageCatalog): void {
		this.messages = {};
		for (const [locale, dict] of Object.entries(catalog)) {
			this.addMessages(locale, dict);
		}
	}

	/** True if a message key exists in the given locale. */
	hasMessage(key: string, locale: Locale = this.defaultLocale): boolean {
		return resolveKey(this.messages[locale], key) !== undefined;
	}

	/** Get a raw message string (with no interpolation or pluralization). */
	getRaw(key: string, locale: Locale = this.defaultLocale): string | undefined {
		const value = resolveKey(this.messages[locale], key);
		return typeof value === "string" ? value : undefined;
	}

	/* ---------------- translation ---------------- */

	/**
	 * Translate a key.
	 *
	 * - `args` interpolates `:name`-style placeholders.
	 * - If the value contains `|` segments, the appropriate plural
	 *   form is selected based on `args.count` (or the first
	 *   numeric arg).
	 * - `locale` defaults to the configured default locale. Pass
	 *   an explicit locale to override.
	 *
	 * If the key is missing in `locale`, the service falls back to
	 * the default locale (if `fallbackToDefault` is true) and then
	 * to the key itself (so the developer sees what's missing).
	 */
	t(
		key: string,
		args?: TranslateArgs,
		locale: Locale = this.defaultLocale,
	): string {
		const raw = this.lookupRaw(key, locale);
		if (raw === undefined) {
			// Key not found. Return the key itself, optionally
			// bracketed, so the developer can spot it.
			return key;
		}
		return this.format(raw, args, locale);
	}

	/**
	 * Translate a key; if not found, return the fallback string
	 * (no `[]` brackets). Useful for optional UI text.
	 */
	tOr(
		key: string,
		fallback: string,
		args?: TranslateArgs,
		locale: Locale = this.defaultLocale,
	): string {
		const raw = this.lookupRaw(key, locale);
		if (raw === undefined) return this.format(fallback, args, locale);
		return this.format(raw, args, locale);
	}

	/**
	 * Translate a key with explicit plural control. The `count`
	 * argument is used to select the plural form.
	 */
	tChoice(
		key: string,
		count: number,
		args: TranslateArgs = {},
		locale: Locale = this.defaultLocale,
	): string {
		return this.t(key, { ...args, count }, locale);
	}

	/**
	 * Format a raw message template with args (interpolation +
	 * plural selection). Exposed for users who want to format
	 * messages outside the catalog.
	 */
	format(template: string, args: TranslateArgs = {}, locale: Locale = this.defaultLocale): string {
		// 1. Select plural form (if any)
		const selected = this.selectPluralForm(template, args, locale);
		// 2. Interpolate :name placeholders
		return this.interpolate(selected, args);
	}

	/* ---------------- pluralization ---------------- */

	/**
	 * Return the plural category for `count` in the given locale.
	 * Wraps `Intl.PluralRules`.
	 */
	pluralCategory(count: number, locale: Locale = this.defaultLocale): PluralCategory {
		const rules = this.getPluralRules(locale);
		return rules.select(count) as PluralCategory;
	}

	/* ---------------- formatters ---------------- */

	formatDate(
		date: Date | number | string,
		options: DateFormatOptions = {},
		locale?: Locale,
	): string {
		const useLocale = options.locale ?? locale ?? this.defaultLocale;
		const key = `${useLocale}|${stableStringify(options)}`;
		let fmt = this.dateFormatCache.get(key);
		if (!fmt) {
			fmt = new Intl.DateTimeFormat(useLocale, options);
			this.dateFormatCache.set(key, fmt);
		}
		return fmt.format(typeof date === "string" ? new Date(date) : new Date(date));
	}

	formatNumber(
		value: number,
		options: NumberFormatOptions = {},
		locale?: Locale,
	): string {
		const useLocale = options.locale ?? locale ?? this.defaultLocale;
		const key = `${useLocale}|${stableStringify(options)}`;
		let fmt = this.numberFormatCache.get(key);
		if (!fmt) {
			fmt = new Intl.NumberFormat(useLocale, options);
			this.numberFormatCache.set(key, fmt);
		}
		return fmt.format(value);
	}

	formatCurrency(
		amount: number,
		options: CurrencyFormatOptions,
		locale?: Locale,
	): string {
		const useLocale = options.locale ?? locale ?? this.defaultLocale;
		const { locale: _omit, ...opts } = options;
		const key = `${useLocale}|${stableStringify(opts)}`;
		let fmt = this.numberFormatCache.get(key);
		if (!fmt) {
			fmt = new Intl.NumberFormat(useLocale, { style: "currency", ...opts });
			this.numberFormatCache.set(key, fmt);
		}
		return fmt.format(amount);
	}

	/**
	 * Compare two strings using locale-aware ordering.
	 * Returns negative if a < b, positive if a > b, 0 if equal.
	 */
	compare(a: string, b: string, locale: Locale = this.defaultLocale): number {
		let c = this.collatorCache.get(locale);
		if (!c) {
			c = new Intl.Collator(locale);
			this.collatorCache.set(locale, c);
		}
		return c.compare(a, b);
	}

	/* ---------------- locales ---------------- */

	getDefaultLocale(): Locale {
		return this.defaultLocale;
	}

	/** Locales currently registered (in the catalog). */
	getLocales(): Locale[] {
		return Object.keys(this.messages);
	}

	/** True if the locale is in the supported set (or all are allowed). */
	isSupported(locale: Locale): boolean {
		if (!this.supportedLocales) return true;
		return this.supportedLocales.has(locale);
	}

	/** Negotiate a locale from a list of candidates. */
	negotiateLocale(
		preferred: Locale[] = [],
		acceptLanguage?: string,
	): Locale {
		// Combine preferred (in order) with Accept-Language (sorted by
		// quality). Preferred wins because the caller may have already
		// applied query/cookie priorities.
		const candidates: Locale[] = [...preferred];
		if (acceptLanguage) {
			for (const tag of parseAcceptLanguage(acceptLanguage)) {
				if (!candidates.includes(tag)) candidates.push(tag);
			}
		}
		for (const cand of candidates) {
			if (this.isSupported(cand) && this.messages[cand]) return cand;
			if (this.fallback) {
				const lang = cand.split("-")[0];
				if (lang && lang !== cand && this.isSupported(lang) && this.messages[lang]) {
					return lang;
				}
			}
		}
		return this.defaultLocale;
	}

	/* ---------------- internals ---------------- */

	private lookupRaw(key: string, locale: Locale): string | undefined {
		// 1. Exact match
		const v = resolveKey(this.messages[locale], key);
		if (typeof v === "string") return v;

		// 2. Region fallback
		if (this.fallback) {
			const lang = locale.split("-")[0];
			if (lang && lang !== locale) {
				const v2 = resolveKey(this.messages[lang], key);
				if (typeof v2 === "string") return v2;
			}
		}

		// 3. Default-locale fallback
		if (this.fallbackToDefault && locale !== this.defaultLocale) {
			const v3 = resolveKey(this.messages[this.defaultLocale], key);
			if (typeof v3 === "string") return v3;
		}

		return undefined;
	}

	private selectPluralForm(
		template: string,
		args: TranslateArgs,
		locale: Locale,
	): string {
		if (!template.includes("|")) return template;
		const segments = template.split("|");
		if (segments.length === 1) return template;

		// Find a count in args
		const count = pickCount(args);
		if (count === undefined) {
			// No count → use the "other" form (last segment).
			return segments[segments.length - 1]!;
		}

		const category = this.pluralCategory(count, locale);
		const idx = this.pluralIndex(category, segments.length);
		return segments[idx]!;
	}

	private pluralIndex(category: PluralCategory, segmentCount: number): number {
		// Map plural category to a segment index. The number of
		// segments the user provides maps to CLDR categories as
		// follows (the AdonisJS / i18next convention):
		//   1 segment  → other
		//   2 segments → one | other
		//   3 segments → zero | one | other
		//   4 segments → zero | one | two | other
		//   5 segments → zero | one | two | few | other
		//   6 segments → zero | one | two | few | many | other
		// Categories not in the table (e.g. "few" with 3 segments)
		// fall back to the last segment ("other").
		if (segmentCount <= 1) return segmentCount - 1;
		// Build a mapping table.
		const table: Record<number, PluralCategory[]> = {
			2: ["one", "other"],
			3: ["zero", "one", "other"],
			4: ["zero", "one", "two", "other"],
			5: ["zero", "one", "two", "few", "other"],
			6: ["zero", "one", "two", "few", "many", "other"],
		};
		const cats = table[segmentCount] ?? ["other"];
		const i = cats.indexOf(category);
		if (i < 0) return segmentCount - 1;
		return i;
	}

	private getPluralRules(locale: Locale): Intl.PluralRules {
		let r = this.pluralRulesCache.get(locale);
		if (!r) {
			try {
				r = new Intl.PluralRules(locale);
			} catch {
				r = new Intl.PluralRules(this.defaultLocale);
			}
			this.pluralRulesCache.set(locale, r);
		}
		return r;
	}

	private interpolate(template: string, args: TranslateArgs): string {
		if (Object.keys(args).length === 0) return template;
		return template.replace(/:([A-Za-z_][A-Za-z0-9_]*)/g, (match, name: string) => {
			if (name in args) {
				return String(args[name]);
			}
			return match;
		});
	}
}

/* ------------------------------------------------------------------ *
 * Helpers
 * ------------------------------------------------------------------ */

function resolveKey(
	dict: MessageDict | undefined,
	key: string,
): string | MessageDict | undefined {
	if (!dict) return undefined;
	const parts = key.split(".");
	let cur: string | MessageDict | undefined = dict;
	for (const p of parts) {
		if (cur && typeof cur === "object" && p in (cur as MessageDict)) {
			cur = (cur as MessageDict)[p];
		} else {
			return undefined;
		}
	}
	return cur;
}

function mergeDict(target: MessageDict, source: MessageDict): MessageDict {
	const out: MessageDict = { ...target };
	for (const [k, v] of Object.entries(source)) {
		const existing = out[k];
		if (
			existing &&
			typeof existing === "object" &&
			!Array.isArray(existing) &&
			v &&
			typeof v === "object" &&
			!Array.isArray(v)
		) {
			out[k] = mergeDict(existing as MessageDict, v as MessageDict);
		} else {
			out[k] = v;
		}
	}
	return out;
}

function pickCount(args: TranslateArgs): number | undefined {
	if ("count" in args && typeof args.count === "number") return args.count;
	for (const v of Object.values(args)) {
		if (typeof v === "number") return v;
	}
	return undefined;
}

function parseAcceptLanguage(header: string): Locale[] {
	return header
		.split(",")
		.map((part) => {
			const [tag, qPart] = part.trim().split(";");
			const q = qPart?.startsWith("q=") ? Number(qPart.slice(2)) : 1;
			return { tag: tag?.trim() ?? "", q: isFinite(q) ? q : 1 };
		})
		.filter((e) => e.tag.length > 0)
		.sort((a, b) => b.q - a.q)
		.map((e) => e.tag);
}

function stableStringify(obj: object): string {
	return JSON.stringify(obj, (_k, v) => {
		if (v && typeof v === "object" && !Array.isArray(v)) {
			const sorted: Record<string, unknown> = {};
			for (const key of Object.keys(v).sort()) {
				sorted[key] = (v as Record<string, unknown>)[key];
			}
			return sorted;
		}
		return v;
	});
}
