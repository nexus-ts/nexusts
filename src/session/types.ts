/**
 * Session types — the public contract for `nexus/session`.
 *
 * Provides a uniform session-storage abstraction with multiple
 * backends (cookie, memory, Redis, DB) and an optional integration
 * with `nexus/auth` for richer auth flows.
 *
 * Mirrors common session-management libraries (express-session,
 * iron-session, @auth/core's session model).
 */

// ---------------------------------------------------------------------------
// Session record
// ---------------------------------------------------------------------------

/**
 * A session record. Stored by the backend, returned by read operations.
 *
 * `data` is a free-form blob for app-specific state (flash messages,
 * guest cart, CSRF tokens, ...). `userId` is null for anonymous
 * (unauthenticated) sessions.
 */
export interface SessionRecord<T = Record<string, unknown>> {
	/** Unique session id (random, opaque, 32+ bytes). */
	id: string;
	/** User id, or null for anonymous sessions. */
	userId: string | null;
	/** Free-form per-session data. */
	data: T;
	/** When the session was created. */
	createdAt: Date;
	/** Last access time (updated on every read by default). */
	lastSeenAt: Date;
	/** Hard expiry. After this point the session is invalid. */
	expiresAt: Date;
	/** Optional absolute timeout (sliding window disabled). */
	absoluteExpiresAt?: Date;
	/** Client metadata — IP, user agent, etc. — for security audits. */
	metadata?: SessionMetadata;
}

export interface SessionMetadata {
	ipAddress?: string;
	userAgent?: string;
	fingerprint?: string;
	/** When the session was last rotated (re-generated id). */
	lastRotatedAt?: Date;
}

export type SessionData = Record<string, unknown>;

// ---------------------------------------------------------------------------
// Options
// ---------------------------------------------------------------------------

export interface CreateSessionOptions<T = SessionData> {
	/** TTL in seconds. Default: 7 days. */
	ttlSeconds?: number;
	/** Hard absolute TTL regardless of activity. */
	absoluteTtlSeconds?: number;
	/** Optional client metadata. */
	metadata?: SessionMetadata;
	/** Initial data. */
	data?: T;
	/** Pre-generated id (for session-fixation defense). */
	id?: string;
	/** Whether to issue a Set-Cookie header. Default: false (manual). */
	issueCookie?: boolean;
}

export interface UpdateSessionOptions<T = SessionData> {
	/** Replace data with a partial patch. */
	dataPatch?: Partial<T>;
	/** Extend the sliding expiry by N seconds. */
	extendSeconds?: number;
}

export interface SessionQuery {
	userId?: string;
	/** Filter by metadata (e.g. ipAddress). */
	metadata?: Partial<SessionMetadata>;
	/** Skip the first N records (for pagination). */
	offset?: number;
	/** Max records to return. */
	limit?: number;
}

// ---------------------------------------------------------------------------
// Storage abstraction
// ---------------------------------------------------------------------------

/**
 * SessionStorage contract — every backend implements this.
 *
 * Reads default to "sliding" expiry: touching a record extends its
 * `expiresAt`. Backends that don't support atomic sliding updates
 * must emulate it in user code (or accept the simpler non-sliding
 * model).
 */
export interface SessionStorage {
	/** Backend name for diagnostics. */
	readonly name: "cookie" | "memory" | "redis" | "database";

	/** Create a new session record. Returns the stored record. */
	create<T = SessionData>(
		opts: CreateSessionOptions<T>,
	): Promise<SessionRecord<T>>;

	/** Read by id. Returns null if missing or expired. */
	read(id: string): Promise<SessionRecord | null>;

	/** Read multiple sessions matching a query. */
	readMany(query?: SessionQuery): Promise<SessionRecord[]>;

	/** Update a session record. */
	update<T = SessionData>(
		id: string,
		opts: UpdateSessionOptions<T>,
	): Promise<SessionRecord<T> | null>;

	/** Destroy a single session. */
	destroy(id: string): Promise<boolean>;

	/** Destroy every session matching a query. */
	destroyMany(query: SessionQuery): Promise<number>;

	/** Touch a session (refresh lastSeenAt / expiresAt). */
	touch(id: string): Promise<SessionRecord | null>;

	/** Garbage-collect expired sessions. Returns # removed. */
	gc(): Promise<number>;

	/** Clear every session (for tests / log-out-everywhere). */
	clear(): Promise<void>;

	/** Optional: cleanup timer / pool / connections. */
	stop?(): Promise<void>;
}

// ---------------------------------------------------------------------------
// Cookie adapter (HMAC-signed, stateless)
// ---------------------------------------------------------------------------

/**
 * The Cookie storage encodes the entire session record inside a signed
 * cookie. No server-side state. Ideal for edge runtimes.
 */
export interface CookieStorageOptions {
	/** HMAC secret (32+ bytes). */
	secret: string;
	/** Cookie name. Default: "nexus.sess". */
	cookieName?: string;
	/** Default TTL. */
	defaultTtlSeconds?: number;
	/** Cookie attributes applied on issue. */
	cookieOptions?: CookieOptions;
}

export interface CookieOptions {
	domain?: string;
	path?: string;
	httpOnly?: boolean;
	secure?: boolean;
	sameSite?: "lax" | "strict" | "none";
	maxAgeSeconds?: number;
	partitioned?: boolean;
}

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

export type SessionBackendKind = "cookie" | "memory" | "redis" | "database";

export interface SessionConfig {
	/** Backend to use. Default: 'cookie'. */
	backend?: SessionBackendKind;
	/** Cookie backend config (ignored by other backends). */
	cookie?: CookieStorageOptions;
	/** Memory backend config. */
	memory?: {
		/** GC interval in ms. Default: 60_000. */
		gcIntervalMs?: number;
		/** Max sessions in memory before evicting LRU. Default: 100_000. */
		maxSessions?: number;
	};
	/** Redis backend config (v0.2). */
	redis?: {
		connection: string | { host: string; port: number; password?: string };
		keyPrefix?: string;
	};
	/**
	 * Database backend config (uses `nexus/drizzle`).
	 *
	 *   session: {
	 *     backend: 'database',
	 *     database: { db: drizzleService, tableName: 'nexus_sessions' },
	 *   }
	 */
	database?: {
		/** A `DrizzleService` instance (or anything with `rawQuery`). */
		db: { rawQuery<T = unknown>(sql: string, params?: unknown[]): Promise<T[]> };
		/** Table name. Default: 'nexus_sessions'. */
		tableName?: string;
	};
	/** Default options applied to every session. */
	defaults?: {
		ttlSeconds?: number;
		absoluteTtlSeconds?: number;
	};
}

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------

export type SessionEvent =
	| { kind: "session:created"; id: string; userId: string | null }
	| { kind: "session:read"; id: string }
	| { kind: "session:updated"; id: string }
	| {
			kind: "session:destroyed";
			id: string;
			userId: string | null;
			reason: "logout" | "expired" | "admin" | "unknown";
	  }
	| { kind: "session:expired"; id: string }
	| { kind: "session:rotated"; oldId: string; newId: string };

export type SessionEventListener = (
	event: SessionEvent,
) => void | Promise<void>;
