> ⚠️ **Experimental / 실험 중** — This package is actively developed. The API may change without notice until v1.0.

# @nexusts/sse

> **NexusTS** — Bun-native fullstack framework

## Description

Server-Sent Events streaming.

Type-safe SseStream wrapping Hono's streamSSE. Auto-serialization, idempotent close(), Last-Event-ID reconnection support.

## Install

This module is part of the NexusTS monorepo. Each module is published as its own npm package under the `@nexusts/` scope.

Most apps start with just the core:

```bash
bun add @nexusts/core
```

Then add this module only if you need it:

```bash
bun add @nexusts/sse
```

## Peer dependencies

**None.** No external dependencies.

## Usage

```typescript
import { /* public API */ } from "@nexusts/sse";
```

See the [user guide](../../docs/user-guide/sse.md) and the [example app](../../examples/) for a working demo.

## License

MIT — see the root [LICENSE](../../LICENSE).
