> ⚠️ **Experimental / 실험 중** — This package is actively developed. The API may change without notice until v1.0.

# @nexusts/metrics

> **NexusTS** — Bun-native fullstack framework

## Description

Prometheus / OpenMetrics counters and gauges.

Counter / Gauge / Histogram / Summary primitives. @Counted / @Timed method decorators. /metrics endpoint with content negotiation. Default Node.js process metrics.

## Install

This module is part of the NexusTS monorepo. Each module is published as its own npm package under the `@nexusts/` scope.

Most apps start with just the core:

```bash
bun add @nexusts/core
```

Then add this module only if you need it:

```bash
bun add @nexusts/metrics
```

## Peer dependencies

**None.** No external dependencies.

## Usage

```typescript
import { /* public API */ } from "@nexusts/metrics";
```

See the [user guide](../../docs/user-guide/metrics.md) and the [example app](../../examples/) for a working demo.

## License

MIT — see the root [LICENSE](../../LICENSE).
