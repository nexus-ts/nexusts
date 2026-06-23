# npm Publish Rate Limit (2026-06-23 incident)

## Symptom

When publishing 31 packages from a brand-new org in quick succession
(v0.7.0 monorepo release), 25 succeeded and the next 6 failed with:

```
npm error code E429
npm error 429 Too Many Requests - PUT
  https://registry.npmjs.org/@nexusts%2f<name>
npm error Could not publish, as user undefined: rate limited exceeded
```

## Diagnosis

- npm does **not** publish the exact limit in any public docs
- Reported in the wild (StackOverflow, GitHub issues): the limit
  appears to be around **25 new packages per 24 hours per user** for
  new accounts / orgs
- The error message deliberately hides whether the limit is per-IP,
  per-user, or per-org; the message says `user undefined`
- Reset window: roughly 24 hours, but timing is not publicly documented
- Reference: https://github.com/npm/cli/issues/8507 (and the linked
  stackoverflow answer about Cloudflare heuristics on the `Referer`
  header)

## Mitigation

### Already in place

- `scripts/publish.ts` is **idempotent**: it skips any package whose
  exact version is already on the registry, so a re-run of the
  workflow after the limit resets will only attempt the 6 missing
  packages.
- `workflow_dispatch` has a `publish-batch` mode that adds a 10-minute
  break every 5 packages. Less critical now that we know the real
  limit is "per 24h", but useful for future fresh-org releases.

### Operational

- **Re-run after ~24 hours**: `bun run publish:all` (or push a new
  release tag) will retry only the missing 6 packages.
- **Avoid publishing >25 new packages in 24h** from a single account.
  For NexusTS this only matters at the initial 31-package release;
  subsequent releases (v0.7.x → v0.7.y) only update existing packages
  and are not affected.

### Long-term

- Adopt [Changesets](https://github.com/changesets/changesets) for
  versioning + publishing once the package set stabilises. Changesets
  is the de-facto standard for multi-package monorepos and handles
  the 24h limit gracefully (it batches and resumes).
