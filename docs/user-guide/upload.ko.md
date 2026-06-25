# @nexusts/upload — 파일 업로드 헬퍼

> English version: [`upload.md`](./upload.md)
> **v0.4**에서 추가됨 (NestJS / AdonisJS 분석의 Tier 1 격차).

`@nexusts/upload`는 NexusTS의 **1급 파일 업로드 핸들러**다. Hono의
`c.req.parseBody()`를 타입 안전 데코레이터, 크기/MIME 검증, 다중 파일
지원, 옵션 `@nexusts/drive` 훅(클라우드 스토리지용)으로 감싼다. 외부
multipart 파서 없이 동작.

```
@Module({
  imports: [
    UploadModule.forRoot({
      maxFileSize: 10 * 1024 * 1024,   // 파일당 10 MB
      maxFiles: 5,
      allowedMimeTypes: ['image/*', 'application/pdf'],
    }),
  ],
})
```

---

## 1. 빠른 시작

```ts
// app/app.module.ts
import { Module } from '@nexusts/core';
import { UploadModule } from '@nexusts/upload';

@Module({
  imports: [
    UploadModule.forRoot({
      maxFileSize: 10 * 1024 * 1024,
      maxFiles: 5,
      allowedMimeTypes: ['image/png', 'image/jpeg', 'image/webp', 'application/pdf'],
    }),
  ],
})
export class AppModule {}
```

프레임워크 라우터가 빌드된 후 multipart 미들웨어를 마운트한다:

```ts
import { UploadService, UploadModule } from '@nexusts/upload';

const app = new Application(AppModule);
const upload = app.container.resolve(UploadService.TOKEN) as UploadService;
UploadModule.mount(app.server.app, upload, app.server.getRoutes());
await app.listen(3000);
```

Controller에서:

```ts
import { Controller, Post } from '@nexusts/core';
import { Upload, UploadedFile, UploadedFiles } from '@nexusts/upload';
import type { UploadedFile } from '@nexusts/upload';

@Controller('/uploads')
class UploadController {
  @Post('/avatar')
  @Upload('avatar')
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
  uploadPhotos(@UploadedFiles('photos') photos: UploadedFile[]) {
    return photos.map((p) => ({ filename: p.filename, size: p.size }));
  }
}
```

---

## 2. `UploadedFile` 인터페이스

```ts
interface UploadedFile {
  fieldName: string;       // form 필드 이름
  filename: string;        // 클라이언트가 보낸 파일 이름
  contentType: string;     // MIME 타입 (예: 'image/png')
  encoding: string;        // 보통 '7bit'
  buffer: Buffer;          // 파일 내용
  size: number;            // 바이트
}
```

