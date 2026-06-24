/**
 * Local-filesystem driver. Stores files under a `root` directory.
 *
 * - Path traversal is rejected (`..`, absolute paths).
 * - Creates intermediate directories on write.
 * - Uses node:fs/promises for portability with Node and Bun.
 */
import {
	mkdir,
	readdir,
	readFile,
	rename,
	stat,
	unlink,
	writeFile,
} from "node:fs/promises";
import { dirname, join, normalize, resolve, sep } from "node:path";
import type {
	FileContent,
	FileMetadata,
	ListOptions,
	ListResult,
	PutOptions,
	SignedUrlOptions,
	StorageDriver,
} from "../types.js";

export interface LocalDriverOptions {
	/** Root directory for this driver. */
	root: string;
	/** Public URL prefix used for `getSignedUrl`. Default: '/files'. */
	publicUrlPrefix?: string;
}

export class LocalDriver implements StorageDriver {
	readonly kind = "local";
	private readonly root: string;
	private readonly publicUrlPrefix: string;

	constructor(opts: LocalDriverOptions) {
		this.root = resolve(opts.root);
		this.publicUrlPrefix = opts.publicUrlPrefix ?? "/files";
	}

	private resolveKey(key: string): string {
		const safe = normalize(key).replace(/^[/\\]+/, "");
		const full = resolve(this.root, safe);
		// Ensure the resolved path is inside `root`.
		if (!full.startsWith(this.root + sep) && full !== this.root) {
			throw new Error(`Path traversal blocked: ${key}`);
		}
		return full;
	}

	async put(
		key: string,
		body: FileContent,
		_opts: PutOptions = {},
	): Promise<void> {
		const path = this.resolveKey(key);
		await mkdir(dirname(path), { recursive: true });
		const buf =
			typeof body === "string" ? Buffer.from(body, "utf-8") : Buffer.from(body);
		await writeFile(path, buf);
	}

	async get(key: string): Promise<Buffer> {
		const path = this.resolveKey(key);
		try {
			return await readFile(path);
		} catch (err) {
			if ((err as NodeJS.ErrnoException).code === "ENOENT") {
				throw new Error(`File not found: ${key}`);
			}
			throw err;
		}
	}

	async delete(key: string): Promise<boolean> {
		const path = this.resolveKey(key);
		try {
			await unlink(path);
			return true;
		} catch (err) {
			if ((err as NodeJS.ErrnoException).code === "ENOENT") return false;
			throw err;
		}
	}

	async exists(key: string): Promise<boolean> {
		try {
			await stat(this.resolveKey(key));
			return true;
		} catch {
			return false;
		}
	}

	async head(key: string): Promise<FileMetadata> {
		const path = this.resolveKey(key);
		try {
			const s = await stat(path);
			return {
				key,
				size: s.size,
				lastModified: s.mtimeMs,
			};
		} catch (err) {
			if ((err as NodeJS.ErrnoException).code === "ENOENT") {
				throw new Error(`File not found: ${key}`);
			}
			throw err;
		}
	}

	async list(opts: ListOptions = {}): Promise<ListResult> {
		const root = this.root;
		const prefix = opts.prefix ?? "";
		const all = await walk(root, "", prefix);
		all.sort();
		const limit = opts.limit ?? 1000;
		const startIdx = opts.cursor ? Number(opts.cursor) : 0;
		const endIdx = Math.min(startIdx + limit, all.length);
		const slice = all.slice(startIdx, endIdx);
		return {
			keys: slice,
			hasMore: endIdx < all.length,
			cursor: endIdx < all.length ? String(endIdx) : undefined,
		};
	}

	async getSignedUrl(
		key: string,
		_opts: SignedUrlOptions = {},
	): Promise<string> {
		// Local driver: serve via a public prefix. Real signing would require
		// an upstream reverse proxy with signature verification.
		return `${this.publicUrlPrefix}/${key}`;
	}

	async copy(src: string, dest: string): Promise<void> {
		const buf = await this.get(src);
		await this.put(dest, buf);
	}

	async move(src: string, dest: string): Promise<void> {
		const from = this.resolveKey(src);
		const to = this.resolveKey(dest);
		await mkdir(dirname(to), { recursive: true });
		await rename(from, to);
	}
}

async function walk(
	root: string,
	dir: string,
	prefix: string,
): Promise<string[]> {
	const out: string[] = [];
	const full = join(root, dir);
	let entries!: import('node:fs').Dirent[];
	try {
		entries = await readdir(full, { withFileTypes: true });
	} catch {
		return out;
	}
	for (const e of entries) {
		const rel = dir ? `${dir}/${e.name}` : e.name;
		if (e.isDirectory()) {
			// Recurse if this directory is on the prefix path
			// (e.g. searching for 'a/1' should walk into 'a').
			if (
				!prefix ||
				rel === prefix.slice(0, -1) ||
				rel.startsWith(prefix) ||
				prefix.startsWith(`${rel}/`)
			) {
				const sub = await walk(root, rel, prefix);
				out.push(...sub);
			}
		} else {
			if (!prefix || rel.startsWith(prefix)) {
				out.push(rel);
			}
		}
	}
	return out;
}
