> ⚠️ **Experimental / 실험 중** — This package is actively developed. The API may change without notice until v1.0.

# @nexusts/logger

> **NexusTS** — Bun-native fullstack framework

## Description

Pino-backed structured logging.

Pretty-printed in dev, JSON in prod. Request-scoped via AsyncLocalStorage (every log line inside a request automatically includes the request id).

## Install

This module is part of the NexusTS monorepo. Each module is published as its own npm package under the `@nexusts/` scope.

Most apps start with just the core:

```bash
bun add @nexusts/core
```

Then add this module only if you need it:

```bash
bun add @nexusts/logger
```

## Peer dependencies

**None.** No external dependencies. Uses `pino` (bundled) under the hood.

## Usage

```typescript
import { /* public API */ } from "@nexusts/logger";
```

See the [user guide](../../docs/user-guide/logger.md) and the [example app](../../examples/) for a working demo.

## License

MIT — see the root [LICENSE](../../LICENSE).
