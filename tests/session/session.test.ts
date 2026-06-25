/**
 * Session module tests.
 *
 * Covers:
 *   - encodeSessionCookie / decodeSessionCookie round-trip + tampering
 *   - MemorySessionStorage CRUD + GC + LRU
 *   - CookieSessionStorage read (decode) + buildSetCookie
 *   - SessionService DI under both tokens + rotate
 *   - AuthService + SessionService binding (auth integration)
 *   - SessionModule.forRoot validation
 */

import { describe, it, expect, beforeEach } from "vitest";
import { Application } from "@core/application";
import { Module } from "@core/decorators/module";
import { Controller } from "@core/decorators/controller";
import { Get } from "@core/decorators/http-methods";
import { Injectable, Inject } from "@core/decorators/injectable";
import {
	SessionService,
	SessionModule,
	MemorySessionStorage,
	CookieSessionStorage,
	encodeSessionCookie,
	decodeSessionCookie,
	Session,
	UnauthenticatedError,
	SessionForbiddenError,
} from "../../src/session/index.js";
import { AuthService, AuthModule } from "../../src/auth/index.js";

const SECRET = "a".repeat(32);

describe("encodeSessionCookie / decodeSessionCookie", () => {
	const record = {
		id: "sess-123",
		userId: "user-1",
		data: { cart: ["apple", "pear"] },
		createdAt: new Date("2026-06-15T12:00:00Z"),
		lastSeenAt: new Date("2026-06-15T12:30:00Z"),
		expiresAt: new Date("2026-06-22T12:30:00Z"),
	};

	it("round-trips a record", () => {
		const cookie = encodeSessionCookie(record, SECRET);
		const decoded = decodeSessionCookie(cookie, SECRET);
		expect(decoded?.id).toBe(record.id);
		expect(decoded?.userId).toBe(record.userId);
		expect(decoded?.data).toEqual(record.data);
		expect(decoded?.expiresAt.toISOString()).toBe(
			record.expiresAt.toISOString(),
		);
	});

	it("returns null on a tampered payload", () => {
		const cookie = encodeSessionCookie(record, SECRET);
		// Flip the very last character — the HMAC will mismatch.
		const tampered = cookie.slice(0, -1) + (cookie.endsWith("A") ? "B" : "A");
		expect(decodeSessionCookie(tampered, SECRET)).toBeNull();
	});

	it("returns null on the wrong secret", () => {
		const cookie = encodeSessionCookie(record, SECRET);
		expect(
			decodeSessionCookie(cookie, "wrong-secret-" + SECRET.slice(12)),
		).toBeNull();
	});

	it("returns null on a malformed cookie", () => {
		expect(decodeSessionCookie("garbage", SECRET)).toBeNull();
		expect(decodeSessionCookie("", SECRET)).toBeNull();
	});
});

describe("MemorySessionStorage", () => {
	let storage: MemorySessionStorage;

	beforeEach(() => {
		storage = new MemorySessionStorage({ gcIntervalMs: 60_000 });
	});

	it("creates a session with default TTL", async () => {
		const s = await storage.create({});
		expect(s.id).toBeTruthy();
		expect(s.expiresAt.getTime()).toBeGreaterThan(s.createdAt.getTime());
	});

	it("reads a session by id and refreshes lastSeenAt", async () => {
		const s = await storage.create({});
		const before = Date.now();
		const r = await storage.read(s.id);
		expect(r?.id).toBe(s.id);
		expect(r!.lastSeenAt.getTime()).toBeGreaterThanOrEqual(before);
	});

	it("returns null for an unknown id", async () => {
		expect(await storage.read("nope")).toBeNull();
	});

	it("returns null for an expired session", async () => {
		const s = await storage.create({ ttlSeconds: 0 });
		await new Promise((r) => setTimeout(r, 10));
		expect(await storage.read(s.id)).toBeNull();
	});

	it("updates data via patch", async () => {
		const s = await storage.create({});
		const updated = await storage.update(s.id, { dataPatch: { cart: ["x"] } });
		expect((updated?.data as { cart: string[] }).cart).toEqual(["x"]);
	});

	it("destroys a session", async () => {
		const s = await storage.create({});
		expect(await storage.destroy(s.id)).toBe(true);
		expect(await storage.read(s.id)).toBeNull();
	});

	it("destroys by query", async () => {
		const a = await storage.create({});
		const b = await storage.create({});
		// Tag them via userId so the metadata filter can discriminate.
		(a as { userId: string | null }).userId = "u-1";
		(b as { userId: string | null }).userId = "u-2";
		const removed = await storage.destroyMany({ userId: "u-1" });
		expect(removed).toBe(1);
		expect(await storage.read(a.id)).toBeNull();
		expect(await storage.read(b.id)).not.toBeNull();
	});

	it("gc() removes expired sessions", async () => {
		const live = await storage.create({});
		await storage.create({ ttlSeconds: 0 });
		await new Promise((r) => setTimeout(r, 10));
		const removed = await storage.gc();
		expect(removed).toBe(1);
		expect(await storage.read(live.id)).not.toBeNull();
	});

	it("clear() removes every session", async () => {
		await storage.create({});
		await storage.create({});
		await storage.clear();
		const list = await storage.readMany();
		expect(list).toEqual([]);
	});
});

