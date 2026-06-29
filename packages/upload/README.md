> ⚠️ **Experimental / 실험 중** — This package is actively developed. The API may change without notice until v1.0.

# @nexusts/upload

> **NexusTS** — Bun-native fullstack framework

## Description

Multipart file upload with validation.

@Upload() / @UploadedFile() decorators. Size limits, MIME validation, count limits. Stores through the configured drive driver.

## Install

This module is part of the NexusTS monorepo. Each module is published as its own npm package under the `@nexusts/` scope.

Most apps start with just the core:

```bash
bun add @nexusts/core
```

Then add this module only if you need it:

```bash
bun add @nexusts/upload
```

## Peer dependencies

**None.** No external dependencies. Files are stored through the configured `@nexusts/drive` driver.

## Usage

```typescript
import { /* public API */ } from "@nexusts/upload";
```

See the [user guide](../../docs/user-guide/upload.md) and the [example app](../../examples/) for a working demo.

## License

MIT — see the root [LICENSE](../../LICENSE).
