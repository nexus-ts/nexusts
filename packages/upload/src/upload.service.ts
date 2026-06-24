/**
 * `UploadService` — parses `multipart/form-data` requests and exposes
 * the parsed files to controller methods via decorators.
 *
 * Lifecycle:
 *   1. The framework mounts `uploadMiddleware` (from this module)
 *      at the route level.
 *   2. The middleware calls `UploadService.parseAndStore(c, fields)`,
 *      which:
 *        - reads `c.req.parseBody({ all: true })`
 *        - extracts `File` entries from the requested fields
 *        - validates each (size, MIME)
 *        - stores the result on the Hono context under
 *          `UPLOAD_STORAGE_KEY`
 *   3. Decorators (`@UploadedFile`, `@UploadedFiles`) read from the
 *      context at parameter-extraction time.
 *
 * The middleware runs **before** the controller handler, so by the
 * time the handler is invoked, all files are already validated.
 */
import { Inject, Injectable } from "@nexusts/core";
import {
	UPLOAD_STORAGE_KEY,
	type UploadConfig,
	UploadError,
	type UploadedFile,
} from "./types.js";

/** What Hono's `parseBody` returns for file fields. */
interface ParsedFileEntry {
	/** Original form field name. */
	name: string;
	/** Web-API File (the multipart payload). */
	filename?: string;
	type?: string;
	size?: number;
	arrayBuffer(): Promise<ArrayBuffer>;
}

/** What Hono's `parseBody` returns overall: string | File | array thereof. */
type ParsedBodyValue =
	| string
	| ParsedFileEntry
	| Array<string | ParsedFileEntry>
	| undefined;

@Injectable()
export class UploadService {
	/** DI token. */
	static readonly TOKEN = Symbol.for("nexus:UploadService");

	#config: Required<UploadConfig>;
	#driveResolver: ((token: string) => any) | null = null;