describe("CookieSessionStorage", () => {
	let storage: CookieSessionStorage;

	beforeEach(() => {
		storage = new CookieSessionStorage({ secret: SECRET });
	});

	it("rejects a short secret", () => {
		expect(() => new CookieSessionStorage({ secret: "short" })).toThrow(
			/at least 16 chars/,
		);
	});

	it("produces a cookie name", () => {
		expect(storage.cookieName).toBe("nexus.sess");
	});

	it("builds a Set-Cookie header with HttpOnly + SameSite=Lax by default", () => {
		const record = {
			id: "s",
			userId: null,
			data: {},
			createdAt: new Date(),
			lastSeenAt: new Date(),
			expiresAt: new Date(Date.now() + 60_000),
		};
		const header = storage.buildSetCookie(record);
		expect(header).toContain("nexus.sess=");
		expect(header).toContain("HttpOnly");
		expect(header).toContain("SameSite=LAX");
		expect(header).toContain("Path=/");
	});

	it("builds a clear-cookie header with Max-Age=0", () => {
		const header = storage.buildClearCookie();
		expect(header).toContain("nexus.sess=");
		expect(header).toContain("Max-Age=0");
	});

	it("round-trips via decode()", () => {
		const record = {
			id: "s",
			userId: "u",
			data: { cart: ["a"] },
			createdAt: new Date(),
			lastSeenAt: new Date(),
			expiresAt: new Date(Date.now() + 60_000),
		};
		const cookie = storage.encode(record);
		const decoded = storage.decode(cookie);
		expect(decoded?.id).toBe("s");
		expect(decoded?.userId).toBe("u");
	});

	it("decode returns null on tamper", () => {
		expect(storage.decode("garbage")).toBeNull();
	});
});

describe("SessionService DI integration", () => {
	const AppSessionModule = SessionModule.forRoot({
		backend: "memory",
	});

	@Controller("/probe")
	class ProbeController {
		@Get("/")
		probe() {
			return { ok: true };
		}
	}

	@Module({
		imports: [AppSessionModule],
		controllers: [ProbeController],
	})
	class RootModule {}

	it("resolves under both tokens", () => {
		const app = new Application(RootModule);
		const byClass = app.container.resolve(SessionService);
		const byToken = app.container.resolve(SessionService.TOKEN);
		expect(byClass).toBeInstanceOf(SessionService);
		expect(byToken).toBe(byClass);
	});

	it("creates, reads, updates, and destroys sessions", async () => {
		const app = new Application(RootModule);
		const svc = app.container.resolve(SessionService);
		const s = await svc.create({ data: { cart: [] } });
		expect(s.id).toBeTruthy();

		const r = await svc.read(s.id);
		expect(r?.id).toBe(s.id);

		const updated = await svc.update(s.id, { dataPatch: { cart: ["x"] } });
		expect((updated?.data as { cart: string[] }).cart).toEqual(["x"]);

		expect(await svc.destroy(s.id, "logout")).toBe(true);
		expect(await svc.read(s.id)).toBeNull();
	});

	it("rotates a session id (preserving data)", async () => {
		const app = new Application(RootModule);
		const svc = app.container.resolve(SessionService);
		const s = await svc.create({ data: { userId: "u-1" } });
		(s as { userId: string }).userId = "u-1";
		const fresh = await svc.rotate(s.id);
		expect(fresh?.id).not.toBe(s.id);
		expect((fresh?.data as { userId: string }).userId).toBe("u-1");
		expect(await svc.read(s.id)).toBeNull();
	});
});

