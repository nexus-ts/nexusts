> ⚠️ **Experimental / 실험 중** — This package is actively developed. The API may change without notice until v1.0.

# @nexusts/events

> **NexusTS** — Bun-native fullstack framework

## Description

Event emitter with wildcards, priorities, guards.

Decoupled pub/sub. Wildcards, priorities, sync vs async, guards. `@OnEvent('user.created')` decorator sets up listeners.

## Install

This module is part of the NexusTS monorepo. Each module is published as its own npm package under the `@nexusts/` scope.

Most apps start with just the core:

```bash
bun add @nexusts/core
```

Then add this module only if you need it:

```bash
bun add @nexusts/events
```

## Peer dependencies

**None.** No external dependencies.

## Usage

```typescript
import { /* public API */ } from "@nexusts/events";
```

See the [user guide](../../docs/user-guide/events.md) and the [example app](../../examples/) for a working demo.

## License

MIT — see the root [LICENSE](../../LICENSE).
