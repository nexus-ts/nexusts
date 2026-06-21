/**
 * `DrizzleRepository` — Lucid-style repository pattern.
 *
 * Subclass it with a Drizzle table object to get typed queries out of
 * the box. Drizzle's own column types and operators are passed in via
 * the `where`, `orderBy`, etc. options — this class is intentionally
 * thin so it doesn't fight Drizzle's type system.
 *
 *   import { pgTable, serial, text, timestamp } from 'drizzle-orm/pg-core';
 *   import { eq, desc } from 'drizzle-orm';
 *   import { DrizzleRepository, DrizzleService } from 'nexus/drizzle';
 *
 *   const users = pgTable('users', {
 *     id: serial('id').primaryKey(),
 *     email: text('email').notNull(),
 *     createdAt: timestamp('created_at').defaultNow(),
 *   });
 *
 *   class UserRepository extends DrizzleRepository<typeof users> {
 *     constructor(db: DrizzleService) { super(db, users); }
 *   }
 *
 *   const repo = new UserRepository(db);
 *   await repo.findAll({ where: eq(users.email, 'a@b.com'), limit: 10, orderBy: desc(users.createdAt) });
 *   await repo.create({ email: 'a@b.com' });
 *   await repo.updateById(42, { email: 'new@x.com' });
 *   await repo.deleteById(42);
 */
import type { DrizzleService } from "../drizzle.service.js";

export type Where = any;
export type OrderBy = any;

export interface FindAllOptions {
	where?: Where;
	limit?: number;
	offset?: number;
	orderBy?: OrderBy | OrderBy[];
}

export class DrizzleRepository<TTable = any, TRow = Record<string, unknown>> {
	constructor(
		protected readonly db: DrizzleService,
		protected readonly table: TTable,
	) {}

	/** Direct Drizzle client (for advanced queries). */
	get client(): any {
		return this.db.client;
	}

	/** Return all rows matching `opts`. */
	async findAll(opts: FindAllOptions = {}): Promise<TRow[]> {
		let q: any = this.db.client.select().from(this.table);
		if (opts.where) q = q.where(opts.where);
		if (opts.orderBy) {
			const arr = Array.isArray(opts.orderBy) ? opts.orderBy : [opts.orderBy];
			q = q.orderBy(...arr);
		}
		if (opts.limit !== undefined) q = q.limit(opts.limit);
		if (opts.offset !== undefined) q = q.offset(opts.offset);
		const result = q.all ? await q.all() : await q;
		return result as TRow[];
	}

	/** Return the first row matching `where`. */
	async findOne(where: Where): Promise<TRow | undefined> {
		const rows = await this.findAll({ where, limit: 1 });
		return rows[0];
	}

	/** Count rows matching `where`. */
	async count(where?: Where): Promise<number> {
		const tableName = this._tableName();
		const rows = where
			? await this.db.rawQuery<{ count: number }>(
					`SELECT COUNT(*) as count FROM ${tableName} WHERE ${whereSql(where)}`,
					whereParams(where),
				)
			: await this.db.rawQuery<{ count: number }>(
					`SELECT COUNT(*) as count FROM ${tableName}`,
				);
		return Number(rows[0]?.count ?? 0);
	}

	/** Insert one or more rows. Returns the inserted row(s). */
	async create(values: Partial<TRow> | Array<Partial<TRow>>): Promise<TRow | TRow[]> {
		const isArr = Array.isArray(values);
		const q = (this.db.client.insert(this.table) as any)
			.values(values as any)
			.returning();
		const rows = (await q) as TRow[];
		return isArr ? rows : rows[0];
	}

	/** Update rows matching `where`. Returns the updated rows. */
	async update(where: Where, patch: Partial<TRow>): Promise<TRow[]> {
		const q = (this.db.client.update(this.table) as any)
			.set(patch)
			.where(where)
			.returning();
		return (await q) as TRow[];
	}

	/** Delete rows matching `where`. Returns the number of affected rows. */
	async delete(where: Where): Promise<number> {
		const tableName = this._tableName();
		const r = await this.db.rawQuery(
			`DELETE FROM ${tableName} WHERE ${whereSql(where)}`,
			whereParams(where),
		);
		return r.length;
	}

	/** Run `fn` inside a transaction. */
	async transaction<T>(fn: (tx: DrizzleRepository<TTable, TRow>) => Promise<T>): Promise<T> {
		return this.db.transaction(async (txDb) => {
			const txRepo = Object.create(this) as DrizzleRepository<TTable, TRow>;
			Object.defineProperty(txRepo, "db", { value: txDb, writable: false });
			return fn(txRepo);
		});
	}

	private _tableName(): string {
		const t = this.table as any;
		return t?._?.name ?? t?.name ?? String(t);
	}
}

/**
 * Translate a Drizzle `where` (which is a SQL chunk tree) into a SQL
 * text + params array suitable for `db.rawQuery`.
 *
 * For simple column-value objects, produces `col = ?` with the value.
 * For Drizzle SQL chunks, recurses into the chunk tree to extract the
 * rendered text + bound params.
 */
function whereSql(where: Where): string {
	// Column equality shortcut: `{ email: 'a@b.com' }` becomes `email = ?`.
	if (where && typeof where === "object" && !Array.isArray(where) && !(where as any).queryChunks) {
		const parts: string[] = [];
		for (const k of Object.keys(where)) parts.push(`${k} = ?`);
		return parts.join(" AND ");
	}
	// Drizzle SQL chunk — render to text + params.
	return drizzleSqlToText(where).text;
}

function whereParams(where: Where): unknown[] {
	if (where && typeof where === "object" && !Array.isArray(where) && !(where as any).queryChunks) {
		return Object.values(where);
	}
	return drizzleSqlToText(where).params;
}

/**
 * Render a Drizzle SQL chunk into (text, params).
 *
 * Drizzle's `sql` chunks are nested trees of `SQL` and `Param`
 * objects. We walk the tree:
 *   - string chunk → part of SQL text
 *   - Param → `?` placeholder, value goes into params
 *   - SQL chunk → recurse
 *
 * This is a portable conversion that produces text compatible with
 * every dialect (postgres / mysql / sqlite — they all accept `?` in
 * prepared statements via their respective drivers).
 */
function drizzleSqlToText(node: any, out?: { text: string; params: unknown[] }): {
	text: string;
	params: unknown[];
} {
	out = out ?? { text: "", params: [] };
	if (node === null || node === undefined) return out;
	if (typeof node === "string") {
		out.text += node;
		return out;
	}
	if (typeof node === "number" || typeof node === "boolean") {
		out.text += String(node);
		return out;
	}
	if (Array.isArray(node)) {
		for (const c of node) drizzleSqlToText(c, out);
		return out;
	}
	// Drizzle SQL class.
	if (node.queryChunks && Array.isArray(node.queryChunks)) {
		for (const c of node.queryChunks) drizzleSqlToText(c, out);
		return out;
	}
	// Drizzle Param class — has `value` and renders to a placeholder.
	if ("value" in node && node.value !== undefined) {
		out.text += "?";
		out.params.push(node.value);
		return out;
	}
	if (typeof node.getSQL === "function") {
		return drizzleSqlToText(node.getSQL(), out);
	}
	return out;
}
