# NexusTS — Claude Code Guide

This project uses **Bun** (≥ 1.3), **TypeScript**, **Hono**, **Drizzle ORM**.

## Quick start

```bash
bun install
bun run build           # build all packages
bun run test            # run tests
bun run examples:smoke  # smoke tests (69)
```

## Key conventions

- **Legacy decorators** (`experimentalDecorators: true`) — not TC39 stage-3.
- **32 independent packages** under `@nexusts/*` — each is its own bundle entry.
- **Docs must be written in BOTH English (`.md`) and Korean (`.ko.md`)** simultaneously.

## Full reference

See [`AGENTS.md`](./AGENTS.md) for the complete module-author guide,
decorator conventions, 7-step module addition workflow, and build pipeline details.

---

## Fork workflow (hoksi/nexusts → nexus-ts/nexusts)

> These rules apply only to this fork. CLAUDE.md is untracked locally.

### Branch model

- `main` = **mirror of upstream/main** — never commit directly, never diverge
- All work happens on feature branches cut from `upstream/main`
- `fork/main` does NOT exist; `origin/main` IS the fork mirror
- `develop` = fork-specific persistent branch (bench commits, CLAUDE.md, etc.)

### Sync upstream → fork/main

```bash
git fetch upstream
git checkout main
git reset --hard upstream/main
git push origin main --force
```

### Start new work

```bash
git fetch upstream
git checkout -b feat/<name> upstream/main
# ... develop, commit ...
git push origin feat/<name>
# PR: hoksi/nexusts feat/<name> → nexus-ts/nexusts main
```

### Cherry-pick for upstream PR

```bash
git fetch upstream
git checkout -b fix/<name> upstream/main
git cherry-pick <commit-sha>   # from fork feature branch
# resolve conflicts if any, then:
git push origin fix/<name>
# PR: hoksi/nexusts fix/<name> → nexus-ts/nexusts main
```

### Rules to minimize merge conflicts

1. **Never develop on `main`** — even one commit causes divergence
2. **Branch from `upstream/main`**, not `origin/main`
3. **Fork-only files** (this CLAUDE.md, `dev-docs/`) are committed to `develop` only
4. **After upstream merges a PR**, sync main immediately and delete the feature branch
5. **One concern per branch** — smaller diffs = fewer conflicts on cherry-pick
