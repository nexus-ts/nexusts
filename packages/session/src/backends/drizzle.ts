/**
 * `DrizzleSessionStorage` — session storage backed by any Drizzle database.
 *
 *   import { DrizzleService } from 'nexusjs/drizzle';
 *   import { SessionService } from 'nexusjs/session';
 *
 *   const db = new DrizzleService({ dialect: 'postgres', connection: {... } });
 *   await db.open();
 *   await db.raw`CREATE TABLE IF NOT EXISTS nexus_sessions (...)`.execute();
 *
 *   const storage = new DrizzleSessionStorage(db, 'nexus_sessions');
 *   const session = new SessionService({ backend: 'drizzle', drizzle: { storage } });
 *
 * Schema (managed by the user / migrations):
 *
 *   CREATE TABLE nexus_sessions (
 *     id           TEXT PRIMARY KEY,
 *     user_id      TEXT,
 *     data         JSONB,
 *     created_at   TIMESTAMP NOT NULL,
 *     last_seen_at TIMESTAMP NOT NULL,
 *     expires_at   TIMESTAMP NOT NULL,
 *     absolute_expires_at TIMESTAMP,
 *     metadata     JSONB
 *   );
 */
import type { DrizzleService } from "@nexusts/drizzle";
import type {
	CreateSessionOptions,
	SessionData,
	SessionMetadata,
	SessionQuery,
	SessionRecord,
	SessionStorage,
	UpdateSessionOptions,
} from "../types.js";

export interface DrizzleSessionOptions {
	/** DrizzleService instance. */
	db: DrizzleService;
	/** Table name. Default: 'nexus_sessions'. */
	tableName?: string;
	/** Column mapping. Override to match your schema. */
	columns?: {
		id?: string;
		userId?: string;
		data?: string;
		createdAt?: string;
		lastSeenAt?: string;
		expiresAt?: string;
		absoluteExpiresAt?: string;
		metadata?: string;
	};
}

export class DrizzleSessionStorage implements SessionStorage {
	readonly name = "database" as const;

	private db: DrizzleService;
	private tableName: string;
	private cols: Required<NonNullable<DrizzleSessionOptions["columns"]>>;

	constructor(options: DrizzleSessionOptions) {
		this.db = options.db;
		this.tableName = options.tableName ?? "nexus_sessions";
		this.cols = {
			id: options.columns?.id ?? "id",
			userId: options.columns?.userId ?? "user_id",
			data: options.columns?.data ?? "data",
			createdAt: options.columns?.createdAt ?? "created_at",
			lastSeenAt: options.columns?.lastSeenAt ?? "last_seen_at",
			expiresAt: options.columns?.expiresAt ?? "expires_at",
			absoluteExpiresAt:
				options.columns?.absoluteExpiresAt ?? "absolute_expires_at",
			metadata: options.columns?.metadata ?? "metadata",
		};
	}