미들웨어가 전체 body를 메모리로 읽는다(`maxFileSize`로 하드 캡). 매우
큰 파일(기가바이트)은 스트리밍 방식을 사용한다 — [§7](#7-스트리밍-대용량-파일) 참조.

---

## 3. 데코레이터

| 데코레이터 | 역할 |
| --------- | ---- |
| `@Upload('field', opts?)` (메서드) | 이 메서드가 하나 이상의 파일을 기대한다고 선언. `opts.maxFiles` / `opts.required` 읽기. |
| `@UploadedFile('field')` (파라미터) | 단일 파일 주입. 누락 시 400. |
| `@UploadedFiles('field')` (파라미터) | `UploadedFile[]` 주입. |

```ts
@Upload('avatar', { maxFiles: 1, required: true })
@Upload('photos', { maxFiles: 10, required: false })
```

데코레이터 패턴은 **선언적**이다 — 미들웨어가 메타데이터를 읽고 선언한
필드만 파싱하며, 필수 필드가 누락되면 400을 반환한다.

---

## 4. 검증

### 크기

`maxFileSize` (기본: 10 MB)가 파일별로 강제된다. 더 큰 파일은
`code: 'FILE_TOO_LARGE'`와 함께 400을 반환.

### 개수

`maxFiles` (기본: 5)가 요청당 파일 수를 제한. 더 많으면
`code: 'TOO_MANY_FILES'`와 함께 400을 반환.

### MIME 타입

`allowedMimeTypes`는 와일드카드 지원 배열:

```ts
allowedMimeTypes: [
  'image/*',                  // 모든 이미지
  'application/pdf',
  'video/mp4',
  'image/png',                // 특정 타입
]
```

일치하지 않는 타입은 `code: 'MIME_NOT_ALLOWED'`와 함께 400을 반환.

### 에러 응답 형식

```json
{
  "error": "File \"evil.exe\" has type \"application/x-msdownload\"; not in the allow list.",
  "code": "MIME_NOT_ALLOWED",
  "field": "doc"
}
```

---

## 5. `@nexusts/drive` 통합

`UploadModule.forRoot(...)`에 `driveToken`을 전달하면, 서비스는
허용된 각 파일을 설정된 `DriveService`의 `drivePrefix` 아래에
쓴다. 원본 파일명은 기본적으로 timestamp + random 접미사로
대체된다 (`preserveFilename: true`로 클라이언트 이름 유지 가능).

```ts
@Module({
  imports: [
    DriveModule.forRoot({ driver: new LocalDriver({ root: '/var/data' }) }),
    UploadModule.forRoot({
      driveToken: 'AVATAR_DRIVE',           // DriveService의 DI 토큰
      drivePrefix: 'avatars',
      preserveFilename: false,
    }),
  ],
})
```

결과 URL은 `file.storedKey`에 저장되므로 controller가 다운로드 링크를
반환할 수 있다:

```ts
@Post('/avatar')
@Upload('avatar')
async upload(@UploadedFile('avatar') file: UploadedFile & { storedKey?: string }) {
  return { url: `/files/${file.storedKey}` };
}
```

---

## 6. 설정 참조

```ts
interface UploadConfig {
  /** 파일당 최대 바이트. 기본: 10 MB. */
  maxFileSize?: number;

  /** 요청당 최대 파일 수. 기본: 5. */
  maxFiles?: number;

  /** 허용 MIME 타입 (`*` 와일드카드). 기본: 모두. */
  allowedMimeTypes?: string[];

  /** 스토리지 백엔드. 현재 'memory'만 지원 (기본). */
  storage?: 'memory';

  /** 클라우드 스토리지를 위한 DriveService의 DI 토큰. */
  driveToken?: string;

  /** drive 내 파일이 저장될 prefix. */
  drivePrefix?: string;

  /** 원본 파일명 유지 (UUID 대신). 기본: false. */
  preserveFilename?: boolean;
}
```

---

## 7. 스트리밍 대용량 파일

메모리 예산을 초과하는 파일(예: 비디오 업로드)의 경우, 기본 `Buffer`
기반 접근은 부적합하다. 프레임워크는 Hono의 `parseBody`에서 raw `Blob`을
직접 노출한다:

```ts
import { c } from 'hono';

@Post('/upload')
@Upload('video')
async uploadVideo(@Req() ctx: any) {
  const body = await ctx.req.parseBody({ all: true });
  const file = body.video as Blob;
  // S3 / R2 / 디스크로 스트리밍. .stream() 또는 .arrayBuffer() 사용.
  // Hono 자체가 강제하는 한도 외에는 메모리 캡이 없음.
  await pipeline(file.stream(), fs.createWriteStream('/var/videos/x.mp4'));
  return { ok: true };
}
```

이 방식은 검증 미들웨어를 우회한다; MIME/크기 검사는 직접 처리해야
한다. ~1 GB 이하에는 기본 경로를 사용하고, 메모리가 실제问题时만
스트리밍을 사용한다.

---

## 8. Tier 비교

| 프레임워크 | 파일 업로드 | v0.4 |
| --- | --- | --- |
| NestJS | `multer` + `@UploadedFile()` 데코레이터 | ✅ 해소 — `@nexusts/upload` |
| AdonisJS | `@adonisjs/bodyparser` + `request.file('avatar')` | ✅ 해소 — `@nexusts/upload` |

v0.3 격차 분석(NestJS §3.2, AdonisJS §4.3)에 따르면, 이것이 두 번째
Tier 1 격차였다. `@nexusts/upload`와 `@nexusts/openapi`가 모두 출시되어 모든
Tier 1 기능이 이제 NexusTS에 있다.

---

## 9. 참고

- [`./openapi.md`](./openapi.md) — 동반 OpenAPI 3.1 + Scalar UI 모듈
- [`./cross-cutting-features.md`](./cross-cutting-features.md) — drive, mail, cache 등
- [`../analysis/nestjs-comparison.md`](../analysis/nestjs-comparison.md) — Tier 1 격차
- [`../analysis/adonisjs-comparison.md`](../analysis/adonisjs-comparison.md) — Tier 1 격차
- [Hono `parseBody` 문서](https://hono.dev/docs/api/context#parsebody) — underlying primitive
