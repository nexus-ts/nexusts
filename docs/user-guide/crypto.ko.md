# 암호화 · `@nexusts/crypto` (v0.5)

> English: [`crypto.md`](./crypto.md)
> v0.5 신규. NexusTS 앱을 위한 암호화 + 패스워드 해싱.
> 외부 의존성 0. 모든 primitive는 Node의 내장 `crypto` 모듈에서 옴.

`@nexusts/crypto`가 제공하는 것:

- **`EncryptionService`** — AES-256-GCM 대칭 암호화 + HMAC-SHA256 sign / unsign 헬퍼.
- **`HashService`** — scrypt 패스워드 해싱 (기본), 옵션 `@node-rs/argon2` peer로 argon2.
- **`CryptoModule.forRoot({ key })`** — DI 컨테이너에 둘 다 연결.

다른 모듈(`@nexusts/session`, `@nexusts/shield`)은 이제 HMAC 작업을 위해 내부적으로 `EncryptionService`를 사용. 단일 APP_KEY로 세션, CSRF 토큰, 앱 코드에서 필요한 모든 암호화를 처리하기에 충분.

---

## 1. 빠른 시작

```bash
bun add nexus
# 옵션 (argon2 사용 시에만):
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

마스터 키를 한 번 생성:

```bash
openssl rand -base64 32
# 또는
bun -e "console.log(require.'crypto').randomBytes(32).toString('base64'))"
```

---

## 2. `EncryptionService` — 대칭 암호화

```ts
class EncryptionService {
  // AES-256-GCM 인증된 암호화
  encrypt(value: string, options?: { expiresAt?: Date | number | string; purpose?: string }): string;
  decrypt<T = string>(payload: string): T;
  isEncrypted(value: string): boolean;

  // HMAC-SHA256 서명 (stateless 쿠키, CSRF 토큰, 서명된 URL)
  sign(value: string, purpose?: string): string;        // → `<b64-value>.<b64-mac>`
  unsign(signed: string, purpose?: string): string | null;

  // 저수준: 미리 인코딩된 값에 sign/verify (b64 래핑 없음)
  signRaw(value: string, purpose?: string): string;     // → b64 MAC만
  verifyRaw(value: string, signature: string, purpose?: string): boolean;
}
```

`encrypt()` 출력 포맷:

```
v1.<base64url(iv)>.<base64url(tag)>.<base64url(ciphertext)>.<base64url(expiry)>.<base64url(purpose)>.<base64url(mac)>
```

여기서:

- `iv`는 12 bytes
- `tag`는 GCM auth tag (16 bytes)
- `ciphertext`는 AES-256-GCM 암호화된 payload
- `expiry`는 비어있거나(만료 없음) unix timestamp
- `purpose`는 비어있거나(namespace 없음) 사용자 지정 purpose
- `mac`는 정준 튜플(version, iv, tag, ciphertext, expiry, purpose)에 대한 HMAC-SHA256. MAC은 별도로 HKDF-유도된 키로 계산되어, AES 키 유출이 MAC을 손상시키지 않음.

### 만료

```ts
const oneHour = 60 * 60; // 초
const encrypted = enc.encrypt("session-payload", { expiresAt: oneHour });
// → 1시간 후 만료
enc.decrypt(encrypted); // 1시간 후 throw
```

### Purpose / 네임스페이스

Purpose는 MAC에 바인딩됨. `purpose: "session"`으로 암호화된 payload는 `purpose: "csrf"`로 재생될 수 없음. 이는 공격자가 한 토큰 타입을 다른 타입으로 사용하려는 confused-deputy 공격을 방어.

### 키 유도

사용자는 단일 마스터 `key`를 제공. 프레임워크는 HKDF-SHA256으로 salt `"nexus:crypto:v1"`를 사용해 두 개의 32-byte 서브 키를 유도:

- **AES 키** (32 bytes) — AES-256-GCM용.
- **HMAC 키** (32 bytes) — 외부 MAC 및 `sign/unsign`용.

두 서브 키는 암호학적으로 독립적. 같은 마스터 키가 프로세스 간 공유되어 한 프로세스에서 서명된 세션 쿠키를 다른 프로세스에서 검증 가능.

마스터가 32 bytes보다 짧으면 프레임워크가 결정론적으로 패딩 (`"nexus:crypto:pad"`로 키잉된 마스터의 HMAC-SHA256). 사용자는 여전히 32-byte 랜덤 키 사용이 권장됨.

---

## 3. `HashService` — 패스워드 해싱

```ts
class HashService {
  hash(password: string, options?: { algorithm?: "scrypt" | "argon2" }): Promise<string>;
  verify(hashed: string, password: string): Promise<boolean>;
  needsRehash(hashed: string): boolean;
  readonly algorithm: "scrypt" | "argon2";
}
```

### scrypt (기본)

```ts
const hash = new HashService();
const stored = await hash.hash("hunter2");
// $scrypt$N=16384,r=8,p=1,keyLen=64$<salt>$<hash>

