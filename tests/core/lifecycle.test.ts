/**
 * Tests for lifecycle hooks.
 */
import "reflect-metadata";
import type {
	BeforeApplicationDestroy,
	OnApplicationDestroy,
	OnApplicationInit,
	OnModuleDestroy,
	OnModuleInit,
} from "@nexusts/core";
import {
	callBeforeApplicationDestroy,
	callOnApplicationDestroy,
	callOnApplicationInit,
	callOnModuleDestroy,
	callOnModuleInit,
	hasBeforeApplicationDestroy,
	hasOnApplicationDestroy,
	hasOnApplicationInit,
	hasOnModuleDestroy,
	hasOnModuleInit,
} from "@nexusts/core";
import { describe, expect, it } from "vitest";

describe("hasOnModuleInit", () => {
	it("returns true when object implements the hook", () => {
		const obj: OnModuleInit = { onModuleInit: () => {} };
		expect(hasOnModuleInit(obj)).toBe(true);
	});

	it("returns false when object does not implement the hook", () => {
		expect(hasOnModuleInit({})).toBe(false);
	});

	it("returns false for null", () => {
		expect(hasOnModuleInit(null)).toBe(false);
	});
});

describe("hasOnApplicationInit", () => {
	it("detects onApplicationInit", () => {
		const obj: OnApplicationInit = { onApplicationInit: () => {} };
		expect(hasOnApplicationInit(obj)).toBe(true);
	});
});

describe("hasOnModuleDestroy", () => {
	it("detects onModuleDestroy", () => {
		const obj: OnModuleDestroy = { onModuleDestroy: () => {} };
		expect(hasOnModuleDestroy(obj)).toBe(true);
	});
});

describe("hasBeforeApplicationDestroy", () => {
	it("detects beforeApplicationDestroy", () => {
		const obj: BeforeApplicationDestroy = { beforeApplicationDestroy: () => {} };
		expect(hasBeforeApplicationDestroy(obj)).toBe(true);
	});
});

describe("hasOnApplicationDestroy", () => {
	it("detects onApplicationDestroy", () => {
		const obj: OnApplicationDestroy = { onApplicationDestroy: () => {} };
		expect(hasOnApplicationDestroy(obj)).toBe(true);
	});
});

describe("callOnModuleInit", () => {
	it("calls onModuleInit when present", async () => {
		let called = false;
		const obj: OnModuleInit = { onModuleInit: async () => { called = true; } };
		await callOnModuleInit(obj);
		expect(called).toBe(true);
	});

	it("does nothing when not present", async () => {
		await callOnModuleInit({});
		// Should not throw
	});

	it("awaits async hooks", async () => {
		const obj: OnModuleInit = {
			onModuleInit: () => new Promise<void>((resolve) => {
				setTimeout(resolve, 5);
			}),
		};
		await expect(callOnModuleInit(obj)).resolves.toBeUndefined();
	});
});

describe("callOnApplicationInit", () => {
	it("calls onApplicationInit when present", async () => {
		let called = false;
		const obj: OnApplicationInit = { onApplicationInit: () => { called = true; } };
		await callOnApplicationInit(obj);
		expect(called).toBe(true);
	});
});

describe("callOnModuleDestroy", () => {
	it("calls onModuleDestroy when present", async () => {
		let called = false;
		const obj: OnModuleDestroy = { onModuleDestroy: () => { called = true; } };
		await callOnModuleDestroy(obj);
		expect(called).toBe(true);
	});
});

describe("callBeforeApplicationDestroy", () => {
	it("passes signal to the hook", async () => {
		let captured: string | undefined;
		const obj: BeforeApplicationDestroy = {
			beforeApplicationDestroy: (signal) => { captured = signal; },
		};
		await callBeforeApplicationDestroy(obj, "SIGTERM");
		expect(captured).toBe("SIGTERM");
	});
});

describe("callOnApplicationDestroy", () => {
	it("passes signal to the hook", async () => {
		let captured: string | undefined;
		const obj: OnApplicationDestroy = {
			onApplicationDestroy: (signal) => { captured = signal; },
		};
		await callOnApplicationDestroy(obj, "SIGINT");
		expect(captured).toBe("SIGINT");
	});
});
