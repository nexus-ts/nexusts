/**
 * Validation pipeline tests.
 */
import { describe, it, expect } from "vitest";
import { z } from "zod";
import {
	validateRequest,
	ValidationError,
	formatValidationError,
} from "@core/validation/validator";

describe("Validation", () => {
	it("returns parsed values when validation passes", () => {
		const schema = z.object({ name: z.string(), age: z.number() });
		const result = validateRequest(
			{ body: schema },
			{ body: { name: "Alice", age: 30 } },
		);
		expect(result.body).toEqual({ name: "Alice", age: 30 });
	});

	it("throws ValidationError on schema failure", () => {
		const schema = z.object({ name: z.string(), age: z.number() });
		expect(() =>
			validateRequest(
				{ body: schema },
				{ body: { name: "Alice", age: "thirty" } },
			),
		).toThrow(ValidationError);
	});

	it("formats ValidationError for HTTP response", () => {
		const schema = z.object({ email: z.string().email() });
		try {
			validateRequest({ body: schema }, { body: { email: "not-an-email" } });
		} catch (err) {
			if (!(err instanceof ValidationError)) throw err;
			const formatted = formatValidationError(err);
			expect(formatted.status).toBe(400);
			expect(formatted.body.error).toBe("Validation failed");
			expect(formatted.body.issues).toBeInstanceOf(Array);
			expect(formatted.body.issues.length).toBeGreaterThan(0);
		}
	});

	it("returns the input unchanged when no metadata is given", () => {
		const result = validateRequest(undefined, { body: { anything: true } });
		expect(result.body).toEqual({ anything: true });
	});

	it("validates query, params, and headers independently", () => {
		const result = validateRequest(
			{
				query: z.object({ limit: z.coerce.number() }),
				params: z.object({ id: z.coerce.number() }),
				headers: z.object({ authorization: z.string() }),
			},
			{
				query: { limit: "10" },
				params: { id: "42" },
				headers: { authorization: "Bearer abc" },
			},
		);
		expect(result.query).toEqual({ limit: 10 });
		expect(result.params).toEqual({ id: 42 });
		expect(result.headers).toEqual({ authorization: "Bearer abc" });
	});
});
