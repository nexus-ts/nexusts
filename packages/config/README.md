> ⚠️ **Experimental / 실험 중** — This package is actively developed. The API may change without notice until v1.0.

# @nexusts/config

> **NexusTS** — Bun-native fullstack framework

## Description

Zod-validated configuration with layered loading.

Layered config (env, .env, load()). Schema-validated with Zod. Read with `ConfigService.get('db.host')`.

## Install

This module is part of the NexusTS monorepo. Each module is published as its own npm package under the `@nexusts/` scope.

Most apps start with just the core:

```bash
bun add @nexusts/core
```

Then add this module only if you need it:

```bash
bun add @nexusts/config
```

## Peer dependencies

**None.** No external dependencies. Zod is bundled with `@nexusts/core`.

## Usage

```typescript
import { /* public API */ } from "@nexusts/config";
```

See the [user guide](../../docs/user-guide/config.md) and the [example app](../../examples/) for a working demo.

## License

MIT — see the root [LICENSE](../../LICENSE).
