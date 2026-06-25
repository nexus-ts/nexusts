/**
 * Tests for @Global() decorator.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
	Global,
	isGlobalModule,
	removeGlobalModule,
	clearGlobalModules,
	Module,
} from "@nexusts/core";

describe("@Global() decorator", () => {
	beforeEach(() => {
		clearGlobalModules();
	});

	afterEach(() => {
		clearGlobalModules();
	});

	it("marks a module as global", () => {
		@Global()
		@Module({})
		class DatabaseModule {}

		expect(isGlobalModule(DatabaseModule)).toBe(true);
	});

	it("unmarked modules are not global", () => {
		@Module({
			controllers: [],
		})
		class UserModule {}

		expect(isGlobalModule(UserModule)).toBe(false);
	});

	it("multiple modules can be global", () => {
		@Global()
		@Module({})
		class DbModule {}

		@Global()
		@Module({})
		class LogModule {}

		expect(isGlobalModule(DbModule)).toBe(true);
		expect(isGlobalModule(LogModule)).toBe(true);
	});

	it("removeGlobalModule removes from global registry", () => {
		@Global()
		@Module({})
		class DbModule {}

		expect(isGlobalModule(DbModule)).toBe(true);
		removeGlobalModule(DbModule);
		expect(isGlobalModule(DbModule)).toBe(false);
	});

	it("clearGlobalModules clears all global modules", () => {
		@Global()
		@Module({})
		class DbModule {}

		@Global()
		@Module({})
		class CacheModule {}

		expect(isGlobalModule(DbModule)).toBe(true);
		clearGlobalModules();
		expect(isGlobalModule(DbModule)).toBe(false);
		expect(isGlobalModule(CacheModule)).toBe(false);
	});
});
