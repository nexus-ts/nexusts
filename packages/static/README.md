> ⚠️ **Experimental / 실험 중** — This package is actively developed. The API may change without notice until v1.0.

# @nexusts/static

> **NexusTS** — Bun-native fullstack framework

## Description

Static file serving (ETag / Range / MIME).

ETag, Range (HTTP 206), MIME detection, path-traversal protection. Serve assets from a directory.

## Install

This module is part of the NexusTS monorepo. Each module is published as its own npm package under the `@nexusts/` scope.

Most apps start with just the core:

```bash
bun add @nexusts/core
```

Then add this module only if you need it:

```bash
bun add @nexusts/static
```

## Peer dependencies

**None.** No external dependencies.

## Usage

```typescript
import { /* public API */ } from "@nexusts/static";
```

See the [user guide](../../docs/user-guide/static.md) and the [example app](../../examples/) for a working demo.

## License

MIT — see the root [LICENSE](../../LICENSE).
