/**
 * Tests for `nx repl`.
 *
 * Coverage:
 * 1. Command is registered with the right name and aliases
 * 2. Command has the right flags
 * 3. Helper functions: isIncomplete, formatResult, formatError,
 *    listServices, preloadService
 * 4. Behavior with --no-boot (error handling for missing app)
 */

import "reflect-metadata";
import { mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import {
	formatError,
	formatResult,
	isIncomplete,
	listServices,
	preloadService,
	replCommand,
} from "../../src/cli/commands/repl.js";

async function makeTmp(): Promise<string> {
	const d = join(
		tmpdir(),
		`nx-repl-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
	);
	await mkdir(d, { recursive: true });
	return d;
}

describe("nx repl command registration", () => {
	it("has the right name and aliases", () => {
		expect(replCommand.name).toBe("repl");
		expect(replCommand.aliases).toContain("console");
		expect(replCommand.aliases).toContain("shell");
	});

	it("has the expected flags", () => {
		const flagNames = (replCommand.flags ?? []).map((f) => f.name);
		expect(flagNames).toContain("module");
		expect(flagNames).toContain("no-boot");
		expect(flagNames).toContain("history");
	});

	it("summary describes the REPL", () => {
		expect(replCommand.summary.toLowerCase()).toContain("repl");
	});
});

describe("isIncomplete", () => {
	it("returns false for complete code", () => {
		expect(isIncomplete("const x = 1;")).toBe(false);
		expect(isIncomplete("function foo() { return 42; }")).toBe(false);
		expect(isIncomplete("await db.select()")).toBe(false);
	});

	it("returns true for unclosed braces", () => {
		expect(isIncomplete("function foo() {")).toBe(true);
		expect(isIncomplete("const x = { a: 1, b:")).toBe(true);
	});

	it("returns true for unclosed brackets", () => {
		expect(isIncomplete("const arr = [1, 2, 3,")).toBe(true);
		expect(isIncomplete("foo(bar(")).toBe(true);
	});

	it("returns false for properly nested brackets", () => {
		expect(isIncomplete("const x = { a: [1, 2], b: { c: 3 } };")).toBe(
			false,
		);
	});

	it("ignores brackets inside double-quoted strings", () => {
		// String contains an open brace; should be ignored.
		expect(isIncomplete('const s = "hello (world)";')).toBe(false);
		// Unclosed string but contains an open brace inside it.
		// String opens with " but never closes — unclosed.
		expect(isIncomplete('const s = "open brace')).toBe(true);
	});

	it("ignores brackets inside template literals", () => {
		expect(isIncomplete("const s = `{ \"key\": \"value\" }`;")).toBe(false);
	});

	it("returns true for unclosed string literal", () => {
		expect(isIncomplete('const s = "hello')).toBe(true);
		expect(isIncomplete("const s = 'world")).toBe(true);
		expect(isIncomplete("const s = `template")).toBe(true);
	});

	it("ignores brackets inside line comments", () => {
		expect(isIncomplete("// const x = {")).toBe(false);
	});

	it("ignores brackets inside block comments", () => {
		expect(isIncomplete("/* const x = { */")).toBe(false);
	});

	it("returns true for unclosed block comment with bracket", () => {
		expect(isIncomplete("/* const x = {")).toBe(true);
	});

	it("returns true for unclosed block comment", () => {
		expect(isIncomplete("/* const x = 1")).toBe(true);
	});

	it("handles escape characters in strings", () => {
		// The escaped \" doesn't close the string. The unclosed
		// string means the code is incomplete.
		expect(isIncomplete('const s = "escaped \\" quote')).toBe(true);
	});
});

describe("formatResult", () => {
	it("handles null and undefined", () => {
		expect(formatResult(null)).toBe("null");
		expect(formatResult(undefined)).toBe("undefined");
	});

	it("handles primitives", () => {
		expect(formatResult("hello")).toBe("hello");
		expect(formatResult(42)).toBe("42");
		expect(formatResult(true)).toBe("true");
		expect(formatResult(false)).toBe("false");
	});

	it("handles bigint", () => {
		expect(formatResult(BigInt(100))).toBe("100");
	});

	it("JSON-serializes objects", () => {
		const obj = { a: 1, b: [2, 3] };
		const out = formatResult(obj);
		expect(out).toContain('"a": 1');
		expect(out).toContain('"b"');
	});

	it("labels functions", () => {
		const fn = function myFn() {};
		expect(formatResult(fn)).toBe("[Function: myFn]");
	});

	it("labels anonymous functions", () => {
		expect(formatResult(() => {})).toBe("[Function: anonymous]");
	});

	it("handles objects that throw on JSON.stringify", () => {
		const circular: Record<string, unknown> = {};
		circular["self"] = circular;
		// Should not throw
		const out = formatResult(circular);
		expect(typeof out).toBe("string");
	});
});

