/**
import { safeGetMeta, safeDefineMeta, safeHasMeta } from "@nexusts/core/di/safe-reflect";
 * `nexusjs/drive` — file storage abstraction.
 *
 *   const drive = new DriveService({ driver: new LocalDriver({ root: '/var/data' }) });
 *   await drive.put('avatars/42.png', bytes, { contentType: 'image/png' });
 *   const buf = await drive.get('avatars/42.png');
 *
 * Drivers:
 *   - `LocalDriver` — local filesystem
 *   - `MemoryDriver` — in-memory map (tests, ephemeral)
 *   - `S3Driver` — AWS S3 / Cloudflare R2 (peer dep: @aws-sdk/client-s3)
 *
 *   drive.getSignedUrl('avatars/42.png', { expiresIn: 3600 });
 *   drive.exists('avatars/42.png');
 *   drive.delete('avatars/42.png');
 *   drive.list('avatars/');
 */


/** File content: Buffer, Uint8Array, or string. */
export type FileContent = Buffer | Uint8Array | string;

/** Metadata returned by `head()`. */
export interface FileMetadata {
	/** Full key. */
	key: string;
	/** Size in bytes. */
	size: number;
	/** Detected MIME type, if known. */
	contentType?: string;
	/** Last-modified time (unix-ms). */
	lastModified: number;
	/** ETag, if available. */
	etag?: string;
	/** Custom user metadata. */
	metadata?: Record<string, string>;
}

/** Options for `put()`. */
export interface PutOptions {
	/** MIME type. Auto-detected if omitted. */
	contentType?: string;
	/** Cache-Control header. */
	cacheControl?: string;
	/** Custom user metadata. */
	metadata?: Record<string, string>;
	/** S3-style ACL (`public-read`, `private`, etc.). */
	acl?: string;
}

/** Options for signed URL. */
export interface SignedUrlOptions {
	/** Time until the URL expires, in seconds. */
	expiresIn?: number;
	/** Force download with the given filename. */
	asAttachment?: string;
	/** Override the Content-Type of the response. */
	contentType?: string;
	/** Method. Default: GET. */
	method?: "GET" | "PUT" | "DELETE";
}

/** Options for listing. */
export interface ListOptions {
	/** Return only keys with this prefix. */
	prefix?: string;
	/** Maximum results. */
	limit?: number;
	/** Pagination cursor. */
	cursor?: string;
}

/** A single listing result. */
export interface ListResult {
	keys: string[];
	/** True if more results are available. */
	hasMore: boolean;
	/** Cursor for the next page. */
	cursor?: string;
}

/** A driver is a single backing store. */
export interface StorageDriver {
	readonly kind: string;
	put(key: string, body: FileContent, opts?: PutOptions): Promise<void>;
	get(key: string): Promise<Buffer>;
	delete(key: string): Promise<boolean>;
	exists(key: string): Promise<boolean>;
	head(key: string): Promise<FileMetadata>;
	list(opts?: ListOptions): Promise<ListResult>;
	getSignedUrl(key: string, opts?: SignedUrlOptions): Promise<string>;
	copy(src: string, dest: string): Promise<void>;
	move(src: string, dest: string): Promise<void>;
}

/** Top-level Drive configuration. */
export interface DriveConfig {
	/** Storage driver. Default: in-memory. */
	driver?: StorageDriver;
	/** Default visibility hint passed to drivers that support it. */
	defaultVisibility?: "public" | "private";
	/** Custom URL builder for `getSignedUrl` (default returns a `nexus://` URL). */
	signedUrlBuilder?: (key: string, opts?: SignedUrlOptions) => Promise<string>;
}
