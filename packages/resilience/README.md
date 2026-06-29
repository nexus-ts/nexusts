> ⚠️ **Experimental / 실험 중** — This package is actively developed. The API may change without notice until v1.0.

# @nexusts/resilience

> **NexusTS** — Bun-native fullstack framework

## Description

Retry + Circuit Breaker + Bulkhead.

Three primitives in a single DI singleton. retry() for backoff. CircuitBreaker for closed → open → half-open state machine. Bulkhead for FIFO concurrency limits. Shared named registry. **Zero external dependencies.**

## Install

This module is part of the NexusTS monorepo. Each module is published as its own npm package under the `@nexusts/` scope.

Most apps start with just the core:

```bash
bun add @nexusts/core
```

Then add this module only if you need it:

```bash
bun add @nexusts/resilience
```

## Peer dependencies

**None.** No external dependencies. Pure TypeScript — retry, circuit breaker, bulkhead are all implemented in-house.

## Usage

```typescript
import { /* public API */ } from "@nexusts/resilience";
```

See the [user guide](../../docs/user-guide/resilience.md) and the [example app](../../examples/) for a working demo.

## License

MIT — see the root [LICENSE](../../LICENSE).