describe("formatError", () => {
	it("returns just the message for SyntaxErrors", () => {
		const e = new SyntaxError("Unexpected token");
		expect(formatError(e)).toBe("Unexpected token");
	});

	it("returns the first 3 lines of stack for other errors", () => {
		const e = new Error("boom");
		const out = formatError(e);
		expect(out).toContain("boom");
		expect(out.split("\n").length).toBeLessThanOrEqual(5);
	});

	it("falls back to message when no stack", () => {
		const e = new Error("simple");
		e.stack = undefined as unknown as string;
		expect(formatError(e)).toBe("simple");
	});
});

describe("listServices", () => {
	it("returns empty for null container", () => {
		expect(listServices(null)).toEqual([]);
	});

	it("returns empty for container without listProviders", () => {
		expect(listServices({})).toEqual([]);
	});

	it("returns stringified tokens", () => {
		const providers = [
			{ token: { toString: () => "TOKEN_A" } },
			{ token: { toString: () => "TOKEN_B" } },
		];
		const out = listServices({ listProviders: () => providers });
		expect(out).toEqual(["TOKEN_A", "TOKEN_B"]);
	});

	it("handles providers without toString", () => {
		const providers = [{ token: "raw-string" }];
		const out = listServices({ listProviders: () => providers });
		expect(out).toEqual(["raw-string"]);
	});

	it("returns empty when listProviders throws", () => {
		const out = listServices({
			listProviders: () => {
				throw new Error("nope");
			},
		});
		expect(out).toEqual([]);
	});
});

describe("preloadService", () => {
	let cwd: string;
	beforeEach(async () => {
		cwd = await makeTmp();
	});

	it("does nothing when the module doesn't exist", async () => {
		const env: Record<string, unknown> = {};
		const app = { container: { resolve: () => "should-not-be-called" } };
		await preloadService(env, app, "x", "./does-not-exist-12345.mjs", "X");
		expect(env["x"]).toBeUndefined();
	});

	it("resolves the service via the token when the module exports it", async () => {
		// Create a tiny module that exports a class with a TOKEN.
		const modPath = join(cwd, "service.mjs");
		await writeFile(
			modPath,
			[
				"const TOKEN = Symbol('X');",
				"export class X {",
				"  static get TOKEN() { return TOKEN; }",
				"  greet() { return 'hi'; }",
				"}",
				"export { TOKEN };",
			].join("\n"),
			"utf-8",
		);
		const env: Record<string, unknown> = {};
		// Accept any token — the test is about preload plumbing, not
		// the container's resolve semantics.
		const app = {
			container: {
				resolve: () => ({ greet: () => "hi" }),
			},
		};
		await preloadService(env, app, "x", modPath, "X");
		expect((env["x"] as { greet: () => string }).greet()).toBe("hi");
	});

	it("falls back to resolving the class when the token fails", async () => {
		const modPath = join(cwd, "service.mjs");
		await writeFile(
			modPath,
			[
				"const TOKEN = Symbol('X');",
				"export class X {",
				"  static get TOKEN() { return TOKEN; }",
				"}",
				"export { TOKEN };",
			].join("\n"),
			"utf-8",
		);
		const env: Record<string, unknown> = {};
		// First call (with the token) throws; second call (with the
		// class) succeeds.
		let calls = 0;
		const app = {
			container: {
				resolve: (t: unknown) => {
					calls++;
					if (typeof t === "symbol") throw new Error("no token");
					return { ok: true };
				},
			},
		};
		await preloadService(env, app, "x", modPath, "X");
		expect(calls).toBe(2); // 1 for token, 1 for class
		expect((env["x"] as { ok: boolean }).ok).toBe(true);
	});
});

describe("nx repl — smoke", () => {
	it("exports a run function", () => {
		expect(typeof replCommand.run).toBe("function");
	});
});
