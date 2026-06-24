/**
 * Tests for nexus/openapi — Zod → JSON Schema converter.
 */

import "reflect-metadata";
import { describe, expect, it } from "vitest";
import * as z from "zod/v3";
import { zodToJsonSchema } from "../../src/openapi/zod-to-json-schema.js";

describe("zodToJsonSchema · primitives", () => {
	it("converts string", () => {
		const s = zodToJsonSchema(z.string());
		expect(s).toEqual({ type: "string" });
	});

	it("converts number with constraints", () => {
		const s = zodToJsonSchema(z.number().min(0).max(100));
		expect(s).toEqual({ type: "number", minimum: 0, maximum: 100 });
	});

	it("converts integer (ZodInt)", () => {
		const s = zodToJsonSchema(z.number().int());
		expect(s.type).toBe("integer");
	});

	it("converts boolean", () => {
		expect(zodToJsonSchema(z.boolean())).toEqual({ type: "boolean" });
	});

	it("converts date as date-time string", () => {
		expect(zodToJsonSchema(z.date())).toEqual({ type: "string", format: "date-time" });
	});

	it("converts literal", () => {
		expect(zodToJsonSchema(z.literal("active"))).toEqual({ type: "string", enum: ["active"] });
	});

	it("converts enum", () => {
		const s = zodToJsonSchema(z.enum(["a", "b", "c"]));
		expect(s).toEqual({ type: "string", enum: ["a", "b", "c"] });
	});

	it("converts null", () => {
		expect(zodToJsonSchema(z.null())).toEqual({ type: "null" });
	});
});

describe("zodToJsonSchema · string formats", () => {
	it("email", () => {
		expect(zodToJsonSchema(z.string().email()).format).toBe("email");
	});
	it("uuid", () => {
		expect(zodToJsonSchema(z.string().uuid()).format).toBe("uuid");
	});
	it("url", () => {
		expect(zodToJsonSchema(z.string().url()).format).toBe("uri");
	});
	it("min / max length", () => {
		const s = zodToJsonSchema(z.string().min(2).max(50));
		expect(s).toEqual({ type: "string", minLength: 2, maxLength: 50 });
	});
	it("regex", () => {
		const s = zodToJsonSchema(z.string().regex(/^[a-z]+$/));
		expect(s.pattern).toBe("^[a-z]+$");
	});
});

describe("zodToJsonSchema · objects", () => {
	it("basic object with required fields", () => {
		const schema = z.object({
			id: z.number(),
			email: z.string().email(),
		});
		const s = zodToJsonSchema(schema);
		expect(s.type).toBe("object");
		expect(s.required).toEqual(["id", "email"]);
		expect(s.properties?.id).toEqual({ type: "number" });
		expect(s.properties?.email).toEqual({ type: "string", format: "email" });
	});

	it("optional fields are not in `required`", () => {
		const schema = z.object({
			id: z.string(),
			nickname: z.string().optional(),
		});
		const s = zodToJsonSchema(schema);
		expect(s.required).toEqual(["id"]);
	});

	it("default-valued fields are not in `required`", () => {
		const schema = z.object({
			id: z.string(),
			role: z.string().default("user"),
		});
		const s = zodToJsonSchema(schema);
		expect(s.required).toEqual(["id"]);
		expect((s.properties?.role as { default?: string }).default).toBe("user");
	});

	it("nested objects", () => {
		const schema = z.object({
			address: z.object({
				street: z.string(),
				city: z.string(),
			}),
		});
		const s = zodToJsonSchema(schema);
		expect((s.properties?.address as { type: string }).type).toBe("object");
	});
});

describe("zodToJsonSchema · arrays", () => {
	it("array of strings", () => {
		const s = zodToJsonSchema(z.array(z.string()));
		expect(s).toEqual({ type: "array", items: { type: "string" } });
	});

	it("array of objects with min/max", () => {
		const s = zodToJsonSchema(z.array(z.object({ id: z.number() })).min(1).max(10));
		expect(s.type).toBe("array");
		expect(s.minItems).toBe(1);
		expect(s.maxItems).toBe(10);
	});
});

describe("zodToJsonSchema · unions and intersections", () => {
	it("union (oneOf)", () => {
		const s = zodToJsonSchema(z.union([z.string(), z.number()]));
		expect(s.oneOf).toBeDefined();
		expect(s.oneOf).toHaveLength(2);
	});

	it("nullable (sets nullable: true)", () => {
		const s = zodToJsonSchema(z.string().nullable());
		expect(s.type).toBe("string");
		expect(s.nullable).toBe(true);
	});
});

describe("zodToJsonSchema · records", () => {
	it("record of strings", () => {
		const s = zodToJsonSchema(z.record(z.string()));
		expect(s.type).toBe("object");
		expect(s.additionalProperties).toEqual({ type: "string" });
	});
});
