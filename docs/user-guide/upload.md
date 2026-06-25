# @nexusts/upload — file upload helper

> 한국어 버전: [`upload.ko.md`](./upload.ko.md)
> Added in **v0.4** (Tier 1 gap from the NestJS / AdonisJS analyses).

`@nexusts/upload` is a **first-party file-upload handler** for NexusTS.
It wraps Hono's `c.req.parseBody()` with type-safe decorators, size /
MIME validation, multi-file support, and an optional `@nexusts/drive`
hook for cloud storage. No third-party multipart parser required.

```
@Module({
  imports: [
    UploadModule.forRoot({
      maxFileSize: 10 * 1024 * 1024,   // 10 MB per file
      maxFiles: 5,
      allowedMimeTypes: ['image/*', 'application/pdf'],
    }),
  ],
})
```

---

## 1. Quick start

```ts
// app/app.module.ts
import { Module } from '@nexusts/core';
import { UploadModule } from '@nexusts/upload';

@Module({
  imports: [
    UploadModule.forRoot({
      maxFileSize: 10 * 1024 * 1024,    // 10 MB
      maxFiles: 5,
      allowedMimeTypes: ['image/png', 'image/jpeg', 'image/webp', 'application/pdf'],
    }),
  ],
})
export class AppModule {}
```

After the framework router is built, mount the multipart middleware:

```ts
import { UploadService, UploadModule } from '@nexusts/upload';

const app = new Application(AppModule);
const upload = app.container.resolve(UploadService.TOKEN) as UploadService;
UploadModule.mount(app.server.app, upload, app.server.getRoutes());
await app.listen(3000);
```

Then in a controller:

```ts
import { Controller, Post } from '@nexusts/core';
import { Upload, UploadedFile, UploadedFiles } from '@nexusts/upload';
import type { UploadedFile } from '@nexusts/upload';

@Controller('/uploads')
class UploadController {
  @Post('/avatar')
  @Upload('avatar')                  // form field name
  uploadAvatar(
    @UploadedFile('avatar') avatar: UploadedFile,
  ) {
    return {
      filename: avatar.filename,
      contentType: avatar.contentType,
      size: avatar.size,
    };
  }

  @Post('/photos')
  @Upload('photos', { maxFiles: 10 })
  uploadPhotos(
    @UploadedFiles('photos') photos: UploadedFile[],
  ) {
    return photos.map((p) => ({ filename: p.filename, size: p.size }));
  }
}
```

---

## 2. The `UploadedFile` interface

```ts
interface UploadedFile {
  fieldName: string;       // form field name
  filename: string;        // client-provided filename
  contentType: string;     // MIME type (e.g. 'image/png')
  encoding: string;        // typically '7bit'
  buffer: Buffer;          // file content
  size: number;            // bytes
}
```

