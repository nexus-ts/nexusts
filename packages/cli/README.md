> ⚠️ **Experimental / 실험 중** — This package is actively developed. The API may change without notice until v1.0.

# @nexusts/cli

> **NexusTS** — Bun-native fullstack framework

## Description

CLI command runner (`nx`).

Adonis ACE-style command runner. Ships `nx new`, `nx init`, `nx make:controller`, `nx db:migrate`, `nx repl`, etc. The `nx` binary is bundled with @nexusts/core so most users don't need to install this separately.

## Install

This module is part of the NexusTS monorepo. Each module is published as its own npm package under the `@nexusts/` scope.

Most apps start with just the core:

```bash
bun add @nexusts/core
```

Then add this module only if you need it:

```bash
bun add @nexusts/cli
```

## Peer dependencies

**None.** No external dependencies. The `nx` binary is bundled with `@nexusts/core`.

## Usage

```typescript
import { /* public API */ } from "@nexusts/cli";
```

See the [user guide](../../docs/user-guide/cli.md) and the [example app](../../examples/) for a working demo.

## License

MIT — see the root [LICENSE](../../LICENSE).
