> ⚠️ **Experimental / 실험 중** — This package is actively developed. The API may change without notice until v1.0.

# @nexusts/redis

> **NexusTS** — Bun-native fullstack framework

## Description

Runtime-aware Redis client (Bun / Node / Workers).

One client, three runtimes. Powers the Drizzle-backend session, cache, and limiter stores.

## Install

This module is part of the NexusTS monorepo. Each module is published as its own npm package under the `@nexusts/` scope.

Most apps start with just the core:

```bash
bun add @nexusts/core
```

Then add this module only if you need it:

```bash
bun add @nexusts/redis
```

## Peer dependencies

```bash
bun add ioredis
```

- **`ioredis`** ^5.11.1 — Required for Redis-backed sessions / cache / limiter / queue. Skip if you use only the memory / Drizzle backends.

Without them the module loads but its public methods throw a clear error pointing to this install command on first call.

## Usage

```typescript
import { /* public API */ } from "@nexusts/redis";
```

See the [user guide](../../docs/user-guide/redis.md) and the [example app](../../examples/) for a working demo.

## License

MIT — see the root [LICENSE](../../LICENSE).
