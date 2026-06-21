/**
 * In-memory storage driver. Useful for tests, ephemeral state, and
 * single-process deploys that need a quick KV-like store.
 */
import type {
	FileContent,
	FileMetadata,
	ListOptions,
	ListResult,
	PutOptions,
	SignedUrlOptions,
	StorageDriver,
} from "../types.js";

interface MemEntry {
	body: Buffer;
	meta: FileMetadata;
}

export class MemoryDriver implements StorageDriver {
	readonly kind = "memory";
	private data = new Map<string, MemEntry>();

	async put(key: string, body: FileContent, opts: PutOptions = {}): Promise<void> {
		const buf = toBuffer(body);
		const contentType = opts.contentType ?? "application/octet-stream";
		this.data.set(key, {
			body: buf,
			meta: {
				key,
				size: buf.length,
				contentType,
				lastModified: Date.now(),
				etag: simpleEtag(buf),
				metadata: opts.metadata,
			},
		});
	}

	async get(key: string): Promise<Buffer> {
		const e = this.data.get(key);
		if (!e) throw new Error(`File not found: ${key}`);
		return e.body;
	}

	async delete(key: string): Promise<boolean> {
		return this.data.delete(key);
	}

	async exists(key: string): Promise<boolean> {
		return this.data.has(key);
	}

	async head(key: string): Promise<FileMetadata> {
		const e = this.data.get(key);
		if (!e) throw new Error(`File not found: ${key}`);
		return { ...e.meta };
	}

	async list(opts: ListOptions = {}): Promise<ListResult> {
		const all = [...this.data.keys()].sort();
		const prefix = opts.prefix ?? "";
		const filtered = prefix ? all.filter((k) => k.startsWith(prefix)) : all;
		const limit = opts.limit ?? 1000;
		const startIdx = opts.cursor ? Number(opts.cursor) : 0;
		const endIdx = Math.min(startIdx + limit, filtered.length);
		const slice = filtered.slice(startIdx, endIdx);
		return {
			keys: slice,
			hasMore: endIdx < filtered.length,
			cursor: endIdx < filtered.length ? String(endIdx) : undefined,
		};
	}

	async getSignedUrl(key: string, _opts: SignedUrlOptions = {}): Promise<string> {
		if (!this.data.has(key)) throw new Error(`File not found: ${key}`);
		// No signing in-memory; return a sentinel URL.
		return `memory://${encodeURIComponent(key)}`;
	}

	async copy(src: string, dest: string): Promise<void> {
		const e = this.data.get(src);
		if (!e) throw new Error(`File not found: ${src}`);
		this.data.set(dest, { body: e.body, meta: { ...e.meta, key: dest, lastModified: Date.now() } });
	}

	async move(src: string, dest: string): Promise<void> {
		await this.copy(src, dest);
		this.data.delete(src);
	}
}

function toBuffer(body: FileContent): Buffer {
	if (typeof body === "string") return Buffer.from(body, "utf-8");
	return Buffer.isBuffer(body) ? body : Buffer.from(body);
}

function simpleEtag(buf: Buffer): string {
	// Not cryptographic; just a stable hash for cache invalidation.
	let h = 5381;
	for (let i = 0; i < buf.length; i++) h = ((h << 5) + h + buf[i]) | 0;
	return `"${(h >>> 0).toString(16)}"`;
}
