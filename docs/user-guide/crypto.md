# Crypto · `@nexusts/crypto` (v0.5)

> New in v0.5. Encryption + password hashing for NexusTS apps.
> Zero external dependencies. All primitives come from Bun's built-in `crypto` module.
> built-in `crypto` module.

`@nexusts/crypto` provides:

- **`EncryptionService`** — AES-256-GCM symmetric encryption +
  HMAC-SHA256 sign / unsign helpers.
- **`HashService`** — scrypt password hashing (default), with
  optional `@node-rs/argon2` peer for argon2.
- **`CryptoModule.forRoot({ key })`** — wires both into the DI
  container.

Other modules (`@nexusts/session`, `@nexusts/shield`) now use
`EncryptionService` internally for HMAC operations, so a single
APP_KEY is enough for sessions, CSRF tokens, and any encryption
you need in your app code.

---

## 1. Quick start

```bash
bun add nexus
# Optional (only if you use argon2):
bun add @node-rs/argon2
```

```ts
import { Module, Inject } from "@nexusts/core";
import {
  CryptoModule,
  EncryptionService,
  HashService,
  ENCRYPTION_SERVICE_TOKEN,
  HASH_SERVICE_TOKEN,
} from "@nexusts/crypto";

@Module({
  imports: [CryptoModule.forRoot({ key: process.env.APP_KEY! })],
})
class AppModule {}

@Injectable()
class UserService {
  constructor(
    @Inject(ENCRYPTION_SERVICE_TOKEN) private enc: EncryptionService,
    @Inject(HASH_SERVICE_TOKEN) private hash: HashService,
  ) {}

  async createUser(email: string, password: string) {
    const passwordHash = await this.hash.hash(password);
    const apiToken = this.enc.sign(email, "api-token");
    return { email, passwordHash, apiToken };
  }

  async verifyPassword(plain: string, stored: string) {
    return this.hash.verify(stored, plain);
  }
}
```

Generate the master key once with:

```bash
openssl rand -base64 32
# or
bun -e "console.log(require.'crypto').randomBytes(32).toString('base64'))"
```

---

## 2. `EncryptionService` — symmetric encryption

```ts
class EncryptionService {
  // AES-256-GCM authenticated encryption
  encrypt(value: string, options?: { expiresAt?: Date | number | string; purpose?: string }): string;
  decrypt<T = string>(payload: string): T;
  isEncrypted(value: string): boolean;

  // HMAC-SHA256 signing (stateless cookies, CSRF tokens, signed URLs)
  sign(value: string, purpose?: string): string;        // → `<b64-value>.<b64-mac>`
  unsign(signed: string, purpose?: string): string | null;

  // Lower-level: sign/verify a pre-encoded value (no b64 wrapping)
  signRaw(value: string, purpose?: string): string;     // → just the b64 MAC
  verifyRaw(value: string, signature: string, purpose?: string): boolean;
}
```

`encrypt()` output format:

```
v1.<base64url(iv)>.<base64url(tag)>.<base64url(ciphertext)>.<base64url(expiry)>.<base64url(purpose)>.<base64url(mac)>
```

Where:

- `iv` is 12 bytes
- `tag` is the GCM auth tag (16 bytes)
- `ciphertext` is the AES-256-GCM encrypted payload
- `expiry` is empty (no expiry) or a unix timestamp
- `purpose` is empty (no namespace) or the user-supplied purpose
- `mac` is HMAC-SHA256 over the canonical (version, iv, tag,
  ciphertext, expiry, purpose) tuple. The MAC is computed with
  a separate HKDF-derived key, so leaking the AES key doesn't
  compromise the MAC.

### Expiry

```ts
const oneHour = 60 * 60; // seconds
const encrypted = enc.encrypt("session-payload", { expiresAt: oneHour });
// → expires in one hour
enc.decrypt(encrypted); // throws after one hour
```

### Purpose / namespace

The purpose is bound to the MAC. A payload encrypted with
`purpose: "session"` cannot be replayed as `purpose: "csrf"`.
This protects against confused-deputy attacks where an attacker
tries to use one token type as another.

### Key derivation

The user provides a single master `key`. The framework derives
two 32-byte sub-keys via HKDF-SHA256 with the salt
`"nexus:crypto:v1"`:

- **AES key** (32 bytes) — for AES-256-GCM.
- **HMAC key** (32 bytes) — for the outer MAC and `sign/unsign`.

The two sub-keys are cryptographically independent. The same
master key is used across processes (so a session cookie signed
in one process can be verified in another).

If the master is shorter than 32 bytes, the framework pads it
deterministically (HMAC-SHA256 of the master keyed by
`"nexus:crypto:pad"`). The user is still encouraged to use a
32-byte random key.

---

## 3. `HashService` — password hashing

```ts
class HashService {
  hash(password: string, options?: { algorithm?: "scrypt" | "argon2" }): Promise<string>;
  verify(hashed: string, password: string): Promise<boolean>;
  needsRehash(hashed: string): boolean;
  readonly algorithm: "scrypt" | "argon2";
}
```

### scrypt (default)

