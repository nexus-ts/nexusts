> ⚠️ **Experimental / 실험 중** — This package is actively developed. The API may change without notice until v1.0.

# @nexusts/i18n

> **NexusTS** — Bun-native fullstack framework

## Description

Internationalization (Intl-based, pluralization).

Locale detection middleware (query → cookie → Accept-Language → default). JSON catalogs. Intl-based formatters: formatDate, formatNumber, formatCurrency. Pluralization with the `|` separator.

## Install

This module is part of the NexusTS monorepo. Each module is published as its own npm package under the `@nexusts/` scope.

Most apps start with just the core:

```bash
bun add @nexusts/core
```

Then add this module only if you need it:

```bash
bun add @nexusts/i18n
```

## Peer dependencies

**None.** No external dependencies. Built on the JavaScript `Intl` API.

## Usage

```typescript
import { /* public API */ } from "@nexusts/i18n";
```

See the [user guide](../../docs/user-guide/i18n.md) and the [example app](../../examples/) for a working demo.

## License

MIT — see the root [LICENSE](../../LICENSE).
