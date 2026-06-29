> ⚠️ **Experimental / 실험 중** — This package is actively developed. The API may change without notice until v1.0.

# @nexusts/drive

> **NexusTS** — Bun-native fullstack framework

## Description

File storage abstraction (Local / S3 / R2 / memory).

Upload / download / delete files through a unified API. Drivers: local filesystem, S3, R2, in-memory.

## Install

This module is part of the NexusTS monorepo. Each module is published as its own npm package under the `@nexusts/` scope.

Most apps start with just the core:

```bash
bun add @nexusts/core
```

Then add this module only if you need it:

```bash
bun add @nexusts/drive
```

## Peer dependencies

**None.** No external dependencies for the memory / local backends. The S3 / R2 backends require an AWS SDK; install only if you use them.

## Usage

```typescript
import { /* public API */ } from "@nexusts/drive";
```

See the [user guide](../../docs/user-guide/drive.md) and the [example app](../../examples/) for a working demo.

## License

MIT — see the root [LICENSE](../../LICENSE).