const ok = await hash.verify(stored, "hunter2"); // true
const bad = await hash.verify(stored, "wrong");   // false
```

`scrypt`는 memory-hard, CPU-hard. 프레임워크 기본값 (N=16384, r=8, p=1, keyLen=64)은 모던 서버에서 ~50ms 해시 시간에 맞춰짐.

### argon2 (옵션)

Peer 설치:

```bash
bun add @node-rs/argon2
```

그다음:

```ts
const hash = new HashService({ algorithm: "argon2" });
const stored = await hash.hash("hunter2");
// $argon2id$v=19$m=65536,t=3,p=4$<salt>$<hash>
```

서비스가 optional peer dep을 자동 감지. 설치되지 않았는데 argon2를 쓰려고 하면 명확한 에러 메시지.

### Re-hashing

cost 파라미터를 올리면 (예: scrypt N 16384에서 32768) 옛 해시도 여전히 검증 가능하지만 보안 floor가 올라감. `needsRehash()`가 re-hash 시점을 알려줌:

```ts
const ok = await hash.verify(stored, input);
if (!ok) return res.status(401).send("Invalid credentials");
if (hash.needsRehash(stored)) {
  const upgraded = await hash.hash(input);
  await db.updateUserPasswordHash(userId, upgraded);
}
res.status(200).send("OK");
```

---

## 4. 사용 사례

| 사용 사례 | API |
| --- | --- |
| 저장 전 민감 데이터 암호화 (DB의 세션 blob, rest의 API 토큰) | `enc.encrypt(value, { purpose: "..." })` |
| 위의 복호화 | `enc.decrypt<T>(payload)` |
| Stateless 세션 쿠키 서명 | `enc.sign(payload, "session")` |
| 서명된 쿠키 / CSRF 토큰 검증 | `enc.unsign(signed, "purpose")` |
| 사용자 패스워드 해싱 | `await hash.hash(password)` |
| 로그인 시도 검증 | `await hash.verify(stored, plain)` |
| security-floor bump 후 re-hash | `hash.needsRehash(stored)` |

---

## 5. v0.4에서 마이그레이션

이 모듈은 v0.5에서 신규. 쿠키 세션 백엔드(`CookieSessionStorage`)와 `@nexusts/shield`의 CSRF 가드는 이제 HMAC을 위해 `EncryptionService`를 사용. **기존 서명된 쿠키는 무효화됨** — HMAC 키가 이제 직접 secret 대신 HKDF로 유도되기 때문. 업그레이드 후 사용자는 로그아웃됨 — 재인증 필요.

다운타임 zero 마이그레이션을 원하면 두 모듈 모두 fallback path 수용: 옛 HMAC-SHA256 포맷을 새 포맷과 함께 검증할 수 있는 `legacySecret` 옵션. (v0.5에서는 출시되지 않음 — 필요하면 이슈를 열어주세요.)

---

## 6. 설정

```ts
interface EncryptionConfig {
  key: string;                 // 32+ bytes 권장
  algorithm?: "aes-256-gcm";   // default: "aes-256-gcm"
  defaultExpiresIn?: number | string;  // default: 만료 없음
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

## 7. 참고

- [`./sse.md`](./sse.md), [`./ws.md`](./ws.md) — 실시간 모듈. 세션 쿠키는 HMAC 사용의 정식 위치; WebSocket 인증 패턴은 `ws.md`에 문서화.
- [`./session.md`](./session.md) — `CookieSessionStorage`가 이제 내부적으로 `EncryptionService` 사용.
- [`./shield.md`](./shield.md) — CSRF 가드가 이제 내부적으로 `EncryptionService` 사용.
- [AdonisJS 암호화 레퍼런스](https://docs.adonisjs.com/guides/security/encryption)
- [AdonisJS 해시 레퍼런스](https://docs.adonisjs.com/guides/security/hashing)
- [OWASP 패스워드 저장 cheat sheet](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html)
