/**
 * `UploadModule` — drop-in file upload handling.
 *
 *   @Module({
 *     imports: [
 *       UploadModule.forRoot({
 *         maxFileSize: 10 * 1024 * 1024,
 *         allowedMimeTypes: ['image/*', 'application/pdf'],
 *         storage: 'memory',
 *       }),
 *     ],
 *   })
 *
 * After the framework router is built, call `UploadModule.mount(app, svc)`
 * to install the multipart middleware. The middleware looks at
 * the route's metadata (set by `@Upload('fieldName')`) to know
 * which fields to parse.
 */
import "reflect-metadata";
import { Module } from "@nexusts/core";
import type { UploadConfig } from "./types.js";
import { uploadMiddleware } from "./upload.middleware.js";
import { UploadService } from "./upload.service.js";

@Module({
	providers: [
		UploadService,
		{ provide: UploadService.TOKEN, useExisting: UploadService },
	],
	exports: [UploadService, UploadService.TOKEN],
})
export class UploadModule {
	static forRoot(config: UploadConfig = {}) {
		@Module({
			providers: [
				UploadService,
				{ provide: UploadService.TOKEN, useExisting: UploadService },
				{ provide: "UPLOAD_CONFIG", useValue: config },
			],
			exports: [UploadService, UploadService.TOKEN],
		})
		class ConfiguredUploadModule {}
		Object.defineProperty(ConfiguredUploadModule, "name", {
			value: "ConfiguredUploadModule",
		});
		return ConfiguredUploadModule;
	}

	/**
	 * Install the multipart middleware on the Hono app. Walk the
	 * route table, collect every `@Upload` decorator, and emit a
	 * middleware that knows which fields to parse.
	 */
	static mount(app: any, svc: UploadService, routes: any[] = []): void {
		const fieldSet = new Map<string, { maxFiles: number; required: boolean }>();
		for (const r of routes) {
			const metas = (Reflect.getMetadata("nexus:upload:options", r.target.constructor, r.propertyKey) ?? []) as Array<{ name: string; options: any }>;
			for (const m of metas) {
				const existing = fieldSet.get(m.name);
				const maxFiles = m.options?.maxFiles ?? 1;
				const required = m.options?.required ?? true;
				if (!existing || maxFiles > existing.maxFiles) {
					fieldSet.set(m.name, { maxFiles, required: existing?.required ?? required });
				}
			}
		}
		// Per-route middleware: we capture the fields for that route in
		// a closure. Hono supports per-route middleware via `app.use(path, mw)`.
		app.use("/**", async (c: any, next: () => Promise<any>) => {
			const fields: Array<{ fieldName: string; maxFiles: number; required: boolean }> = [];
			for (const [name, info] of fieldSet.entries()) {
				fields.push({ fieldName: name, ...info });
			}
			c.set("uploadFields", fields);
			return uploadMiddleware(svc)(c, next);
		});
	}
}