/**
 * Minimal template engine for code generation.
 *
 * Supports:
 *   - `{{ key }}` substitution
 *   - `{{ key | filter }}` filters (upper/lower/pascal/camel/snake/kebab/plural/singular)
 *   - `{{# flag }} ... {{/ flag }}` truthy sections (include if `flag` is truthy)
 *   - `{{^ flag }} ... {{/ flag }}` falsy sections (include if `flag` is falsy)
 *   - dotted lookup (`{{ user.name }}`)
 *
 * Multi-line templates are fine; placeholders can span any whitespace.
 */

export type Filter =
	| "raw"
	| "upper"
	| "lower"
	| "pascal"
	| "camel"
	| "snake"
	| "kebab"
	| "plural"
	| "singular";

export type RenderValue = string | number | boolean | undefined | null | RenderObject;
export interface RenderObject { [key: string]: RenderValue }
export type RenderContext = RenderObject;

const VAR_RE = /\{\{\s*([\w.]+)(?:\s*\|\s*(\w+))?\s*\}\}/;
const SECTION_RE =
	/\{\{\s*([#^])\s*([\w.]+)\s*\}\}([\s\S]*?)\{\{\s*\/\s*\2\s*\}\}/g;

export function render(template: string, context: RenderContext): string {
	// 1. Expand sections (truthy / falsy).
	let out = template.replace(SECTION_RE, (_, kind: "#" | "^", key: string, body: string) => {
		const v = lookup(context, key);
		const truthy = isTruthy(v);
		if (kind === "#") return truthy ? body : "";
		return truthy ? "" : body;
	});

	// 2. Substitute variables (repeatedly, in case substitutions introduce
	//    more variables — unusual but safe).
	let prev: string;
	do {
		prev = out;
		out = out.replace(VAR_RE, (_, key: string, filter?: string) => {
			const v = lookup(context, key);
			return applyFilter(v === undefined || v === null ? "" : String(v), filter);
		});
	} while (out !== prev);

	return out;
}

function lookup(ctx: RenderContext, dotted: string): RenderValue {
	if (dotted in ctx) return ctx[dotted] as RenderValue;
	const parts = dotted.split(".");
	let cur: any = ctx;
	for (const p of parts) {
		if (cur == null || typeof cur !== "object") return undefined;
		cur = cur[p];
	}
	return cur === undefined || cur === null ? undefined : cur;
}

function isTruthy(v: RenderValue): boolean {
	if (v === undefined || v === null) return false;
	if (typeof v === "string") return v.length > 0 && v !== "false" && v !== "0";
	if (typeof v === "number") return v !== 0;
	if (typeof v === "boolean") return v;
	// Object → truthy if it has any keys.
	if (Array.isArray(v)) return v.length > 0;
	return Object.keys(v).length > 0;
}

function applyFilter(value: string, filter: string | undefined): string {
	switch (filter as Filter | undefined) {
		case undefined:
		case "raw":
			return value;
		case "upper":
			return value.toUpperCase();
		case "lower":
			return value.toLowerCase();
		case "pascal":
			return toPascal(value);
		case "camel":
			return toCamel(value);
		case "snake":
			return toSnake(value);
		case "kebab":
			return toKebab(value);
		case "plural":
			return pluralize(value);
		case "singular":
			return singularize(value);
		default:
			throw new Error(`Unknown template filter: ${filter}`);
	}
}

// ---------------------------------------------------------------------------
// Case-conversion helpers
// ---------------------------------------------------------------------------

function splitWords(s: string): string[] {
	return s
		.replace(/([a-z0-9])([A-Z])/g, "$1 $2")
		.split(/[\s_-]+/)
		.filter(Boolean);
}

export function toPascal(s: string): string {
	return splitWords(s)
		.map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
		.join("");
}

export function toCamel(s: string): string {
	const p = toPascal(s);
	return p.charAt(0).toLowerCase() + p.slice(1);
}

export function toSnake(s: string): string {
	return splitWords(s).map((w) => w.toLowerCase()).join("_");
}

export function toKebab(s: string): string {
	return splitWords(s).map((w) => w.toLowerCase()).join("-");
}

// ---------------------------------------------------------------------------
// Pluralization (English-only; matches Adonis/Rails conventions)
// ---------------------------------------------------------------------------

export function pluralize(s: string): string {
	if (!s) return s;
	if (/(s|x|z|ch|sh)$/i.test(s)) return `${s}es`;
	if (/[^aeiou]y$/i.test(s)) return `${s.slice(0, -1)}ies`;
	if (/y$/i.test(s)) return `${s}s`;
	return `${s}s`;
}

export function singularize(s: string): string {
	if (!s) return s;
	if (/(ses|xes|zes|ches|shes)$/i.test(s)) return s.slice(0, -2);
	if (/ies$/i.test(s)) return `${s.slice(0, -3)}y`;
	if (/s$/i.test(s) && s.length > 1) return s.slice(0, -1);
	return s;
}