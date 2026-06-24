/**
 * Static file serving — middleware + helpers.
 *
 * Mirrors `@adonisjs/static` + `serve-static`. Built on the platform's
 * native filesystem (Bun.file() on Bun, node:fs elsewhere).
 */

import { createReadStream } from "node:fs";
import { open, stat } from "node:fs/promises";
import { join, normalize, resolve as pathResolve, sep } from "node:path";
import type { Context, MiddlewareHandler } from "hono";

/** Configuration for `serveStatic`. */
export interface ServeStaticOptions {
	/** Filesystem root to serve files from. Default: `./public`. */
	root?: string;
	/** URL prefix. Default: `/`. */
	prefix?: string;
	/** Default file when a directory is requested. Default: `index.html`. */
	index?: string | false;
	/** `Cache-Control` header. Default: `'public, max-age=3600'`. */
	cacheControl?: string;
	/** Enable ETag generation. Default: `true`. */
	etag?: boolean;
	/** Enable range requests (for video / large files). Default: `true`. */
	range?: boolean;
	/** Max file size in bytes; larger files return 404. Default: 100 MB. */
	maxFileSize?: number;
}

/** StaticService — emits the `serveStatic` middleware. */
export class StaticService {
	/** DI token — use with `@Inject(StaticService.TOKEN)`. */
	static readonly TOKEN = Symbol.for("nexus:StaticService");

	#root: string;
	#prefix: string;
	#index: string | false;
	#cacheControl: string;
	#etag: boolean;
	#range: boolean;
	#maxFileSize: number;

	constructor(options: ServeStaticOptions = {}) {
		this.#root = pathResolve(options.root ?? "./public");
		// Normalize prefix to always start with `/` and end without `/` (except root).
		const prefix = options.prefix ?? "/";
		this.#prefix = prefix === "/" ? "/" : prefix.replace(/\/$/, "");
		this.#index =
			options.index === false ? false : (options.index ?? "index.html");
		this.#cacheControl = options.cacheControl ?? "public, max-age=3600";
		this.#etag = options.etag ?? true;
		this.#range = options.range ?? true;
		this.#maxFileSize = options.maxFileSize ?? 100 * 1024 * 1024;
	}

	/**
	 * Build a Hono middleware that serves files from `root`.
	 *
	 *   app.use('/public/*', staticService.middleware());
	 */
	middleware(): MiddlewareHandler {
		return async (c, next) => {
			const url = new URL(c.req.url);
			const pathname = decodeURIComponent(url.pathname);
			if (!pathname.startsWith(this.#prefix)) {
				return next();
			}
			// pathname e.g. "/static/test.html", prefix e.g. "/static"
			// → slice gives "/test.html". Strip leading "/" so
			// #safeResolve doesn't reject it as an absolute path.
			const rel = pathname.slice(this.#prefix.length).replace(/^\//, "");
			const safe = this.#safeResolve(rel);
			if (!safe) return next();

			let statResult: Awaited<ReturnType<typeof stat>>;
			try {
				statResult = await stat(safe);
			} catch {
				return next();
			}

			let filePath = safe;
			if (statResult.isDirectory()) {
				if (this.#index === false) return next();
				filePath = join(safe, this.#index);
				try {
					const idx = await stat(filePath);
					if (!idx.isFile()) return next();
				} catch {
					return next();
				}
			}

			// Size guard.
			let fileStat: Awaited<ReturnType<typeof stat>>;
			try {
				fileStat = await stat(filePath);
			} catch {
				return next();
			}
			const size = fileStat.size;
			if (size > this.#maxFileSize) return next();

			// ETag.
			const etag = this.#etag
				? `"${this.#computeEtag(filePath, size, fileStat.mtimeMs)}"`
				: null;
			if (etag) {
				const inm = c.req.header("if-none-match");
				if (inm && inm === etag) {
					return new Response(null, { status: 304 });
				}
				c.header("ETag", etag);
			}

			// Range requests.
			const range = c.req.header("range");
			if (this.#range && range) {
				const m = /^bytes=(\d*)-(\d*)$/.exec(range);
				if (m) {
					const start = m[1] ? Number(m[1]) : 0;
					const end = m[2] ? Number(m[2]) : size - 1;
					if (start >= size || end >= size || start > end) {
						return new Response("Range Not Satisfiable", {
							status: 416,
							headers: { "Content-Range": `bytes */${size}` },
						});
					}
					const slice = await this.#readSlice(filePath, start, end);
					return new Response(slice as BodyInit, {
						status: 206,
						headers: {
							"Content-Type": this.#mime(filePath),
							"Content-Length": String(end - start + 1),
							"Content-Range": `bytes ${start}-${end}/${size}`,
							"Cache-Control": this.#cacheControl,
							"Accept-Ranges": "bytes",
						},
					});
				}
			}

			// Full body.
			const body = createReadStream(filePath);
			return new Response(body as unknown as ReadableStream, {
				status: 200,
				headers: {
					"Content-Type": this.#mime(filePath),
					"Content-Length": String(size),
					"Cache-Control": this.#cacheControl,
					"Accept-Ranges": "bytes",
					...(etag ? { ETag: etag } : {}),
				},
			});
		};
	}

	// ===========================================================================
	// Internal
	// ===========================================================================

	#safeResolve(rel: string): string | null {
		// Reject path traversal: no `..`, no absolute paths, no drive letters.
		if (rel.includes("..")) return null;
		if (rel.startsWith("/") || /^[a-zA-Z]:/.test(rel)) return null;
		const joined = join(this.#root, rel);
		const norm = normalize(joined);
		// Make sure the result is still under `root`.
		if (!norm.startsWith(this.#root + sep) && norm !== this.#root) return null;
		return norm;
	}

	#computeEtag(_path: string, size: number, mtimeMs: number): string {
		// Simple hash: size + mtime bucket.
		const bucket = Math.floor(mtimeMs / 1000);
		const hash = `${size}-${bucket}`;
		return Buffer.from(hash).toString("base64url");
	}

	async #readSlice(path: string, start: number, end: number): Promise<Buffer> {
		const fh = await open(path, "r");
		try {
			const length = end - start + 1;
			const buf = Buffer.alloc(length);
			await fh.read(buf, 0, length, start);
			return buf;
		} finally {
			await fh.close();
		}
	}

	#mime(path: string): string {
		const ext = path.slice(path.lastIndexOf(".") + 1).toLowerCase();
		const map: Record<string, string> = {
			html: "text/html; charset=utf-8",
			htm: "text/html; charset=utf-8",
			css: "text/css; charset=utf-8",
			js: "application/javascript; charset=utf-8",
			mjs: "application/javascript; charset=utf-8",
			json: "application/json; charset=utf-8",
			svg: "image/svg+xml",
			png: "image/png",
			jpeg: "image/jpeg",
			jpg: "image/jpeg",
			gif: "image/gif",
			webp: "image/webp",
			ico: "image/x-icon",
			pdf: "application/pdf",
			txt: "text/plain; charset=utf-8",
			woff: "font/woff",
			woff2: "font/woff2",
			mp4: "video/mp4",
			webm: "video/webm",
			mp3: "audio/mpeg",
		};
		return map[ext] ?? "application/octet-stream";
	}
}
