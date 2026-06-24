/**
 * `DrizzleCacheStore` — cache entries backed by any Drizzle database.
 *
 *   import { DrizzleService } from 'nexusjs/drizzle';
 *   import { DrizzleCacheStore } from 'nexusjs/cache';
 *
 *   const db = new DrizzleService({ dialect: 'postgres', connection: {...} });
 *   await db.open();
 *
 *   const store = new DrizzleCacheStore(db, {
 *     tableName: 'nexus_cache',
 *   });
 *
 *   CacheModule.forRoot({ store, defaultTtl: 300 });
 *
 * Schema (managed by your migration):
 *
 *   CREATE TABLE nexus_cache (
 *     key        TEXT PRIMARY KEY,
 *     value      TEXT NOT NULL,            -- JSON-encoded
 *     expires_at TEXT,                     -- ISO timestamp, null = never
 *     created_at TEXT NOT NULL,
 *     updated_at TEXT NOT NULL
 *   );
 *
 *   CREATE TABLE nexus_cache_tags (        -- tag → key index
 *     tag        TEXT NOT NULL,
 *     key        TEXT NOT NULL,
 *     PRIMARY KEY (tag, key)
 *   );
 *   CREATE INDEX nexus_cache_tags_key_idx ON nexus_cache_tags(key);
 *
 * Why a tag table? It enables true `invalidateByTag('users')` that
 * removes every entry tagged 'users' in a single statement, regardless
 * of how many keys share the tag.
 */
import type { DrizzleService } from "@nexusts/drizzle";
import type { CacheSetOptions, CacheStore } from "../types.js";

export interface DrizzleCacheOptions {
	db: DrizzleService;
	/** Cache row table. Default: 'nexus_cache'. */
	tableName?: string;
	/** Tag index table. Default: 'nexus_cache_tags'. */
	tagsTableName?: string;
	/** Column names — override to match your schema. */
	columns?: {
		key?: string;
		value?: string;
		expiresAt?: string;
		createdAt?: string;
		updatedAt?: string;
		tag?: string;
	};
}

type CacheRow = Record<string, string | null>;
type TagRow = Record<string, string>;

export class DrizzleCacheStore implements CacheStore {
	readonly kind = "drizzle" as const;

	private db: DrizzleService;
	private t: string;
	private tagsT: string;
	private c: {
		key: string;
		value: string;
		expiresAt: string;
		createdAt: string;
		updatedAt: string;
		tag: string;
	};

	constructor(db: DrizzleService, options: Omit<DrizzleCacheOptions, "db"> = {}) {
		this.db = db;
		this.t = options.tableName ?? "nexus_cache";
		this.tagsT = options.tagsTableName ?? "nexus_cache_tags";
		this.c = {
			key: options.columns?.key ?? "key",
			value: options.columns?.value ?? "value",
			expiresAt: options.columns?.expiresAt ?? "expires_at",
			createdAt: options.columns?.createdAt ?? "created_at",
			updatedAt: options.columns?.updatedAt ?? "updated_at",
			tag: options.columns?.tag ?? "tag",
		};
	}

	async get<T = unknown>(key: string): Promise<T | undefined> {
		const rows = await this.db.rawQuery<CacheRow>(
			`SELECT * FROM ${this.t} WHERE ${this.c.key} = ? LIMIT 1`,
			[key],
		);
		const row = rows[0];
		if (!row) return undefined;
		const expiresAt = row[this.c.expiresAt];
		if (expiresAt && new Date(expiresAt).getTime() <= Date.now()) {
			// Expired — clean up lazily.
			await this.delete(key);
			return undefined;
		}
		const raw = row[this.c.value];
		if (raw === null || raw === undefined) return undefined;
		try {
			return JSON.parse(String(raw)) as T;
		} catch {
			return undefined;
		}
	}

	async set<T = unknown>(
		key: string,
		value: T,
		opts: CacheSetOptions = {},
	): Promise<void> {
		const now = new Date().toISOString();
		const expiresAt =
			opts.ttl && opts.ttl > 0
				? new Date(Date.now() + opts.ttl * 1000).toISOString()
				: null;
		const serialized = JSON.stringify(value);

		// Upsert the cache row. Different dialects use different syntax;
		// we use the simple INSERT ... ON CONFLICT pattern (works in
		// sqlite, postgres, mysql 8+).
		await this.db.rawQuery(
			`INSERT INTO ${this.t} (${this.c.key}, ${this.c.value}, ${this.c.expiresAt}, ${this.c.createdAt}, ${this.c.updatedAt})
			 VALUES (?, ?, ?, ?, ?)
			 ON CONFLICT (${this.c.key}) DO UPDATE SET
			   ${this.c.value} = excluded.${this.c.value},
			   ${this.c.expiresAt} = excluded.${this.c.expiresAt},
			   ${this.c.updatedAt} = excluded.${this.c.updatedAt}`,
			[key, serialized, expiresAt, now, now],
		);

		// Refresh tag index: delete old tags, then insert new ones.
		if (opts.tags && opts.tags.length > 0) {
			await this.db.rawQuery(
				`DELETE FROM ${this.tagsT} WHERE ${this.c.key} = ?`,
				[key],
			);
			for (const tag of opts.tags) {
				await this.db.rawQuery(
					`INSERT OR IGNORE INTO ${this.tagsT} (${this.c.tag}, ${this.c.key}) VALUES (?, ?)`,
					[tag, key],
				);
			}
		}
	}

