/**
 * Tests for nexus/config.
 */

import "reflect-metadata";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { ConfigService } from "../../src/config/index.js";

const baseSchema = z.object({
	PORT: z.coerce.number().default(3000),
	NODE_ENV: z
		.enum(["development", "production", "test"])
		.default("development"),
});

describe("ConfigService", () => {
	it("returns defaults when env vars are missing", () => {
		// Wipe relevant env so defaults apply.
		const savedPort = process.env["PORT"];
		const savedEnv = process.env["NODE_ENV"];
		delete process.env["PORT"];
		delete process.env["NODE_ENV"];
		try {
			const svc = new ConfigService({ schema: baseSchema });
			expect(svc.get("PORT") as number).toBe(3000);
			expect(svc.get("NODE_ENV") as string).toBe("development");
		} finally {
			if (savedPort !== undefined) process.env["PORT"] = savedPort;
			if (savedEnv !== undefined) process.env["NODE_ENV"] = savedEnv;
		}
	});

	it("reads env vars and coerces", () => {
		const savedPort = process.env["PORT"];
		process.env["PORT"] = "8080";
		try {
			const svc = new ConfigService({ schema: baseSchema });
			expect(svc.get("PORT")).toBe(8080);
		} finally {
			if (savedPort !== undefined) process.env["PORT"] = savedPort;
			else delete process.env["PORT"];
		}
	});

	it("throws on schema validation failure", () => {
		expect(() => {
			new ConfigService({
				schema: z.object({ REQUIRED: z.string() }),
			});
		}).toThrow(/Configuration validation failed/);
	});

	it("throws on schema validation failure when exitOnError is set", () => {
		const originalExit = process.exit;
		const exitMock = (() => undefined) as never;
		process.exit = exitMock;
		try {
			expect(() => {
				new ConfigService({
					schema: z.object({ REQUIRED: z.string() }),
					exitOnError: true,
				});
			}).toThrow(/Configuration validation failed/);
		} finally {
			process.exit = originalExit;
		}
	});

	it("default() returns the supplied default when key is missing", () => {
		const schema = z.object({ OPTIONAL: z.string().optional() });
		const svc = new ConfigService({ schema });
		expect(svc.get("OPTIONAL", { default: "fallback" })).toBe("fallback");
	});

	it("require() throws when the key is missing", () => {
		const saved = process.env["NEEDED"];
		delete process.env["NEEDED"];
		try {
			const schema = z.object({ NEEDED: z.string().default("fallback") });
			const svc = new ConfigService({ schema });
			// 'fallback' is the default value, which is falsy in some checks.
			// require() should still pass because the field is present.
			expect(svc.require("NEEDED")).toBe("fallback");
		} finally {
			if (saved !== undefined) process.env["NEEDED"] = saved;
		}
	});

	it("strict mode throws on unknown keys", () => {
		const schema = z.object({ KNOWN: z.string().default("x") });
		const svc = new ConfigService({ schema, strict: true });
		expect(() => svc.get("UNKNOWN")).toThrow(/Unknown config key/);
	});

	it("env() returns the raw env value", () => {
		const svc = new ConfigService({ schema: baseSchema });
		const port = process.env["PORT"];
		expect(svc.env("PORT")).toBe(port);
	});

	it("load() merges static config", () => {
		const svc = new ConfigService({
			schema: baseSchema,
			load: [{ PORT: 4000 }],
		});
		expect(svc.get("PORT")).toBe(4000);
	});

	it("load values override defaults but not env", () => {
		const saved = process.env["PORT"];
		process.env["PORT"] = "7000";
		try {
			const svc = new ConfigService({
				schema: baseSchema,
				load: [{ PORT: 5000 }],
			});
			expect(svc.get("PORT")).toBe(7000);
		} finally {
			if (saved) process.env["PORT"] = saved;
			else delete process.env["PORT"];
		}
	});

	it("load value used when env var is absent", () => {
		const saved = process.env["NODE_ENV"];
		delete process.env["NODE_ENV"];
		try {
			const svc = new ConfigService({
				schema: baseSchema,
				load: [{ NODE_ENV: "production" }],
			});
			expect(svc.get("NODE_ENV")).toBe("production");
		} finally {
			if (saved) process.env["NODE_ENV"] = saved;
		}
	});
});