The middleware reads the entire body into memory (with a hard cap
enforced by `maxFileSize`). For very large files (gigabytes), use
the streaming approach — see [§7](#7-streaming-large-files).

---

## 3. Decorators

| Decorator | What it does |
| --------- | ------------ |
| `@Upload('field', opts?)` (method) | Declare that this method expects one or more files. Reads `opts.maxFiles` / `opts.required`. |
| `@UploadedFile('field')` (param) | Inject a single file. Throws 400 if missing. |
| `@UploadedFiles('field')` (param) | Inject `UploadedFile[]`. |

```ts
@Upload('avatar', { maxFiles: 1, required: true })
@Upload('photos', { maxFiles: 10, required: false })
```

The decorator pattern is **declarative** — the middleware reads the
metadata, parses only the fields you declared, and rejects with a
400 if any required field is missing.

---

## 4. Validation

### Size

`maxFileSize` (default: 10 MB) is enforced per file. Larger files
return a 400 with `code: 'FILE_TOO_LARGE'`.

### Count

`maxFiles` (default: 5) caps the number of files per request.
Larger counts return 400 with `code: 'TOO_MANY_FILES'`.

### MIME type

`allowedMimeTypes` accepts an array of MIME types, with wildcard
support:

```ts
allowedMimeTypes: [
  'image/*',                  // any image
  'application/pdf',
  'video/mp4',
  'image/png',                // specific
]
```

Mismatched types return 400 with `code: 'MIME_NOT_ALLOWED'`.

### Error response shape

```json
{
  "error": "File \"evil.exe\" has type \"application/x-msdownload\"; not in the allow list.",
  "code": "MIME_NOT_ALLOWED",
  "field": "doc"
}
```

---

## 5. Integration with `@nexusts/drive`

When you pass `driveToken` to `UploadModule.forRoot(...)`, the
service also writes each accepted file to the configured `DriveService`
under `drivePrefix`. The original filename is replaced with a
timestamp + random suffix by default (set `preserveFilename: true`
to keep the client's name).

```ts
@Module({
  imports: [
    DriveModule.forRoot({ driver: new LocalDriver({ root: '/var/data' }) }),
    UploadModule.forRoot({
      driveToken: 'AVATAR_DRIVE',           // DI token of the DriveService
      drivePrefix: 'avatars',
      preserveFilename: false,              // default: random suffix
    }),
  ],
})
```

The resulting URL is stored on `file.storedKey` so the controller
can return a download link:

```ts
@Post('/avatar')
@Upload('avatar')
async upload(@UploadedFile('avatar') file: UploadedFile & { storedKey?: string }) {
  return { url: `/files/${file.storedKey}` };
}
```

---

## 6. Configuration reference

```ts
interface UploadConfig {
  /** Max bytes per file. Default: 10 MB. */
  maxFileSize?: number;

  /** Max files per request. Default: 5. */
  maxFiles?: number;

  /** Allowed MIME types (with `*` wildcard). Default: any. */
  allowedMimeTypes?: string[];

  /** Storage backend. Currently only 'memory' (default). */
  storage?: 'memory';

  /** Optional DI token of a DriveService for cloud storage. */
  driveToken?: string;

  /** Prefix under which files are stored in the drive. */
  drivePrefix?: string;

  /** Keep the original filename instead of generating a UUID. Default: false. */
  preserveFilename?: boolean;
}
```

---

## 7. Streaming large files

For files larger than your memory budget (e.g. video uploads), the
default `Buffer`-based approach is the wrong fit. The framework
exposes the raw `Blob` from Hono's `parseBody` directly:

```ts
import { c } from 'hono';

@Post('/upload')
@Upload('video')
async uploadVideo(@Req() ctx: any) {
  const body = await ctx.req.parseBody({ all: true });
  const file = body.video as Blob;
  // Stream to S3 / R2 / disk using .stream() or .arrayBuffer().
  // No memory cap beyond what Hono itself enforces.
  await pipeline(file.stream(), fs.createWriteStream('/var/videos/x.mp4'));
  return { ok: true };
}
```

This bypasses the validation middleware; you handle MIME / size
checks yourself. Use the default path for everything under ~1 GB;
reach for streaming only when memory is a real concern.

---

## 8. Tier comparison

| Framework | File upload story | v0.4 |
| --- | --- | --- |
| NestJS | `multer` + `@UploadedFile()` decorator | ✅ closed — `@nexusts/upload` |
| AdonisJS | `@adonisjs/bodyparser` + `request.file('avatar')` | ✅ closed — `@nexusts/upload` |

Per the v0.3 gap analyses (NestJS §3.2, AdonisJS §4.3), this was
the second Tier 1 gap. With `@nexusts/upload` and `@nexusts/openapi` both
shipped, every Tier 1 feature is now in NexusTS.

---

## 9. See also

- [`./openapi.md`](./openapi.md) — the companion OpenAPI 3.1 + Scalar UI module
- [`./cross-cutting-features.md`](./cross-cutting-features.md) — drive, mail, cache, etc.
- [`../analysis/nestjs-comparison.md`](../analysis/nestjs-comparison.md) — Tier 1 gaps
- [`../analysis/adonisjs-comparison.md`](../analysis/adonisjs-comparison.md) — Tier 1 gaps
- [Hono `parseBody` documentation](https://hono.dev/docs/api/context#parsebody) — the underlying primitive
