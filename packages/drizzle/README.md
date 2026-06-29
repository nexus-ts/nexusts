> ⚠️ **Experimental / 실험 중** — This package is actively developed. The API may change without notice until v1.0.

# @nexusts/drizzle

> **NexusTS** — Bun-native fullstack framework

## Description

Drizzle ORM integration (default ORM, 5 dialects).

The default ORM. 5 dialects (PostgreSQL, MySQL, SQLite, D1, Bun SQL). `DrizzleRepository` for Lucid-style ergonomics; raw SQL through Drizzle's query builder (SQL-injection-safe by construction).

## Install

This module is part of the NexusTS monorepo. Each module is published as its own npm package under the `@nexusts/` scope.

Most apps start with just the core:

```bash
bun add @nexusts/core
```

Then add this module only if you need it:

```bash
bun add @nexusts/drizzle
```

## Peer dependencies

```bash
bun add drizzle-orm
```

- **`drizzle-orm`** ^0.36.0 — ORM integration; required only if you use Drizzle. Also install a driver (e.g. better-sqlite3, pg, mysql2, postgres).

Without them the module loads but its public methods throw a clear error pointing to this install command on first call.

## Usage

```typescript
import { /* public API */ } from "@nexusts/drizzle";
```

See the [user guide](../../docs/user-guide/drizzle.md) and the [example app](../../examples/) for a working demo.

## License

MIT — see the root [LICENSE](../../LICENSE).
