> ⚠️ **Experimental / 실험 중** — This package is actively developed. The API may change without notice until v1.0.

# @nexusts/cache

> **NexusTS Cache** — Application cache with memory, Redis, and Drizzle backends. Tag-based invalidation, TTL, and decorator support.

## Features

- **3 backends**: Memory (default), Redis, Drizzle
- **Tag-based invalidation** — group keys by tag and bust them together
- **TTL** — per-key or default expiry
- **Decorators** — `@Cacheable` / `@CacheInvalidate` (dual-mode: standard + legacy)
- **Field injection** — `@Inject(CacheService.TOKEN) declare cache: CacheService`

## Install

This module is part of the NexusTS monorepo. Each module is published as its own npm package under the `@nexusts/` scope.

Most apps start with just the core:

```bash
bun add @nexusts/core
```

Then add this module only if you need it:

```bash
bun add @nexusts/cache
```

## Peer dependencies

**None.** No external dependencies. The memory and Drizzle backends are bundled; the Drizzle backend uses `@nexusts/drizzle` if installed.

## Quick start

```bash
bun add @nexusts/cache
```

```typescript
import { CacheService, CacheModule } from "@nexusts/cache";
import { Inject, Module } from "@nexusts/core";

@Module({
  imports: [CacheModule.forRoot({ defaultTtl: 300 })],
})
class AppModule {}

class UserService {
  @Inject(CacheService.TOKEN) declare cache: CacheService;

  async getUser(id: string) {
    return this.cache.wrap(`user:${id}`, () => this.db.findUser(id), 60);
  }
}
```

## Backends

| Backend | Use case | Setup |
|---------|----------|-------|
| `memory` | Single-pod, fast | Default (no extra deps) |
| `redis` | Multi-pod, shared cache | `backend: 'redis'` + `@nexusts/redis` |
| `drizzle` | Persistent, DB-backed | `store: new DrizzleCacheStore(db)` |

## Decorators

```typescript
import { Cacheable, CacheInvalidate } from "@nexusts/cache"

class PostService {
  @Cacheable("post", (id: string) => id, 60)
  async findById(id: string) { /* ... */ }

  @CacheInvalidate("post", (id: string) => id)
  async deleteById(id: string) { /* ... */ }
}
```

See the [user guide](../../docs/user-guide/cache.md) and the [example app](../../examples/14-cache/) for a working demo.

## License

MIT — see the root [LICENSE](../../LICENSE).
