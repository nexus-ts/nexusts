> ⚠️ **Experimental / 실험 중** — This package is actively developed. The API may change without notice until v1.0.

# @nexusts/graphql

> **NexusTS** — Bun-native fullstack framework

## Description

SDL-first GraphQL endpoint with @Resolver decorators.

Single GraphQL endpoint. `POST /graphql`, `GET /graphql?query=`, `GET /graphql/schema`, in-bundle GraphiQL playground. SDL-first; @Resolver / @Query / @Mutation decorators.

## Install

This module is part of the NexusTS monorepo. Each module is published as its own npm package under the `@nexusts/` scope.

Most apps start with just the core:

```bash
bun add @nexusts/core
```

Then add this module only if you need it:

```bash
bun add @nexusts/graphql
```

## Peer dependencies

```bash
bun add graphql
```

- **`graphql`** ^17.0.0 — Required for building / executing GraphQL schemas.

Without them the module loads but its public methods throw a clear error pointing to this install command on first call.

## Usage

```typescript
import { /* public API */ } from "@nexusts/graphql";
```

See the [user guide](../../docs/user-guide/graphql.md) and the [example app](../../examples/) for a working demo.

## License

MIT — see the root [LICENSE](../../LICENSE).
