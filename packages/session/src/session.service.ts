/**
 * `SessionService` — DI-friendly facade over a `SessionStorage`.
 *
 * Two layers:
 *   - `SessionService` is the user-facing facade; controllers and
 *     services inject this and call `create / read / update /
 *     destroy / readMany`.
 *   - The underlying `SessionStorage` is one of the registered
 *     backends (`cookie` / `memory` / `redis`).
 *
 * Cookie-specific helpers (`buildSetCookie`, `buildClearCookie`) are
 * exposed when the cookie backend is configured.
 */

import { Inject, Injectable } from '@nexusts/core';
import {
	CookieSessionStorage,
	decodeSessionCookie,
	encodeSessionCookie,
	MemorySessionStorage,
} from './backends/index.js';
import {
	CloudflareKVSessionStorage,
	RedisSessionStorage,
} from './backends/redis.js';
import type {
	CreateSessionOptions,
	SessionConfig,
	SessionData,
	SessionEvent,
	SessionEventListener,
	SessionQuery,
	SessionRecord,
	SessionStorage,
	UpdateSessionOptions,
} from './types.js';

@Injectable()
export class SessionService {
	/** DI token — use with `@Inject(SessionService.TOKEN)`. */
	static readonly TOKEN = Symbol.for('nexus:SessionService');

	readonly storage: SessionStorage;
	#listeners = new Set<SessionEventListener>();
	#memory: MemorySessionStorage | null = null;
	#cookie: CookieSessionStorage | null = null;

	constructor(@Inject('SESSION_CONFIG') private readonly config: SessionConfig = {}) {
		this.storage = this.#createBackend(config);
	}

	// ===========================================================================
	// Lifecycle
	// ===========================================================================

	async start(): Promise<void> {
		if (this.#memory) this.#memory.start();
	}

	async stop(): Promise<void> {
		if (this.#memory) await this.#memory.stop();
		if (this.storage.stop) await this.storage.stop();
	}

	// ===========================================================================
	// CRUD
	// ===========================================================================

	async create<T = SessionData>(opts: CreateSessionOptions<T> = {}): Promise<SessionRecord<T>> {
		const merged = {
			ttlSeconds: this.config.defaults?.ttlSeconds,
			absoluteTtlSeconds: this.config.defaults?.absoluteTtlSeconds,
			...opts,
		};
		const record = await this.storage.create(merged);
		this.#emit({ kind: 'session:created', id: record.id, userId: record.userId });
		return record;
	}

	async read(id: string): Promise<SessionRecord | null> {
		const record = await this.storage.read(id);
		this.#emit({ kind: 'session:read', id });
		return record;
	}

	async readMany(query?: SessionQuery): Promise<SessionRecord[]> {
		return this.storage.readMany(query);
	}

	async update<T = SessionData>(
		id: string,
		opts: UpdateSessionOptions<T>,
	): Promise<SessionRecord<T> | null> {
		const updated = await this.storage.update(id, opts);
		if (updated) this.#emit({ kind: 'session:updated', id });
		return updated;
	}

	async destroy(id: string, reason: 'logout' | 'expired' | 'admin' | 'unknown' = 'logout'): Promise<boolean> {
		const record = await this.storage.read(id);
		const ok = await this.storage.destroy(id);
		if (ok) {
			this.#emit({
				kind: 'session:destroyed',
				id,
				userId: record?.userId ?? null,
				reason,
			});
		}
		return ok;
	}

	async destroyMany(query: SessionQuery): Promise<number> {
		return this.storage.destroyMany(query);
	}

	async gc(): Promise<number> {
		return this.storage.gc();
	}

	async clear(): Promise<void> {
		await this.storage.clear();
	}

	// ===========================================================================
	// Cookie helpers (only when backend = 'cookie')
	// ===========================================================================

