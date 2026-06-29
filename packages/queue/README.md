> ⚠️ **Experimental / 실험 중** — This package is actively developed. The API may change without notice until v1.0.

# @nexusts/queue

> **NexusTS** — Bun-native fullstack framework

## Description

Background jobs (BullMQ / Cloudflare / memory).

Three backends: BullMQ (Redis-backed, multi-pod), Cloudflare Queues (edge), in-memory (single-process dev). `@OnQueueReady('worker')` decorator wires handler methods to queue names.

## Install

This module is part of the NexusTS monorepo. Each module is published as its own npm package under the `@nexusts/` scope.

Most apps start with just the core:

```bash
bun add @nexusts/core
```

Then add this module only if you need it:

```bash
bun add @nexusts/queue
```

## Peer dependencies

```bash
bun add bullmq ioredis
```

- **`bullmq`** ^5.79.0 — Required for the BullMQ backend. Skip if you only use the in-memory or Cloudflare backends.
- **`ioredis`** ^5.11.1 — Required for the BullMQ backend's Redis connection. Skip if you only use the in-memory or Cloudflare backends.

Without them the module loads but its public methods throw a clear error pointing to this install command on first call.

## Usage

```typescript
import { /* public API */ } from "@nexusts/queue";
```

See the [user guide](../../docs/user-guide/queue.md) and the [example app](../../examples/) for a working demo.

## License

MIT — see the root [LICENSE](../../LICENSE).
