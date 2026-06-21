/**
 * `DriveService` — public façade.
 *
 *   const drive = new DriveService({ driver: new LocalDriver({ root: '/data' }) });
 *   await drive.put('a.txt', 'hello');
 *   const body = await drive.get('a.txt');
 */
import { Inject, Injectable } from "../core/decorators/index.js";
import { MemoryDriver } from "./drivers/memory.js";
import type {
	DriveConfig,
	FileContent,
	FileMetadata,
	ListOptions,
	ListResult,
	PutOptions,
	SignedUrlOptions,
} from "./types.js";

@Injectable()
export class DriveService {
	/** DI token. */
	static readonly TOKEN = Symbol.for("nexus:DriveService");

	private _driver: import("./types.js").StorageDriver;
	defaultVisibility: NonNullable<DriveConfig["defaultVisibility"]>;
	private signedUrlBuilder: NonNullable<DriveConfig["signedUrlBuilder"]>;

	constructor(@Inject("DRIVE_CONFIG") config: DriveConfig = {}) {
		this._driver = config.driver ?? new MemoryDriver();
		this.defaultVisibility = config.defaultVisibility ?? "private";
		this.signedUrlBuilder =
			config.signedUrlBuilder ??
			(async (key, opts) => this._driver.getSignedUrl(key, opts));
	}

	/** Direct access to the underlying driver (for advanced use). */
	get driver(): import("./types.js").StorageDriver {
		return this._driver;
	}

	async put(key: string, body: FileContent, opts?: PutOptions): Promise<void> {
		return this._driver.put(key, body, opts);
	}

	async get(key: string): Promise<Buffer> {
		return this._driver.get(key);
	}

	async delete(key: string): Promise<boolean> {
		return this._driver.delete(key);
	}

	async exists(key: string): Promise<boolean> {
		return this._driver.exists(key);
	}

	async head(key: string): Promise<FileMetadata> {
		return this._driver.head(key);
	}

	async list(opts?: ListOptions): Promise<ListResult> {
		return this._driver.list(opts);
	}

	async getSignedUrl(key: string, opts?: SignedUrlOptions): Promise<string> {
		return this.signedUrlBuilder(key, opts);
	}

	async copy(src: string, dest: string): Promise<void> {
		return this._driver.copy(src, dest);
	}

	async move(src: string, dest: string): Promise<void> {
		return this._driver.move(src, dest);
	}
}
