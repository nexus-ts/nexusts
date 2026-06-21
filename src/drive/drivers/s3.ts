/**
 * S3-compatible driver. Works with AWS S3, Cloudflare R2, MinIO, etc.
 *
 * Implementation strategy: we keep the driver thin and use the
 * `@aws-sdk/client-s3` + `@aws-sdk/s3-request-presigner` packages
 * dynamically. They are listed as `peerDependenciesMeta.optional`
 * so they don't bloat the bundle for users not using S3.
 *
 *   const driver = new S3Driver({
 *     bucket: 'my-bucket',
 *     region: 'us-east-1',
 *     credentials: { accessKeyId, secretAccessKey },
 *   });
 *   const drive = new DriveService({ driver });
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

export interface S3DriverOptions {
	bucket: string;
	region: string;
	endpoint?: string;
	accessKeyId?: string;
	secretAccessKey?: string;
	/** Optional public URL prefix override. */
	publicUrlPrefix?: string;
}

export class S3Driver implements StorageDriver {
	readonly kind = "s3";
	private opts: S3DriverOptions;
	// Lazily resolved at runtime to avoid bundling aws-sdk unless used.
	private _client: any = null;
	private _presigner: any = null;

	constructor(opts: S3DriverOptions) {
		this.opts = opts;
	}

	private async client() {
		if (this._client) return this._client;
		try {
			const mod = await import("@aws-sdk/client-s3");
			const ctor = mod.S3Client;
			this._client = new ctor({
				region: this.opts.region,
				endpoint: this.opts.endpoint,
				credentials: this.opts.accessKeyId
					? {
							accessKeyId: this.opts.accessKeyId,
							secretAccessKey: this.opts.secretAccessKey ?? "",
						}
					: undefined,
			});
		} catch (err) {
			throw new Error(
				"S3Driver requires @aws-sdk/client-s3. Install it with: bun add @aws-sdk/client-s3",
			);
		}
		return this._client;
	}

	private async presigner() {
		if (this._presigner) return this._presigner;
		try {
			const mod = await import("@aws-sdk/s3-request-presigner");
			this._presigner = mod.getSignedUrl;
		} catch {
			throw new Error(
				"S3Driver signed URLs require @aws-sdk/s3-request-presigner. Install it with: bun add @aws-sdk/s3-request-presigner",
			);
		}
		return this._presigner;
	}

	async put(key: string, body: FileContent, opts: PutOptions = {}): Promise<void> {
		const client = await this.client();
		const mod = await import("@aws-sdk/client-s3");
		const buf = typeof body === "string" ? Buffer.from(body, "utf-8") : Buffer.from(body);
		const command = new mod.PutObjectCommand({
			Bucket: this.opts.bucket,
			Key: key,
			Body: buf,
			ContentType: opts.contentType,
			CacheControl: opts.cacheControl,
			ACL: opts.acl,
			Metadata: opts.metadata,
		});
		await client.send(command);
	}

	async get(key: string): Promise<Buffer> {
		const client = await this.client();
		const mod = await import("@aws-sdk/client-s3");
		const command = new mod.GetObjectCommand({ Bucket: this.opts.bucket, Key: key });
		const res = await client.send(command);
		const chunks: Uint8Array[] = [];
		for await (const chunk of res.Body as AsyncIterable<Uint8Array>) chunks.push(chunk);
		return Buffer.concat(chunks);
	}

	async delete(key: string): Promise<boolean> {
		const client = await this.client();
		const mod = await import("@aws-sdk/client-s3");
		const command = new mod.DeleteObjectCommand({ Bucket: this.opts.bucket, Key: key });
		await client.send(command);
		return true;
	}

	async exists(key: string): Promise<boolean> {
		try {
			await this.head(key);
			return true;
		} catch {
			return false;
		}
	}

	async head(key: string): Promise<FileMetadata> {
		const client = await this.client();
		const mod = await import("@aws-sdk/client-s3");
		const command = new mod.HeadObjectCommand({ Bucket: this.opts.bucket, Key: key });
		const res = await client.send(command);
		return {
			key,
			size: res.ContentLength ?? 0,
			contentType: res.ContentType,
			lastModified: res.LastModified?.getTime() ?? Date.now(),
			etag: res.ETag,
		};
	}

	async list(opts: ListOptions = {}): Promise<ListResult> {
		const client = await this.client();
		const mod = await import("@aws-sdk/client-s3");
		const command = new mod.ListObjectsV2Command({
			Bucket: this.opts.bucket,
			Prefix: opts.prefix,
			MaxKeys: opts.limit,
			ContinuationToken: opts.cursor,
		});
		const res = await client.send(command);
		const keys = (res.Contents ?? []).map((o: any) => o.Key as string);
		return {
			keys,
			hasMore: Boolean(res.IsTruncated),
			cursor: res.NextContinuationToken,
		};
	}

	async getSignedUrl(key: string, opts: SignedUrlOptions = {}): Promise<string> {
		const client = await this.client();
		const mod = await import("@aws-sdk/client-s3");
		const presigner = await this.presigner();
		const expiresIn = opts.expiresIn ?? 3600;
		const command = new mod.GetObjectCommand({
			Bucket: this.opts.bucket,
			Key: key,
			ResponseContentDisposition: opts.asAttachment
				? `attachment; filename="${opts.asAttachment}"`
				: undefined,
			ResponseContentType: opts.contentType,
		});
		return presigner(client, command, { expiresIn });
	}

	async copy(src: string, dest: string): Promise<void> {
		const client = await this.client();
		const mod = await import("@aws-sdk/client-s3");
		const command = new mod.CopyObjectCommand({
			Bucket: this.opts.bucket,
			Key: dest,
			CopySource: `${this.opts.bucket}/${src}`,
		});
		await client.send(command);
	}

	async move(src: string, dest: string): Promise<void> {
		await this.copy(src, dest);
		await this.delete(src);
	}
}