	/** Build a `Set-Cookie` header value for a session. Cookie backend only. */
	buildSetCookie(record: SessionRecord): string | null {
		if (!this.#cookie) return null;
		return this.#cookie.buildSetCookie(record);
	}

	/** Build a `Set-Cookie` header value that clears the cookie. */
	buildClearCookie(): string | null {
		if (!this.#cookie) return null;
		return this.#cookie.buildClearCookie();
	}

	/** Cookie name (e.g. "nexus.sess"). */
	get cookieName(): string | null {
		return this.#cookie?.cookieName ?? null;
	}

	/** Decode a session cookie value. Returns null on tampering/expired. */
	decodeCookie(cookieValue: string): SessionRecord | null {
		if (!this.#cookie) return null;
		const record = this.#cookie.decode(cookieValue);
		if (!record) return null;
		if (record.expiresAt.getTime() <= Date.now()) {
			this.#emit({
				kind: 'session:destroyed',
				id: record.id,
				userId: record.userId,
				reason: 'expired',
			});
			return null;
		}
		return record;
	}

	// ===========================================================================
	// Static cookie helpers (work without a SessionService instance)
	// ===========================================================================

	static encodeCookie(record: SessionRecord, secret: string): string {
		return encodeSessionCookie(record, secret);
	}

	static decodeCookie<T = SessionData>(
		cookieValue: string,
		secret: string,
	): SessionRecord<T> | null {
		return decodeSessionCookie(cookieValue, secret);
	}

	// ===========================================================================
	// Events
	// ===========================================================================

	on(listener: SessionEventListener): () => void {
		this.#listeners.add(listener);
		return () => this.#listeners.delete(listener);
	}

	// ===========================================================================
	// Session rotation (security)
	// ===========================================================================

	/**
	 * Rotate a session's id (session-fixation defense). Creates a new
	 * record with the same data / metadata, destroys the old one.
	 */
	async rotate(id: string): Promise<SessionRecord | null> {
		const old = await this.storage.read(id);
		if (!old) return null;
		const fresh = await this.storage.create({
			ttlSeconds: Math.max(60, Math.floor((old.expiresAt.getTime() - Date.now()) / 1000)),
			absoluteTtlSeconds: old.absoluteExpiresAt
				? Math.max(60, Math.floor((old.absoluteExpiresAt.getTime() - Date.now()) / 1000))
				: undefined,
			data: old.data,
			metadata: old.metadata,
		});
		// Carry over userId (rotate doesn't sign out).
		(fresh as { userId: string | null }).userId = old.userId;
		await this.storage.destroy(id);
		this.#emit({ kind: 'session:rotated', oldId: id, newId: fresh.id });
		return fresh;
	}

	// ===========================================================================
	// Internal
	// ===========================================================================

	#createBackend(config: SessionConfig): SessionStorage {
		switch (config.backend ?? 'cookie') {
			case 'memory': {
				const backend = new MemorySessionStorage({
					gcIntervalMs: config.memory?.gcIntervalMs,
					maxSessions: config.memory?.maxSessions,
				});
				this.#memory = backend;
				return backend;
			}
			case 'cookie': {
				if (!config.cookie) {
					throw new Error('[session] backend=cookie requires `cookie.secret` in config.');
				}
				const backend = new CookieSessionStorage(config.cookie);
				this.#cookie = backend;
				return backend;
			}
			case 'redis': {
				if (!config.redis) {
					throw new Error(
						'[session] backend=redis requires `redis` in config. ' +
							'Provide `{ client: RedisClient, keyPrefix?: string }`. ' +
							'Use `createRedisClient({ ... })` from `nexusjs/redis`.',
					);
				}
				return new RedisSessionStorage(config.redis.client, {
					keyPrefix: config.redis.keyPrefix,
				});
			}
			case 'cloudflare-kv': {
				if (!config.cloudflareKv) {
					throw new Error(
						'[session] backend=cloudflare-kv requires `cloudflareKv` in config. ' +
							'Provide `{ client: RedisClient, keyPrefix?: string }` where ' +
							'`client` is a `CloudflareKVAdapter` from `nexusjs/redis`.',
					);
				}
				return new CloudflareKVSessionStorage(config.cloudflareKv.client, {
					keyPrefix: config.cloudflareKv.keyPrefix,
				});
			}
			case 'database': {
				if (!config.database) {
					throw new Error(
						'[session] backend=database requires `database` in config. ' +
							'Provide `{ db: DrizzleService, tableName?: string }`.',
					);
				}
				const { DrizzleSessionStorage } = require('./backends/drizzle.js') as typeof import('./backends/drizzle.js');
				const backend = new DrizzleSessionStorage({
					db: config.database.db as any,
					tableName: config.database.tableName,
				});
				return backend;
			}
		}
	}

	#emit(event: SessionEvent): void {
		for (const l of this.#listeners) {
			void Promise.resolve(l(event));
		}
	}
}