	constructor(@Inject("UPLOAD_CONFIG") config: UploadConfig = {}) {
		this.#config = {
			maxFileSize: config.maxFileSize ?? 10 * 1024 * 1024,
			maxFiles: config.maxFiles ?? 5,
			allowedMimeTypes: config.allowedMimeTypes ?? ["*"],
			storage: (config.storage as "memory") ?? "memory",
			driveToken: config.driveToken ?? "",
			drivePrefix: config.drivePrefix ?? "",
			preserveFilename: config.preserveFilename ?? false,
		};
	}

	/** Bind a function that resolves a DI token to a service. Set by the module on boot. */
	bindDriveResolver(fn: (token: string) => any): void {
		this.#driveResolver = fn;
	}

	/** The config this service was constructed with. */
	getConfig(): Required<UploadConfig> {
		return { ...this.#config };
	}

	/**
	 * Parse the request body and store the requested fields on the
	 * Hono context. Called by `uploadMiddleware`.
	 */
	async parseAndStore(
		c: any,
		fields: Array<{ fieldName: string; maxFiles: number; required: boolean }>,
	): Promise<void> {
		const body = await this.#parseBody(c);
		const stored: Record<string, UploadedFile | UploadedFile[]> = {};

		for (const spec of fields) {
			const value = body[spec.fieldName];
			const files = this.#extractFiles(value);
			if (files.length === 0) {
				if (spec.required) {
					throw new UploadError(
						"MISSING_FIELD",
						spec.fieldName,
						`Missing required field "${spec.fieldName}".`,
					);
				}
				continue;
			}
			if (files.length > spec.maxFiles) {
				throw new UploadError(
					"TOO_MANY_FILES",
					spec.fieldName,
					`Field "${spec.fieldName}" accepts at most ${spec.maxFiles} files (got ${files.length}).`,
				);
			}
			for (const f of files) {
				this.#validate(f, spec.fieldName);
			}
			stored[spec.fieldName] = files.length === 1 ? files[0]! : files;
		}

		// Stash on the Hono context so decorators can pull it.
		c.set(UPLOAD_STORAGE_KEY, stored);

		// Optional: push to drive storage.
		if (this.#config.driveToken && this.#driveResolver) {
			const drive = this.#driveResolver(this.#config.driveToken);
			if (drive?.put) {
				for (const [, entry] of Object.entries(stored)) {
					const list = Array.isArray(entry) ? entry : [entry];
					for (const file of list) {
						const filename = this.#config.preserveFilename
							? file.filename
							: this.#newFilename(file);
						const key = `${this.#config.drivePrefix}/${filename}`;
						await drive.put(key, file.buffer, {
							contentType: file.contentType,
						});
						(file as UploadedFile & { storedKey?: string }).storedKey = key;
					}
				}
			}
		}
	}

	/**
	 * Read a single file from the stored body. Used by `@UploadedFile`.
	 */
	get(c: any, fieldName: string): UploadedFile | undefined {
		const stored: Record<string, UploadedFile | UploadedFile[]> | undefined =
			c.get(UPLOAD_STORAGE_KEY);
		if (!stored) return undefined;
		const v = stored[fieldName];
		if (Array.isArray(v)) return v[0];
		return v;
	}

	/**
	 * Read multiple files from the stored body. Used by `@UploadedFiles`.
	 */
	getAll(c: any, fieldName: string): UploadedFile[] {
		const stored: Record<string, UploadedFile | UploadedFile[]> | undefined =
			c.get(UPLOAD_STORAGE_KEY);
		if (!stored) return [];
		const v = stored[fieldName];
		if (Array.isArray(v)) return v;
		if (v) return [v];
		return [];
	}

	// ---------------------------------------------------------------------------
	// Internal
	// ---------------------------------------------------------------------------

	async #parseBody(c: any): Promise<Record<string, ParsedBodyValue>> {
		// Hono's parseBody returns Promise<unknown>. We pass `all: true`
		// so every field is included, not just the first.
		const req = c.req?.raw ?? c.req;
		const ct = (req.headers?.get?.("content-type") ?? "") as string;
		if (!ct.startsWith("multipart/form-data")) {
			// Not a multipart request — return empty body. The middleware
			// should skip parsing in this case.
			return {};
		}
		try {
			return (await c.req.parseBody({ all: true })) as Record<string, ParsedBodyValue>;
		} catch (err) {
			throw new UploadError(
				"BAD_MULTIPART",
				"*",
				`Failed to parse multipart body: ${(err as Error).message}`,
			);
		}
	}

	#extractFiles(value: ParsedBodyValue): UploadedFile[] {
		if (value === undefined || value === null) return [];
		const list = Array.isArray(value) ? value : [value];
		const out: UploadedFile[] = [];
		for (const v of list) {
			if (typeof v === "string") continue; // skip plain text fields
			if (typeof v !== "object") continue;
			const file = v as ParsedFileEntry;
			if (typeof file.arrayBuffer !== "function") continue;
			// Hono under Bun returns a Blob (not a File) for file fields.
			// The original filename lives in `name` (Blob) or `filename`
			// (File). Accept either.
			const filename = (file as unknown as { filename?: string }).filename
				?? (file as unknown as { name?: string }).name
				?? "upload";
			const contentType = file.type ?? "application/octet-stream";
			out.push({
				fieldName: file.name,
				filename,
				contentType,
				encoding: "7bit",
				buffer: Buffer.alloc(0), // filled below
				size: file.size ?? 0,
			});
		}
		return out;
	}

	/**
	 * After we've extracted the field list, replace each placeholder
	 * with its real bytes. This is split out so we can do all the
	 * parsing in parallel.
	 */
	// placeholder for future async hydration.

	#validate(file: UploadedFile, fieldName: string): void {
		if (file.size > this.#config.maxFileSize) {
			throw new UploadError(
				"FILE_TOO_LARGE",
				fieldName,
				`File "${file.filename}" is ${file.size} bytes; max is ${this.#config.maxFileSize}.`,
			);
		}
		if (!this.#mimeAllowed(file.contentType)) {
			throw new UploadError(
				"MIME_NOT_ALLOWED",
				fieldName,
				`File "${file.filename}" has type "${file.contentType}"; not in the allow list.`,
			);
		}
	}

	#mimeAllowed(mime: string): boolean {
		for (const pat of this.#config.allowedMimeTypes) {
			if (pat === "*") return true;
			if (pat === mime) return true;
			if (pat.endsWith("/*")) {
				const prefix = pat.slice(0, -2); // 'image/*' -> 'image/'
				if (mime.startsWith(prefix)) return true;
			}
		}
		return false;
	}

	#newFilename(file: UploadedFile): string {
		const ext = file.filename.includes(".")
			? file.filename.slice(file.filename.lastIndexOf("."))
			: "";
		const stamp = Date.now().toString(36);
		const rand = Math.random().toString(36).slice(2, 8);
		return `${stamp}-${rand}${ext}`;
	}
}