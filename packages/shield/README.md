> ⚠️ **Experimental / 실험 중** — This package is actively developed. The API may change without notice until v1.0.

# @nexusts/shield

> **NexusTS** — Bun-native fullstack framework

## Description

CSRF / HSTS / CSP security middleware.

Security headers (HSTS, CSP, X-Frame-Options, Referrer-Policy) + CSRF token middleware (HMAC-signed). Apply with `app.use('*', shield())`.

## Install

This module is part of the NexusTS monorepo. Each module is published as its own npm package under the `@nexusts/` scope.

Most apps start with just the core:

```bash
bun add @nexusts/core
```

Then add this module only if you need it:

```bash
bun add @nexusts/shield
```

## Peer dependencies

**None.** No external dependencies.

## Usage

```typescript
import { /* public API */ } from "@nexusts/shield";
```

See the [user guide](../../docs/user-guide/shield.md) and the [example app](../../examples/) for a working demo.

## License

MIT — see the root [LICENSE](../../LICENSE).
