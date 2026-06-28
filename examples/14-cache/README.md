# 14 · Cache

In-memory and persistent caching with `@nexusts/cache`.

## What it shows

- `CacheModule.forRoot({ backend: 'memory' | 'drizzle' | 'redis' })`
- `CacheService.get(key)` / `.set(key, value, ttl)` / `.invalidate(tag)`
- `invalidateByTag()` for cache busting

## How to run

```bash
cd examples/14-cache
bun main.ts
```

```bash
# First call: slow (cache miss)
time curl http://localhost:3000/slow
# Second call: fast (cache hit)
time curl http://localhost:3000/slow
```

## Code

```ts
import "reflect-metadata";
import { Application, Module, Controller, Get, Inject, Injectable } from "@nexusts/core";
import { CacheService, CacheModule } from "@nexusts/cache";

@Injectable()
@Controller("/")
class PageController {
  @Inject(CacheService) declare private cache: CacheService;

  @Get("/slow")
  async slow() {
    const key = "homepage";
    const cached = await this.cache.get(key);
    if (cached) return { from: "cache", data: cached };

    await new Promise((r) => setTimeout(r, 2000));   // simulate slow I/O
    const data = { html: "<h1>Hello</h1>", ts: Date.now() };
    await this.cache.set(key, data, { ttl: 60_000, tags: ["homepage"] });
    return { from: "origin", data };
  }

  @Get("/bust")
  async bust() {
    await this.cache.invalidateByTag("homepage");
    return { ok: true };
  }
}

@Module({
  imports: [CacheModule.forRoot({ backend: "memory" })],
  controllers: [PageController],
})
class AppModule {}

const app = new Application(AppModule);
await app.listen(3000);
```

## Backends

| Backend | Use case |
|---------|----------|
| `memory` | Single-pod, fast |
| `drizzle` | Multi-pod, persists in DB |
| `redis` | Multi-pod, fast, dedicated cache |

## Tag-based invalidation

```ts
await cache.set("post:1", post, { tags: ["post:1", "posts:list"] });
await cache.set("posts:list", list, { tags: ["posts:list"] });

// Publishing a new post → bust the list cache
await cache.invalidateByTag("posts:list");
```

## TTLs

```ts
await cache.set("session:42", { ... }, { ttl: 60_000 });           // 60s
await cache.set("user-cache:5", { ... }, { ttl: "1h" });            // string TTL
await cache.set("permanent", { ... }, { ttl: "0" });                // no expiry
```