	async create<T = SessionData>(
		opts: CreateSessionOptions<T>,
	): Promise<SessionRecord<T>> {
		const now = new Date();
		const record: SessionRecord<T> = {
			id: opts.id ?? randomId(),
			userId: null,
			data: (opts.data ?? {}) as T,
			createdAt: now,
			lastSeenAt: now,
			expiresAt: new Date(
				now.getTime() + (opts.ttlSeconds ?? 60 * 60 * 24 * 7) * 1000,
			),
		};
		if (opts.absoluteTtlSeconds) {
			record.absoluteExpiresAt = new Date(
				now.getTime() + opts.absoluteTtlSeconds * 1000,
			);
		}
		if (opts.metadata) record.metadata = opts.metadata;

		await this.db.rawQuery(
			`INSERT INTO ${this.tableName} (${this.cols.id}, ${this.cols.userId}, ${this.cols.data}, ${this.cols.createdAt}, ${this.cols.lastSeenAt}, ${this.cols.expiresAt}, ${this.cols.absoluteExpiresAt}, ${this.cols.metadata})
			 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
			[
				record.id,
				record.userId,
				JSON.stringify(record.data),
				toTimestamp(record.createdAt),
				toTimestamp(record.lastSeenAt),
				toTimestamp(record.expiresAt),
				record.absoluteExpiresAt ? toTimestamp(record.absoluteExpiresAt) : null,
				record.metadata ? JSON.stringify(record.metadata) : null,
			],
		);
		return record;
	}

	async read(id: string): Promise<SessionRecord | null> {
		const rows = await this.db.rawQuery<SessionRow>(
			`SELECT * FROM ${this.tableName} WHERE ${this.cols.id} = ? LIMIT 1`,
			[id],
		);
		return rows[0] ? this.rowToRecord(rows[0]) : null;
	}

	async readMany(query: SessionQuery = {}): Promise<SessionRecord[]> {
		const where: string[] = [];
		const params: unknown[] = [];
		if (query.userId !== undefined) {
			where.push(`${this.cols.userId} = ?`);
			params.push(query.userId);
		}
		const whereSql = where.length > 0 ? `WHERE ${where.join(" AND ")}` : "";
		const limit = query.limit ?? 1000;
		const rows = await this.db.rawQuery<SessionRow>(
			`SELECT * FROM ${this.tableName} ${whereSql} ORDER BY ${this.cols.createdAt} DESC LIMIT ?`,
			[...params, limit],
		);
		return rows.map((r) => this.rowToRecord(r));
	}

	async update<T = SessionData>(
		id: string,
		opts: UpdateSessionOptions<T>,
	): Promise<SessionRecord<T> | null> {
		const sets: string[] = [];
		const params: unknown[] = [];
		if (opts.dataPatch !== undefined) {
			sets.push(`${this.cols.data} = ?`);
			params.push(JSON.stringify(opts.dataPatch));
		}
		if (opts.extendSeconds !== undefined) {
			sets.push(`${this.cols.expiresAt} = ?`);
			params.push(
				toTimestamp(new Date(Date.now() + opts.extendSeconds * 1000)),
			);
		}
		if (sets.length === 0)
			return this.read(id) as Promise<SessionRecord<T> | null>;
		sets.push(`${this.cols.lastSeenAt} = ?`);
		params.push(toTimestamp(new Date()));
		params.push(id);
		await this.db.rawQuery(
			`UPDATE ${this.tableName} SET ${sets.join(", ")} WHERE ${this.cols.id} = ?`,
			params,
		);
		return this.read(id) as Promise<SessionRecord<T> | null>;
	}

	async touch(id: string): Promise<SessionRecord | null> {
		await this.db.rawQuery(
			`UPDATE ${this.tableName} SET ${this.cols.lastSeenAt} = ? WHERE ${this.cols.id} = ?`,
			[toTimestamp(new Date()), id],
		);
		return this.read(id);
	}

	async destroy(id: string): Promise<boolean> {
		const existing = await this.read(id);
		if (!existing) return false;
		await this.db.rawQuery(
			`DELETE FROM ${this.tableName} WHERE ${this.cols.id} = ?`,
			[id],
		);
		return true;
	}

	async destroyMany(query: SessionQuery = {}): Promise<number> {
		const where: string[] = [];
		const params: unknown[] = [];
		if (query.userId !== undefined) {
			where.push(`${this.cols.userId} = ?`);
			params.push(query.userId);
		}
		const whereSql = where.length > 0 ? `WHERE ${where.join(" AND ")}` : "";
		await this.db.rawQuery(`DELETE FROM ${this.tableName} ${whereSql}`, params);
		return 0; // not all dialects return rowCount; treat as unknown
	}

	async gc(): Promise<number> {
		await this.db.rawQuery(
			`DELETE FROM ${this.tableName} WHERE ${this.cols.expiresAt} < ?`,
			[toTimestamp(new Date())],
		);
		return 0;
	}

	async clear(): Promise<void> {
		await this.db.rawQuery(`DELETE FROM ${this.tableName}`);
	}

	async start(): Promise<void> {
		// No background timer — the DB is the source of truth.
	}

	async stop(): Promise<void> {
		// No background tasks to stop.
	}

	// ===========================================================================
	// Internal
	// ===========================================================================

	private rowToRecord(row: SessionRow): SessionRecord {
		const r: SessionRecord = {
			id: String(row[this.cols.id]),
			userId: row[this.cols.userId] as string | null,
			data: parseJson(row[this.cols.data]) ?? {},
			createdAt: fromTimestamp(row[this.cols.createdAt]),
			lastSeenAt: fromTimestamp(row[this.cols.lastSeenAt]),
			expiresAt: fromTimestamp(row[this.cols.expiresAt]),
		};
		const abs = row[this.cols.absoluteExpiresAt];
		if (abs) r.absoluteExpiresAt = fromTimestamp(abs);
		const meta = row[this.cols.metadata];
		if (meta) r.metadata = parseJson(meta) as SessionMetadata;
		return r;
	}
}

interface SessionRow {
	[key: string]: unknown;
}

function toTimestamp(d: Date): string {
	return d.toISOString();
}

function fromTimestamp(v: unknown): Date {
	if (v instanceof Date) return v;
	if (typeof v === "string") return new Date(v);
	if (typeof v === "number") return new Date(v);
	return new Date();
}

function parseJson(v: unknown): any {
	if (typeof v !== "string") return v;
	try {
		return JSON.parse(v);
	} catch {
		return null;
	}
}

function randomId(bytes = 24): string {
	const arr = new Uint8Array(bytes);
	crypto.getRandomValues(arr);
	return Buffer.from(arr).toString("base64url");
}