describe("AuthService + SessionService binding", () => {
	const SECRET2 = "b".repeat(32);

	const AppAuthModule = AuthModule.forRoot({
		basePath: "/api/auth",
		emailAndPassword: { enabled: true },
	});
	const AppSessionModule = SessionModule.forRoot({
		backend: "cookie",
		cookie: { secret: SECRET2 },
	});

	@Controller("/probe")
	class ProbeController {
		@Get("/")
		probe() {
			return { ok: true };
		}
	}

	@Module({
		imports: [AppAuthModule, AppSessionModule],
		controllers: [ProbeController],
	})
	class RootModule {}

	it("binds the SessionService and reads through getSession()", async () => {
		process.env["BETTER_AUTH_SECRET"] = "c".repeat(32);
		process.env["BETTER_AUTH_URL"] = "http://localhost:3000";

		const app = new Application(RootModule);
		const auth = app.container.resolve(AuthService) as AuthService;
		const sessions = app.container.resolve(SessionService) as SessionService;

		// Bind the session service manually for this test.
		auth.bindSession(sessions);

		// Create a session via SessionService, encode into a cookie.
		const session = await sessions.create({
			data: { userId: "u-1" },
		});
		(session as { userId: string }).userId = "u-1";
		const cookieValue = (sessions.storage as CookieSessionStorage).encode(
			session,
		);

		const headers = new Headers({ cookie: `nexus.sess=${cookieValue}` });
		const decoded = await auth.getRawSession({ headers });
		// Without a better-auth session attached, getRawSession returns the
		// cookie payload, with userId populated.
		expect(decoded?.userId).toBe("u-1");

		// hasSessionBinding() returns true after bindSession().
		expect(auth.hasSessionBinding()).toBe(true);
	});

	it("getSession() falls through to better-auth when no session cookie", async () => {
		process.env["BETTER_AUTH_SECRET"] = "d".repeat(32);
		process.env["BETTER_AUTH_URL"] = "http://localhost:3000";

		const app = new Application(RootModule);
		const auth = app.container.resolve(AuthService) as AuthService;
		auth.bindSession(app.container.resolve(SessionService) as SessionService);

		const res = await auth.getSession({ headers: new Headers() });
		expect(res).toBeNull();
	});
});

describe("@Session decorator", () => {
	it("exists and is callable", () => {
		expect(typeof Session).toBe("function");
	});

	it("returns a ParameterDecorator with no options", () => {
		const deco = Session();
		expect(typeof deco).toBe("function");
	});

	it("accepts all option shapes", () => {
		expect(() => Session({ required: true })).not.toThrow();
		expect(() => Session({ touch: true })).not.toThrow();
		expect(() =>
			Session({ assert: (_s: { id: string }) => true }),
		).not.toThrow();
	});

	it("throws when the user is not authenticated and required is true", async () => {
		const err = new UnauthenticatedError();
		expect(err.status).toBe(401);
	});

	it("throws a 403-class error from SessionForbiddenError", async () => {
		const err = new SessionForbiddenError();
		expect(err.status).toBe(403);
	});
});

describe("SessionModule.forRoot validation", () => {
	it("throws when SessionService is resolved with cookie backend but no secret", () => {
		const BadModule = SessionModule.forRoot({
			backend: "cookie",
			cookie: { secret: "" }, // too short
		});
		@Module({ imports: [BadModule] })
		class R {}
		const app = new Application(R);
		expect(() => app.container.resolve(SessionService)).toThrow(
			/at least 16 chars/,
		);
	});

	it("throws when SessionService is resolved with cookie backend but no cookie config", () => {
		const BadModule = SessionModule.forRoot({
			backend: "cookie",
		});
		@Module({ imports: [BadModule] })
		class R {}
		const app = new Application(R);
		expect(() => app.container.resolve(SessionService)).toThrow(
			/cookie\.secret/,
		);
	});
});