```ts
const hash = new HashService();
const stored = await hash.hash("hunter2");
// $scrypt$N=16384,r=8,p=1,keyLen=64$<salt>$<hash>

const ok = await hash.verify(stored, "hunter2"); // true
const bad = await hash.verify(stored, "wrong");   // false
```

`scrypt` is memory-hard and CPU-hard. The framework's defaults
(N=16384, r=8, p=1, keyLen=64) are tuned for ~50ms hash time on
a modern server.

### argon2 (optional)

Install the peer:

```bash
bun add @node-rs/argon2
```

Then:

```ts
const hash = new HashService({ algorithm: "argon2" });
const stored = await hash.hash("hunter2");
// $argon2id$v=19$m=65536,t=3,p=4$<salt>$<hash>
```

The service auto-detects the optional peer dep. If it's not
installed and you try to use argon2, you'll get a clear error
message.

### Re-hashing

When you bump the cost parameters (e.g. scrypt N from 16384 to
32768), old hashes are still verifiable but the security floor
has moved up. `needsRehash()` tells you when to re-hash:

```ts
const ok = await hash.verify(stored, input);
if (!ok) return res.status(401).send("Invalid credentials");
if (hash.needsRehash(stored)) {
  const upgraded = await hash.hash(input);
  await db.updateUserPasswordHash(userId, upgraded);
}
res.status(200).send("OK");
```

### 3.4 Standalone helpers (no DI required)

In addition to the `HashService` class, `@nexusts/crypto` exports
**standalone helper functions** that wrap the class. Use these when
you're outside the DI container — CLI scripts, database seeders,
smoke tests, one-off serverless handlers:

```ts
import { scryptHash, scryptVerify, hash, verify } from "@nexusts/crypto";

const stored = await scryptHash("hunter2");
const ok = await scryptVerify(stored, "hunter2");

// Or pick algorithm explicitly:
const argonHash = await hash("hunter2", { algorithm: "argon2" });
```

Available helpers:

| Function | Returns | Equivalent |
| --- | --- | --- |
| `scryptHash(password)` | `Promise<string>` | `new HashService().hash(password, { algorithm: "scrypt" })` |
| `scryptVerify(hashed, password)` | `Promise<boolean>` | `new HashService().verify(hashed, password)` (scrypt) |
| `hash(password, options?)` | `Promise<string>` | `new HashService().hash(password, options)` |
| `verify(hashed, password)` | `Promise<boolean>` | `new HashService().verify(hashed, password)` |

The standalone functions **do not register in DI** — they create a
one-off `HashService` instance per call. They're safe to use in async
background tasks where you don't have access to the application
container.

---

## 4. Use cases

| Use case | API |
| --- | --- |
| Encrypt sensitive data before storing (session blobs in DB, API tokens at rest) | `enc.encrypt(value, { purpose: "..." })` |
| Decrypt the above | `enc.decrypt<T>(payload)` |
| Sign a stateless session cookie | `enc.sign(payload, "session")` |
| Verify a signed cookie / CSRF token | `enc.unsign(signed, "purpose")` |
| Hash a user's password | `await hash.hash(password)` |
| Verify a login attempt | `await hash.verify(stored, plain)` |
| Re-hash after a security-floor bump | `hash.needsRehash(stored)` |

---

## 5. Migration from v0.4

This module is new in v0.5. The cookie session backend
(`CookieSessionStorage`) and the CSRF guard in `@nexusts/shield`
now use `EncryptionService` for HMAC. **Existing signed cookies
will be invalidated** because the HMAC key is now derived via
HKDF instead of being the secret directly. Users will be signed
out after the upgrade — they need to re-authenticate.

If you want zero-downtime migration, both modules accept a
fallback path: a `legacySecret` option that allows the old
HMAC-SHA256 format to be verified alongside the new format. (Not
shipped in v0.5 — open an issue if you need it.)

---

## 6. Configuration

```ts
interface EncryptionConfig {
  key: string;                 // 32+ bytes recommended
  algorithm?: "aes-256-gcm";   // default: "aes-256-gcm"
  defaultExpiresIn?: number | string;  // default: never
}

interface HashConfig {
  algorithm?: "scrypt" | "argon2";    // default: "scrypt"
  scryptCost?: number;                // default: 16384
  scryptBlockSize?: number;           // default: 8
  scryptParallelization?: number;     // default: 1
  scryptKeyLength?: number;          // default: 64
  argon2MemoryCost?: number;          // default: 65536
  argon2TimeCost?: number;            // default: 3
  argon2Parallelism?: number;         // default: 4
}
```

---

## 7. See also

- [`./sse.md`](./sse.md), [`./ws.md`](./ws.md) — the realtime
  modules. The session cookie is the canonical place to use HMAC;
  WebSocket auth patterns are documented in `ws.md`.
- [`./session.md`](./session.md) — `CookieSessionStorage` now
  uses `EncryptionService` internally.
- [`./shield.md`](./shield.md) — the CSRF guard now uses
  `EncryptionService` internally.
- [AdonisJS encryption reference](https://docs.adonisjs.com/guides/security/encryption)
- [AdonisJS hash reference](https://docs.adonisjs.com/guides/security/hashing)
- [OWASP Password Storage Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html)
