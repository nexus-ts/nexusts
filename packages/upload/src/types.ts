/**
 * `nexusjs/upload` — file upload helper.
 *
 *   @Module({
 *     imports: [
 *       UploadModule.forRoot({
 *         maxFileSize: 10 * 1024 * 1024,   // 10MB per file
 *         maxFiles: 5,
 *         allowedMimeTypes: ['image/*', 'application/pdf'],
 *         storage: 'memory',               // or 'drive' (uses nexus/drive)
 *       }),
 *     ],
 *   })
 *
 *   @Post('/avatars')
 *   @Upload('avatar')                    // form field name
 *   async upload(@UploadedFile('avatar') file: UploadedFile) {
 *     return { size: file.size, type: file.contentType };
 *   }
 *
 *   @Post('/photos')
 *   async multi(@UploadedFiles('photos') files: UploadedFile[]) {
 *     return files.length;
 *   }
 */

import { METADATA_KEY } from "@nexusts/core";
import { safeGetMeta, safeDefineMeta, safeHasMeta } from "@nexusts/core/di/safe-reflect";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * A file that has been parsed from `multipart/form-data`.
 *
 * The framework reads the entire body into memory (with a hard cap
 * enforced by `maxFileSize`) and exposes it as a `Buffer`. For very
 * large files (gigabytes), use a streaming approach instead — the
 * middleware leaves `stream` populated when the file is too large
 * to buffer.
 */
export interface UploadedFile {
	/** Form field name (e.g. "avatar", "photos"). */
	fieldName: string;
	/** Filename from the client (e.g. "my-photo.png"). */
	filename: string;
	/** MIME type from the client. */
	contentType: string;
	/** Encoding (typically '7bit'). */
	encoding: string;
	/** File content. */
	buffer: Buffer;
	/** Convenience: same as `buffer.length`. */
	size: number;
}

/** Top-level config. */
export interface UploadConfig {
	/** Max bytes per file. Default: 10 MB. */
	maxFileSize?: number;
	/** Max number of files per request. Default: 5. */
	maxFiles?: number;
	/**
	 * Allowed MIME types. Supports `*` wildcards:
	 *   'image/*'   — any image type
	 *   'application/pdf'
	 *   'video/mp4'
	 * Default: '*' (any).
	 */
	allowedMimeTypes?: string[];
	/**
	 * Where parsed files are stored in memory. Default: 'memory'.
	 * The decorator reads from this storage on each access.
	 */
	storage?: "memory";
	/**
	 * When set, parsed files are also pushed to the configured
	 * `nexusjs/drive` storage under this prefix. The drive is
	 * resolved by the DI token string.
	 */
	driveToken?: string;
	drivePrefix?: string;
	/** When using drive storage: keep the original filename. Default: false (UUID). */
	preserveFilename?: boolean;
}

// ---------------------------------------------------------------------------
// Decorator payload
// ---------------------------------------------------------------------------

export interface UploadOptions {
	/** Form field name. Default: property name. */
	name?: string;
	/** Per-field max size (overrides the global default). */
	maxSize?: number;
	/** Per-field MIME-type filter. */
	mimeTypes?: string[];
	/** Per-field max files (for multi-file). Default: 1. */
	maxFiles?: number;
	/** Whether the field is required. Default: true. */
	required?: boolean;
}

// ---------------------------------------------------------------------------
// Validation errors
// ---------------------------------------------------------------------------

export class UploadError extends Error {
	readonly status = 400;
	readonly code: string;
	readonly field: string;
	constructor(code: string, field: string, message: string) {
		super(message);
		this.code = code;
		this.field = field;
		this.name = "UploadError";
	}
}

// ---------------------------------------------------------------------------
// Middleware storage key (per-request)
// ---------------------------------------------------------------------------

/** Key under which the multipart middleware stores parsed files. */
export const UPLOAD_STORAGE_KEY = "nexus:upload:files";

/** Internal metadata key (decorator). */
export const UPLOAD_META = "nexus:upload:options";

export { METADATA_KEY };
