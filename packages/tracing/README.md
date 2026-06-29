> ⚠️ **Experimental / 실험 중** — This package is actively developed. The API may change without notice until v1.0.

# @nexusts/tracing

> **NexusTS** — Bun-native fullstack framework

## Description

OpenTelemetry distributed tracing.

Lazy-loads the OTel SDK. W3C + B3 propagation. Hono auto-instrumentation middleware. @Trace() method decorator. Exporter-agnostic.

## Install

This module is part of the NexusTS monorepo. Each module is published as its own npm package under the `@nexusts/` scope.

Most apps start with just the core:

```bash
bun add @nexusts/core
```

Then add this module only if you need it:

```bash
bun add @nexusts/tracing
```

## Peer dependencies

```bash
bun add @opentelemetry/api
```

- **`@opentelemetry/api`** ^1.9.0 — OpenTelemetry API. Required to enable tracing.

Without them the module loads but its public methods throw a clear error pointing to this install command on first call.

## Usage

```typescript
import { /* public API */ } from "@nexusts/tracing";
```

See the [user guide](../../docs/user-guide/tracing.md) and the [example app](../../examples/) for a working demo.

## License

MIT — see the root [LICENSE](../../LICENSE).
