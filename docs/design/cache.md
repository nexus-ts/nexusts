# Cache Module — design

> 한국어 버전: [`cache.ko.md`](./cache.ko.md)

This document explains the architecture of `@nexusts/cache`:
the `CacheStore` interface, the three built-in backends, the `wrap`
pattern, decorator integration, and tag-based invalidation.

## Goals

1. **Pluggable backends.** Memory (default), Redis, Drizzle — and any
   custom backend that implements `CacheStore`.
2. **Cache-or-compute (`wrap`).** A single atomic pattern: check cache
   first, compute if miss, store result. Avoids the TOCTOU race
   between `get` and `set`.
3. **Tag-based invalidation.** Invalidate groups of related entries
   without knowing their exact keys. Essential for cache consistency
   when related data changes.
4. **Decorator API.** `@Cacheable` and `@CacheInvalidate` for
   declarative caching on service methods.
5. **Cross-runtime.** Works on Bun and Cloudflare Workers
   (via the Drizzle store or a custom adapter).

## Architecture

```
User code
  │
  ├── Direct: cache.get('key'), cache.set('key', value, { ttl, tags })
  │
  ├── Wrap:   cache.wrap('key', async () => compute(), 60)
  │
  └── Decorators:
        @Cacheable('user', id => id, 60)
        async findById(id) { ... }

                │
                ▼
          CacheService
          ┌─────────────────┐
          │  prefix = 'app'  │
          │  defaultTtl = 60 │
          └────────┬────────┘
                   │
                   ▼
             CacheStore
          ┌──────────────────────┐
          │ MemoryStore          │  ← default
          │ RedisCacheStore      │  ← requires @nexusts/redis
          │ DrizzleCacheStore    │  ← requires a DrizzleService instance
          │ CustomStore          │  ← implement CacheStore interface
          └──────────────────────┘
```

## The `CacheEntry` format

```ts
interface CacheEntry<T> {
  value: T;
  expiresAt: number;          // unix-ms. 0 = never expires.
  tags?: string[];
}
```

Stores serialize this to JSON. The `expiresAt` field is evaluated on
read — expired entries are deleted lazily (on `get`) or by periodic
sweep (`MemoryStore.gc()`).

## Backend comparison

| Feature | MemoryStore | RedisCacheStore | DrizzleCacheStore |
|---------|-------------|-----------------|-------------------|
| Persistence | None (process) | Redis | Database |
| Cluster-safe | No | Yes | Yes |
| Tag invalidation | Yes (in-memory Set) | Yes (per-tag key) | Yes (tags table) |
| TTL | In-process sweep | Redis EXPIRE | SQL WHERE |
| LRU eviction | Yes (max.entries) | No (Redis eviction) | No |
| Migration | None | None | Required (CREATE TABLE) |

### MemoryStore

- LRU map with configurable `max` entries.
- Tag index is a `Map<tag, Set<key>>`.
- Sweep timer removes expired entries every `sweepIntervalMs`.
- Timer uses `unref()` so it doesn't keep the process alive.

### RedisCacheStore

- Uses `@nexusts/redis`'s unified `RedisClient` interface.
- Values are JSON-serialized with `CacheEntry<T>` envelope.
- Tag index is a separate Redis key per tag (CRC32-hashed tag name
  to avoid key collisions).
- TTL uses Redis's native `EX` option on `SET`.
- GC sweeps orphaned tag index entries (keys that no longer exist).

### DrizzleCacheStore

- Two tables: `cache_entries` and `cache_tags`.
- SQL `INSERT ... ON CONFLICT` (or equivalent) for atomic upsert.
- Tag invalidation uses a single `DELETE FROM cache_tags WHERE tag = ?`
  followed by `DELETE FROM cache_entries WHERE key IN (...)`.
- Expired entries are cleaned lazily on `get()` or eagerly via `gc()`.

## The `wrap` pattern

```ts
async wrap<T>(key, fn, ttl): Promise<T> {
  const hit = await this.get<T>(key);
  if (hit !== undefined) return hit;
  const value = await fn();
  await this.set(key, value, { ttl });
  return value;
}
```

This is not a distributed lock — if two concurrent requests both miss,
both compute and the second one overwrites. For most applications this
is fine (stale data for milliseconds). For cache stampede protection,
use a distributed lock (future work).

## Decorator integration

### `@Cacheable(prefix, keyFn, ttl)`

Wraps the original method with `cache.wrap()`:

```ts
// Original
@Cacheable('user', (id) => id, 60)
async findById(id) { return db.query(...) }

// Equivalent
async findById(id) {
  return cache.wrap(`user:${id}`, () => db.query(...), 60);
}
```

The decorator stores `CacheableSpec` metadata under
`"nexus:cache:cacheable"`. `CacheService.applyDecorators(target)`
reads this metadata and replaces each decorated method with a wrapper.

### `@CacheInvalidate(prefix, keyFn)`

Clears matching keys after the method executes:

```ts
// Original
@CacheInvalidate('user', (id) => id)
async deleteById(id) { return db.query(...) }

// Equivalent
async deleteById(id) {
  const result = await db.query(...);
  await cache.clear(`user:${id}*`);
  return result;
}
```

Uses prefix-match clearing (`cache.clear('user:42*')`) rather than
exact-key deletion to handle composite caches (e.g., `user:42`,
`user:42:posts`, `user:42:friends`).

## Tag-based invalidation

Tags are an alternative to prefix-based clearing for more precise
invalidation:

```ts
// Set with tags
await cache.set('user:42', data, { tags: ['user', 'premium'] });

// Invalidate all 'premium' entries
await cache.invalidateByTag('premium');
// Removes: user:42 (but not user:99 if it doesn't have the tag)
```

Implementation:

- **MemoryStore**: `Map<tag, Set<key>>` index. `invalidateByTag` does
  `get(tag) → Set<key> → delete each key` in O(n) where n = entries
  with that tag.
- **RedisCacheStore**: Per-tag key (`cache:tag:<crc32(tag)>`) stores a
  JSON array of cache keys. `invalidateByTag` reads the list, deletes
  each key, then deletes the tag key.
- **DrizzleCacheStore**: `cache_tags` table with `(tag, key)` rows.
  `invalidateByTag` does a SQL `DELETE FROM cache_entries WHERE key IN
  (SELECT key FROM cache_tags WHERE tag = ?)`.

## Future work

- **Distributed stampede protection** — use a CAS token or distributed
  lock so only one compute runs when a cache miss occurs.
- **Compression** — gzip large values before storing (opt-in).
- **Serialization hooks** — custom serializers for non-JSON types
  (e.g., `Buffer`, `Date`, `BigInt`).
- **Cache stats** — hit/miss/eviction counters exposed via metrics.
- **Event-based invalidation** — `cache:invalidated` event emitted
  when entries are removed, allowing other services to react.

## See also

- [`../user-guide/cache.md`](../user-guide/cache.md) — user guide
- [`../user-guide/redis.md`](../user-guide/redis.md) — Redis client
- [`di-container.md`](./di-container.md) — how `useExisting` works
