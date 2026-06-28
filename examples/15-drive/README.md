# 15 · Drive (File Storage)

Cloud-agnostic file storage with `@nexusts/drive`.

## What it shows

- `DriveModule.forRoot({ driver: 'memory' | 'local' | 's3' })`
- `DriveService.put(path, content)` / `.get(path)` / `.delete(path)`
- Unified API across local disk, S3, Cloudflare R2

## How to run

```bash
cd examples/15-drive
bun main.ts
```

```bash
# Upload a file (base64 in this minimal example)
curl -X POST http://localhost:3000/files/hello.txt \
  -H "Content-Type: application/octet-stream" \
  --data-binary "@some-file"

# Read it back
curl http://localhost:3000/files/hello.txt
```

## Code

```ts
import "reflect-metadata";
import { Application, Module, Controller, Get, Post, Param, Body, Inject, Injectable } from "@nexusts/core";
import { DriveService, DriveModule } from "@nexusts/drive";

@Injectable()
@Controller("/files")
class FileController {
  @Inject(DriveService) declare private drive: DriveService;

  @Post("/:name")
  async upload(@Param("name") name: string, @Body() content: any) {
    const path = `uploads/${name}`;
    await this.drive.put(path, content);
    return { ok: true, path };
  }

  @Get("/:name")
  async read(@Param("name") name: string) {
    const path = `uploads/${name}`;
    if (!await this.drive.exists(path)) return { ok: false };
    const content = await this.drive.get(path);
    return { ok: true, content };
  }
}

@Module({
  imports: [
    DriveModule.forRoot({
      default: "disk",
      disks: {
        disk: { driver: "local", root: "./uploads" },
      },
    }),
  ],
  controllers: [FileController],
})
class AppModule {}

const app = new Application(AppModule);
await app.listen(3000);
```

## Drivers

| Driver | Setup |
|--------|-------|
| `memory` | No setup; ephemeral |
| `local` | `root: "./uploads"` |
| `s3` | S3 / R2 credentials |
| `cloudflare` | R2 binding |

## Signed URLs

```ts
const url = await drive.getSignedUrl("uploads/secret.pdf", { expiresIn: 300 });
```
