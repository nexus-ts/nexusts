> ⚠️ **Experimental / 실험 중** — This package is actively developed. The API may change without notice until v1.0.

# @nexusts/health

> **NexusTS** — Bun-native fullstack framework

## Description

Health check endpoints (live, ready, startup).

Built-in indicators (memory, disk, http, Drizzle ping). k8s-friendly endpoints at `/health/live`, `/health/ready`, `/health/startup`.

## Install

This module is part of the NexusTS monorepo. Each module is published as its own npm package under the `@nexusts/` scope.

Most apps start with just the core:

```bash
bun add @nexusts/core
```

Then add this module only if you need it:

```bash
bun add @nexusts/health
```

## Peer dependencies

**None.** No external dependencies.

## Usage

```typescript
import { /* public API */ } from "@nexusts/health";
```

See the [user guide](../../docs/user-guide/health.md) and the [example app](../../examples/) for a working demo.

## License

MIT — see the root [LICENSE](../../LICENSE).
