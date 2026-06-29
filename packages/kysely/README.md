> ⚠️ **Experimental / 실험 중** — This package is actively developed. The API may change without notice until v1.0.

# @nexusts/kysely

> **NexusTS** — Bun-native fullstack framework

## Description

Kysely typed SQL query builder integration.

Provides a type-safe SQL query builder with DI support. `KyselyService` wraps a Kysely instance, `KyselyRepository` provides a Lucid-style repository pattern, and `KyselyModule` handles registration. Optional peer dependency (install with `bun add kysely`). Supports all Kysely dialects (SQLite, PostgreSQL, MySQL, etc.).

## Install

This module is part of the NexusTS monorepo. Each module is published as its own npm package under the `@nexusts/` scope.

Most apps start with just the core:

```bash
bun add @nexusts/core
```

Then add this module only if you need it:

```bash
bun add @nexusts/kysely
```

## Peer dependencies

```bash
bun add kysely
```

- **`kysely`** ^0.27.0 — Kysely typed SQL query builder.

Without it the module loads but its public methods throw a clear error pointing to this install command on first call.

## Usage

```typescript
import { KyselyModule, KyselyService, KyselyRepository } from "@nexusts/kysely";
```

See the [user guide](../../docs/user-guide/kysely.md) and the [example app](../../examples/36-kysely-crud/) for a working demo.

## License

MIT — see the root [LICENSE](../../LICENSE).