	async delete(key: string): Promise<boolean> {
		// Cheap probe: does the row exist at all (even expired)?
		const probe = await this.db.rawQuery<CacheRow>(
			`SELECT ${this.c.key} FROM ${this.t} WHERE ${this.c.key} = ? LIMIT 1`,
			[key],
		);
		if (probe.length === 0) return false;
		await this.db.rawQuery(`DELETE FROM ${this.t} WHERE ${this.c.key} = ?`, [key]);
		await this.db.rawQuery(
			`DELETE FROM ${this.tagsT} WHERE ${this.c.key} = ?`,
			[key],
		);
		return true;
	}

	async clear(pattern?: string): Promise<number> {
		if (!pattern) {
			await this.db.rawQuery(`DELETE FROM ${this.tagsT}`);
			const before = await this.db.rawQuery<unknown>(
				`SELECT COUNT(*) as n FROM ${this.t}`,
			);
			await this.db.rawQuery(`DELETE FROM ${this.t}`);
			const n = Number((before[0] as { n?: number } | undefined)?.n ?? 0);
			return n;
		}
		// Translate glob to SQL LIKE. `*` -> `%`.
		const likePattern = pattern
			.replace(/[.+^${}()|[\]\\]/g, "\\$&")
			.replace(/\*\*/g, "%")
			.replace(/\*/g, "%");
		const before = await this.db.rawQuery<unknown>(
			`SELECT COUNT(*) as n FROM ${this.t} WHERE ${this.c.key} LIKE ? ESCAPE '\\'`,
			[likePattern],
		);
		await this.db.rawQuery(
			`DELETE FROM ${this.t} WHERE ${this.c.key} LIKE ? ESCAPE '\\'`,
			[likePattern],
		);
		return Number((before[0] as { n?: number } | undefined)?.n ?? 0);
	}

	async wrap<T>(key: string, fn: () => Promise<T>, ttl?: number): Promise<T> {
		const hit = await this.get<T>(key);
		if (hit !== undefined) return hit;
		const v = await fn();
		await this.set(key, v, { ttl });
		return v;
	}

	/**
	 * Remove every cache entry that has been tagged with `tag`.
	 * Returns the number of keys removed.
	 */
	async invalidateByTag(tag: string): Promise<number> {
		const tagRows = await this.db.rawQuery<TagRow>(
			`SELECT ${this.c.key} FROM ${this.tagsT} WHERE ${this.c.tag} = ?`,
			[tag],
		);
		const keys = tagRows.map((r) => r[this.c.key]);
		if (keys.length === 0) return 0;
		// Use a parameter list to safely delete. We chunk in case there
		// are many keys (some DBs cap the parameter count).
		const chunkSize = 100;
		let removed = 0;
		for (let i = 0; i < keys.length; i += chunkSize) {
			const chunk = keys.slice(i, i + chunkSize);
			const placeholders = chunk.map(() => "?").join(", ");
			const r1 = await this.db.rawQuery<unknown>(
				`DELETE FROM ${this.t} WHERE ${this.c.key} IN (${placeholders})`,
				chunk,
			);
			const r2 = await this.db.rawQuery<unknown>(
				`DELETE FROM ${this.tagsT} WHERE ${this.c.key} IN (${placeholders})`,
				chunk,
			);
			removed += Math.max(r1.length, r2.length, chunk.length);
		}
		return removed;
	}

	/** Clean up expired entries. */
	async gc(): Promise<number> {
		const now = new Date().toISOString();
		const before = await this.db.rawQuery<unknown>(
			`SELECT COUNT(*) as n FROM ${this.t} WHERE ${this.c.expiresAt} IS NOT NULL AND ${this.c.expiresAt} <= ?`,
			[now],
		);
		await this.db.rawQuery(
			`DELETE FROM ${this.t} WHERE ${this.c.expiresAt} IS NOT NULL AND ${this.c.expiresAt} <= ?`,
			[now],
		);
		// Drop dangling tag rows.
		await this.db.rawQuery(
			`DELETE FROM ${this.tagsT} WHERE ${this.c.key} NOT IN (SELECT ${this.c.key} FROM ${this.t})`,
		);
		return Number((before[0] as { n?: number } | undefined)?.n ?? 0);
	}

	async close(): Promise<void> {
		// No resources to release — the underlying db is owned by the user.
	}
}
