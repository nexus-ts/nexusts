# @nexusts/grpc

> **NexusTS** — Bun-native fullstack framework

## Description

gRPC server + typed client (reflection-based).

Reflection-based gRPC. Loads .proto files at runtime via @grpc/proto-loader. `grpcClient()` returns a typed proxy. Unary only in v1 (streaming planned for v2).

## Install

This module is part of the NexusTS monorepo. Each module is published as its own npm package under the `@nexusts/` scope.

Most apps start with just the core:

```bash
bun add @nexusts/core
```

Then add this module only if you need it:

```bash
bun add @nexusts/grpc
```

## Peer dependencies

**None.** gRPC is built into the Bun runtime — no extra dependencies needed.

## Usage

```typescript
import { /* public API */ } from "@nexusts/grpc";
```

See the [user guide](../../docs/user-guide/grpc.md) and the [example app](../../examples/) for a working demo.

## License

MIT — see the root [LICENSE](../../LICENSE).
