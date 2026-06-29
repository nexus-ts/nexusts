> ⚠️ **Experimental / 실험 중** — This package is actively developed. The API may change without notice until v1.0.

# @nexusts/openapi

> **NexusTS** — Bun-native fullstack framework

## Description

OpenAPI 3.1 spec generation from Zod schemas.

Auto-derives the spec from Zod validation schemas. Scalar UI at /docs. `router.getRoutes()` feeds the spec from declared routes.

## Install

This module is part of the NexusTS monorepo. Each module is published as its own npm package under the `@nexusts/` scope.

Most apps start with just the core:

```bash
bun add @nexusts/core
```

Then add this module only if you need it:

```bash
bun add @nexusts/openapi
```

## Peer dependencies

**None.** No external dependencies.

## Usage

```typescript
import { /* public API */ } from "@nexusts/openapi";
```

See the [user guide](../../docs/user-guide/openapi.md) and the [example app](../../examples/) for a working demo.

## License

MIT — see the root [LICENSE](../../LICENSE).
