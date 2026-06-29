> ⚠️ **Experimental / 실험 중** — This package is actively developed. The API may change without notice until v1.0.

# @nexusts/crypto

> **NexusTS** — Bun-native fullstack framework

## Description

AES-256-GCM encryption + HMAC + scrypt/argon2.

Authenticated encryption, HMAC sign/unsign, password hashing. Internally used by session cookies and CSRF tokens.

## Install

This module is part of the NexusTS monorepo. Each module is published as its own npm package under the `@nexusts/` scope.

Most apps start with just the core:

```bash
bun add @nexusts/core
```

Then add this module only if you need it:

```bash
bun add @nexusts/crypto
```

## Peer dependencies

**None.** No external dependencies. Uses Node's built-in `crypto` module.

## Usage

```typescript
import { /* public API */ } from "@nexusts/crypto";
```

See the [user guide](../../docs/user-guide/crypto.md) and the [example app](../../examples/) for a working demo.

## License

MIT — see the root [LICENSE](../../LICENSE).
