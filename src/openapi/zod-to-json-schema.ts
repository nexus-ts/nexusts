/**
 * `zodToJsonSchema` — convert a Zod schema to an OpenAPI-compatible
 * JSON Schema. Zero dependencies, supports the Zod patterns that
 * show up in real APIs:
 *
 *   - primitives (string / number / integer / boolean / null)
 *   - literal, enum, nativeEnum
 *   - object (with required / optional / nullable fields)
 *   - array / tuple
 *   - union / discriminatedUnion
 *   - optional / nullable / default
 *   - record / map
 *   - format inference (email, uuid, url, datetime, ...)
 *   - min / max / length / regex constraints
 *
 * Limitations (by design):
 *   - transforms / pipes / preprocess: not represented
 *   - branded types: erased
 *   - recursive schemas: pass `$ref` manually via `setRefName`
 *
 * For richer support, pre-compute a `JSONSchema` and pass it via
 * the decorator's `schema` field; this converter is a convenience,
 * not a complete codegen.
 */

import type { JSONSchema } from "./types.js";

/**
 * Convert a Zod schema (or any value that quacks like one) to a
 * JSON Schema object.
 */
export function zodToJsonSchema(
	schema: unknown,
	opts: { $defs?: Record<string, JSONSchema>; visited?: WeakSet<object> } = {},
): JSONSchema {
	const defs = opts.$defs ?? {};
	const visited = opts.visited ?? new WeakSet<object>();
	if (visited.has(schema as object)) {
		// Recursive schema — fall back to `{}` so we don't infinite-loop.
		return {};
	}
	if (typeof schema === "object" && schema !== null) {
		visited.add(schema as object);
	}

	const def = readDef(schema);

	// Primitives
	if (def.typeName === "ZodString") return convertString(def);
	if (def.typeName === "ZodNumber") return convertNumber(def);
	if (def.typeName === "ZodBigInt") return { type: "integer", format: "int64" };
	if (def.typeName === "ZodBoolean") return { type: "boolean" };
	if (def.typeName === "ZodDate") return { type: "string", format: "date-time" };
	if (def.typeName === "ZodNull") return { type: "null" };
	if (def.typeName === "ZodUndefined") return { not: {} };
	if (def.typeName === "ZodAny") return {};
	if (def.typeName === "ZodUnknown") return {};
	if (def.typeName === "ZodNever") return { not: {} };

	if (def.typeName === "ZodLiteral") {
		const v = (def as { value: unknown }).value;
		return { type: jsonTypeOf(v) as JSONSchema["type"], enum: [v] };
	}

	if (def.typeName === "ZodEnum") {
		const values = (def as { values: ReadonlyArray<string | number> }).values;
		const t = values.every((v) => typeof v === "number") ? "number" : "string";
		return { type: t as JSONSchema["type"], enum: [...values] };
	}

	if (def.typeName === "ZodNativeEnum") {
		const values = (def as { values: Record<string, string | number> }).values;
		const entries = Object.entries(values).filter(
			([k, v]) => typeof v !== "number" || isNaN(Number(k)),
		);
		const opts = entries.map(([, v]) => v);
		const t = opts.every((v) => typeof v === "number") ? "number" : "string";
		return { type: t as JSONSchema["type"], enum: opts };
	}

	if (def.typeName === "ZodObject") {
		return convertObject(schema, def, defs, visited);
	}

	if (def.typeName === "ZodArray") {
		return convertArray(schema, def, defs, visited);
	}

	if (def.typeName === "ZodTuple") {
		const items = (def as { items: unknown[] }).items;
		return {
			type: "array",
			prefixItems: items.map((s) => zodToJsonSchema(s, { $defs: defs, visited })),
			minItems: items.length,
			maxItems: items.length,
		};
	}

	if (def.typeName === "ZodUnion" || def.typeName === "ZodDiscriminatedUnion") {
		const options = (def as { options?: unknown[]; optionsArray?: unknown[] }).options
			?? (def as { optionsArray?: unknown[] }).optionsArray
			?? [];
		return {
			oneOf: options.map((s) => zodToJsonSchema(s, { $defs: defs, visited })),
		};
	}

	if (def.typeName === "ZodDiscriminatedUnion") {
		const discriminator = (def as { discriminator?: string }).discriminator;
		const options = (def as { options?: unknown[] }).options ?? [];
		const mapping: Record<string, JSONSchema> = {};
		for (const opt of options) {
			const od = readDef(opt);
			if (od.typeName === "ZodObject") {
				const shape = (od as { shape: () => Record<string, unknown> }).shape();
				const disc = shape[discriminator ?? ""] as { value: unknown } | undefined;
				if (disc && "value" in disc) {
					mapping[String(disc.value)] = zodToJsonSchema(opt, { $defs: defs, visited });
				}
			}
		}
		return {
			oneOf: Object.values(mapping),
			discriminator: { propertyName: discriminator ?? "type" },
		} as JSONSchema;
	}

	if (def.typeName === "ZodIntersection") {
		const left = (def as { _def?: { left: unknown; right: unknown } })._def?.left
			?? (def as { left: unknown }).left;
		const right = (def as { _def?: { left: unknown; right: unknown } })._def?.right
			?? (def as { right: unknown }).right;
		return {
			allOf: [
				zodToJsonSchema(left, { $defs: defs, visited }),
				zodToJsonSchema(right, { $defs: defs, visited }),
			],
		};
	}

	if (def.typeName === "ZodRecord") {
		const valueType = (def as { valueType: unknown }).valueType;
		return {
			type: "object",
			additionalProperties: zodToJsonSchema(valueType, { $defs: defs, visited }),
		};
	}

	if (def.typeName === "ZodMap") {
		const valueType = (def as { valueType: unknown }).valueType;
		return {
			type: "object",
			additionalProperties: zodToJsonSchema(valueType, { $defs: defs, visited }),
		};
	}

	if (def.typeName === "ZodOptional") {
		const inner = (def as { innerType: unknown }).innerType;
		return zodToJsonSchema(inner, { $defs: defs, visited });
	}

	if (def.typeName === "ZodNullable") {
		const inner = (def as { innerType: unknown }).innerType;
		return {
			...zodToJsonSchema(inner, { $defs: defs, visited }),
			nullable: true,
		};
	}

	if (def.typeName === "ZodDefault") {
		const inner = (def as { innerType: unknown; defaultValue: () => unknown }).innerType;
		const dv = (def as { defaultValue: () => unknown }).defaultValue;
		return {
			...zodToJsonSchema(inner, { $defs: defs, visited }),
			default: safeCall(dv),
		};
	}

	if (def.typeName === "ZodCatch") {
		const inner = (def as { innerType: unknown }).innerType;
		return zodToJsonSchema(inner, { $defs: defs, visited });
	}

	if (def.typeName === "ZodBranded") {
		const inner = (def as { type: unknown }).type;
		return zodToJsonSchema(inner, { $defs: defs, visited });
	}

	if (def.typeName === "ZodReadonly") {
		const inner = (def as { innerType: unknown }).innerType;
		return zodToJsonSchema(inner, { $defs: defs, visited });
	}

	if (def.typeName === "ZodLazy") {
		const getter = (def as { getter: () => unknown }).getter;
		const inner = safeCall(getter);
		return zodToJsonSchema(inner, { $defs: defs, visited });
	}

	if (def.typeName === "ZodEffects") {
		const inner = (def as { source?: unknown; schema?: unknown; innerType?: unknown }).source
			?? (def as { schema?: unknown }).schema
			?? (def as { innerType?: unknown }).innerType;
		return zodToJsonSchema(inner, { $defs: defs, visited });
	}

	if (def.typeName === "ZodPipeline") {
		const inner = (def as { out: unknown }).out;
		return zodToJsonSchema(inner, { $defs: defs, visited });
	}

	if (def.typeName === "ZodFunction") return { type: "null" };
	if (def.typeName === "ZodPromise") {
		const inner = (def as { innerType: unknown }).innerType;
		return zodToJsonSchema(inner, { $defs: defs, visited });
	}

	// Fallback: emit a permissive object schema so the spec is at least
	// structurally valid. The user can refine by passing an explicit
	// `schema: {...}` on the decorator.
	return {};
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

type ZodDef = Record<string, unknown>;

function readDef(schema: unknown): ZodDef {
	if (typeof schema !== "object" || schema === null) return { typeName: "" };
	// Zod 3 / 3.25: stores everything under `_def`.
	const s = schema as { _def?: ZodDef };
	if (s._def && typeof s._def === "object") return s._def;
	// Fallback: top-level access (some forks).
	return s as ZodDef;
}

function convertString(def: ZodDef): JSONSchema {
	const out: JSONSchema = { type: "string" };
	const checks = (def.checks ?? []) as Array<{ kind: string; value?: unknown; regex?: { source: string; flags?: string } }>;
	for (const c of checks) {
		switch (c.kind) {
			case "email": out.format = "email"; break;
			case "url": out.format = "uri"; break;
			case "uuid": out.format = "uuid"; break;
			case "cuid":
			case "cuid2": out.format = "cuid"; break;
			case "emoji": break;
			case "ip": out.format = "ipv4"; break;
			case "cidr": out.format = "cidr"; break;
			case "datetime": out.format = "date-time"; break;
			case "date": out.format = "date"; break;
			case "time": out.format = "time"; break;
			case "duration": break;
			case "min":
			case "length": out.minLength = Number(c.value); break;
			case "max": out.maxLength = Number(c.value); break;
			case "regex": if (c.regex) out.pattern = c.regex.source; break;
			case "trim":
			case "toLowerCase":
			case "toUpperCase":
			case "startsWith":
			case "endsWith":
			case "includes":
				// No JSON Schema equivalent; ignore.
				break;
		}
	}
	return out;
}

function convertNumber(def: ZodDef): JSONSchema {
	const out: JSONSchema = { type: "number" };
	const checks = (def.checks ?? []) as Array<{ kind: string; value?: number }>;
	let isInt = false;
	for (const c of checks) {
		switch (c.kind) {
			case "int":
			case "safeint": isInt = true; break;
			case "min": out.minimum = c.value; break;
			case "max": out.maximum = c.value; break;
			case "finite":
			case "multipleOf":
				// `multipleOf` accepts arbitrary numbers; we skip the
				// stricter check that the value is present.
				break;
		}
	}
	if (isInt) out.type = "integer";
	return out;
}

function convertObject(
	_schema: unknown,
	def: ZodDef,
	defs: Record<string, JSONSchema>,
	visited: WeakSet<object>,
): JSONSchema {
	const shapeFn = (def as { shape?: unknown }).shape;
	const shape = typeof shapeFn === "function" ? (shapeFn as () => Record<string, unknown>)() : shapeFn;
	const properties: Record<string, JSONSchema> = {};
	const required: string[] = [];
	const catchall = (def as { catchall?: unknown }).catchall;
	if (shape && typeof shape === "object") {
		for (const [key, value] of Object.entries(shape)) {
			const child = zodToJsonSchema(value, { $defs: defs, visited });
			const childDef = readDef(value);
			// Zod: optional / nullable / default are NOT in `required`.
			const isOptional =
				childDef.typeName === "ZodOptional" ||
				childDef.typeName === "ZodDefault" ||
				childDef.typeName === "ZodCatch";
			properties[key] = child;
			if (!isOptional) required.push(key);
		}
	}
	const description = (def as { description?: string }).description;
	const out: JSONSchema = { type: "object", properties };
	if (required.length > 0) out.required = required;
	if (typeof catchall === "object" && catchall !== null) {
		const c = readDef(catchall);
		// `ZodNever` catchall = strict; `ZodAny`/`ZodUnknown` = passthrough.
		if (c.typeName === "ZodNever") out.additionalProperties = false;
		else out.additionalProperties = true;
	}
	if (description) out.description = description;
	return out;
}

function convertArray(
	_schema: unknown,
	def: ZodDef,
	defs: Record<string, JSONSchema>,
	visited: WeakSet<object>,
): JSONSchema {
	const out: JSONSchema = { type: "array" };
	const element = (def as { element?: unknown; type?: unknown }).element
		?? (def as { type?: unknown }).type;
	if (element) out.items = zodToJsonSchema(element, { $defs: defs, visited });
	const checks = (def as { minLength?: { value: number }; maxLength?: { value: number } });
	if (checks.minLength?.value != null) out.minItems = checks.minLength.value;
	if (checks.maxLength?.value != null) out.maxItems = checks.maxLength.value;
	return out;
}

function jsonTypeOf(v: unknown): "string" | "number" | "boolean" | "object" | "null" {
	if (v === null) return "null";
	if (typeof v === "string") return "string";
	if (typeof v === "number") return "number";
	if (typeof v === "boolean") return "boolean";
	return "object";
}

function safeCall<T>(fn: unknown): T {
	try {
		return (fn as () => T)();
	} catch {
		return undefined as unknown as T;
	}
}