/**
 * Cookie session storage — encodes the entire session record inside
 * a single signed cookie. No server-side state. Ideal for edge
 * runtimes (Workers, Vercel) where shared storage isn't available.
 *
 * The signature is produced by `EncryptionService` (HMAC-SHA256
 * with HKDF-derived key). The `secret` config is the master key —
 * the framework derives a separate HMAC sub-key from it.
 *
 * Cookie format: `<base64url(payload)>.<base64url(hmac)>`
 *
 * - The payload is the JSON-serialized SessionRecord.
 * - The HMAC is over the payload using the framework's
 *   `EncryptionService.sign(..., "session")` with a purpose tag
 *   so a session token can't be replayed as a CSRF token, etc.
 * - The two are joined with `.`. On read we recompute the HMAC and
 *   compare in constant time.
 *
 * Expired sessions are detected by inspecting `expiresAt` after
 * decoding — we don't need server state for that.
 */

import { timingSafeEqual } from "node:crypto";
import { EncryptionService } from "@nexusts/crypto";
import type {
	CookieStorageOptions,
	CreateSessionOptions,
	SessionData,
	SessionMetadata,
	SessionQuery,
	SessionRecord,
	SessionStorage,
	UpdateSessionOptions,
} from "../types.js";

function b64urlEncode(buf: Buffer | string): string {
	const b = typeof buf === "string" ? Buffer.from(buf, "utf8") : buf;
	return b
		.toString("base64")
		.replace(/\+/g, "-")
		.replace(/\//g, "_")
		.replace(/=+$/, "");
}

function b64urlDecode(s: string): Buffer {
	const padded = s + "=".repeat((4 - (s.length % 4)) % 4);
	return Buffer.from(padded.replace(/-/g, "+").replace(/_/g, "/"), "base64");
}

function randomId(bytes = 24): string {
	const arr = new Uint8Array(bytes);
	crypto.getRandomValues(arr);
	return b64urlEncode(Buffer.from(arr));
}

function safeEq(a: string, b: string): boolean {
	const ab = Buffer.from(a);
	const bb = Buffer.from(b);
	if (ab.length !== bb.length) return false;
	return timingSafeEqual(ab, bb);
}

/**
 * Encode a SessionRecord into a signed cookie value.
 * Public so `authMiddleware` (or any other integration) can set the
 * cookie after `sessionService.create(...)`.
 */
export function encodeSessionCookie(
	record: SessionRecord,
	secret: string,
): string {
	const enc = new EncryptionService(secret);
	const payload = b64urlEncode(
		JSON.stringify({
			id: record.id,
			userId: record.userId,
			data: record.data,
			createdAt: record.createdAt.toISOString(),
			lastSeenAt: record.lastSeenAt.toISOString(),
			expiresAt: record.expiresAt.toISOString(),
			...(record.absoluteExpiresAt
				? { absoluteExpiresAt: record.absoluteExpiresAt.toISOString() }
				: {}),
			...(record.metadata ? { metadata: record.metadata } : {}),
		}),
	);
	// Sign the b64 payload with purpose "session". The HMAC is
	// produced by EncryptionService (HKDF-derived key + purpose tag),
	// so a session token can't be replayed as another purpose.
	const sig = enc.signRaw(payload, "session");
	return `${payload}.${sig}`;
}

/** Decode + verify a signed cookie value. Returns null on tampering. */
export function decodeSessionCookie<T = SessionData>(
	cookieValue: string,
	secret: string,
): SessionRecord<T> | null {
	const enc = new EncryptionService(secret);
	const lastDot = cookieValue.lastIndexOf(".");
	if (lastDot < 1) return null;
	const payload = cookieValue.slice(0, lastDot);
	const sig = cookieValue.slice(lastDot + 1);
	if (!enc.verifyRaw(payload, sig, "session")) return null;
	try {
		const obj = JSON.parse(b64urlDecode(payload).toString("utf8")) as Record<
			string,
			unknown
		>;
		const record: SessionRecord<T> = {
			id: String(obj["id"]),
			userId: (obj["userId"] as string | null) ?? null,
			data: (obj["data"] as T) ?? ({} as T),
			createdAt: new Date(String(obj["createdAt"])),
			lastSeenAt: new Date(String(obj["lastSeenAt"])),
			expiresAt: new Date(String(obj["expiresAt"])),
		};
		const abs = obj["absoluteExpiresAt"];
		if (typeof abs === "string") record.absoluteExpiresAt = new Date(abs);
		const meta = obj["metadata"];
		if (meta && typeof meta === "object") {
			record.metadata = meta as SessionMetadata;
		}
		return record;
	} catch {
		return null;
	}
}

export class CookieSessionStorage implements SessionStorage {
	readonly name = "cookie" as const;
	#secret: string;
	#cookieName: string;
	#defaultTtl: number;
	#cookieOptions: NonNullable<CookieStorageOptions["cookieOptions"]>;

	constructor(options: CookieStorageOptions) {
		if (!options.secret || options.secret.length < 16) {
			throw new Error("[session/cookie] secret must be at least 16 chars");
		}
		this.#secret = options.secret;
		this.#cookieName = options.cookieName ?? "nexus.sess";
		this.#defaultTtl = options.defaultTtlSeconds ?? 60 * 60 * 24 * 7;
		this.#cookieOptions = options.cookieOptions ?? {};
	}

	get cookieName(): string {
		return this.#cookieName;
	}

	get cookieOptions(): NonNullable<CookieStorageOptions["cookieOptions"]> {
		return this.#cookieOptions;
	}

	/** Build a `Set-Cookie` header value for a freshly-created session. */
	buildSetCookie(record: SessionRecord): string {
		const value = encodeSessionCookie(record, this.#secret);
		const opts = this.#cookieOptions;
		const parts = [`${this.#cookieName}=${value}`];
		parts.push(`Path=${opts.path ?? "/"}`);
		if (opts.domain) parts.push(`Domain=${opts.domain}`);
		if (opts.httpOnly ?? true) parts.push("HttpOnly");
		if (opts.secure ?? process.env["NODE_ENV"] === "production")
			parts.push("Secure");
		parts.push(`SameSite=${(opts.sameSite ?? "lax").toUpperCase()}`);
		const maxAge =
			opts.maxAgeSeconds ??
			Math.max(1, Math.floor((record.expiresAt.getTime() - Date.now()) / 1000));
		parts.push(`Max-Age=${maxAge}`);
		if (opts.partitioned) parts.push("Partitioned");
		return parts.join("; ");
	}

	/** Build a `Set-Cookie` header that clears the cookie. */
	buildClearCookie(): string {
		const opts = this.#cookieOptions;
		return [
			`${this.#cookieName}=`,
			`Path=${opts.path ?? "/"}`,
			`Max-Age=0`,
			opts.domain ? `Domain=${opts.domain}` : "",
		]
			.filter(Boolean)
			.join("; ");
	}

	// ===========================================================================
	// SessionStorage API
	// ===========================================================================

	async create<T = SessionData>(
		opts: CreateSessionOptions<T>,
	): Promise<SessionRecord<T>> {
		const now = new Date();
		const ttl = (opts.ttlSeconds ?? this.#defaultTtl) * 1000;
		const record: SessionRecord<T> = {
			id: opts.id ?? randomId(),
			userId: null,
			data: (opts.data ?? {}) as T,
			createdAt: now,
			lastSeenAt: now,
			expiresAt: new Date(now.getTime() + ttl),
		};
		if (opts.absoluteTtlSeconds) {
			record.absoluteExpiresAt = new Date(
				now.getTime() + opts.absoluteTtlSeconds * 1000,
			);
		}
		if (opts.metadata) record.metadata = opts.metadata;
		return record;
	}

	/** No server-side state — `read` is a no-op for cookie storage. */
	async read(): Promise<SessionRecord | null> {
		return null;
	}

	async readMany(query?: SessionQuery): Promise<SessionRecord[]> {
		void query;
		return [];
	}

	async update<T = SessionData>(
		_id: string,
		opts: UpdateSessionOptions<T>,
	): Promise<SessionRecord<T> | null> {
		// No state to mutate. Callers should call `create()` with the
		// updated fields, then re-set the cookie.
		void opts;
		return null;
	}

	async destroy(): Promise<boolean> {
		return true;
	}

	async destroyMany(): Promise<number> {
		return 0;
	}

	async touch(): Promise<SessionRecord | null> {
		return null;
	}

	async gc(): Promise<number> {
		return 0;
	}

	async clear(): Promise<void> {
		// no-op
	}

	/** Decode a session cookie value into a SessionRecord (verification included). */
	decode(cookieValue: string): SessionRecord | null {
		return decodeSessionCookie(cookieValue, this.#secret);
	}

	/** Encode a SessionRecord for the Set-Cookie header value. */
	encode(record: SessionRecord): string {
		return encodeSessionCookie(record, this.#secret);
	}
}
