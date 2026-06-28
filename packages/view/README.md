# @nexusts/view

> **NexusTS View** — View engines (Rendu, Edge Templates, Eta) + Inertia.js v3 adapter for Bun and Cloudflare Workers.

## Features

- **3 engines**: Rendu (default), Edge Templates (`.edge`), Eta (EJS-style `.eta`)
- **Inertia.js v3** — React + Vue SPAs and SSR
- **Field injection** — `@Inject(Inertia.TOKEN) declare inertia: Inertia` (standard decorators)
- **No extra deps** — Rendu/Edge/Eta are built-in. Only need peer deps for Inertia React/Vue.

## Install

This module is part of the NexusTS monorepo. Each module is published as its own npm package under the `@nexusts/` scope.

Most apps start with just the core:

```bash
bun add @nexusts/core
```

Then add this module only if you need it:

```bash
bun add @nexusts/view
```

## Peer dependencies

**None.** No external dependencies for Rendu / Edge / Eta. Inertia.js React requires `react` and `@inertiajs/react`; Inertia.js Vue requires `vue` and `@inertiajs/vue3`.

## Quick start

```bash
bun add @nexusts/view
```

```typescript
import { Inertia } from "@nexusts/view";
import { Inject, Injectable } from "@nexusts/core";

@Injectable()
class PageController {
  @Inject(Inertia.TOKEN) declare inertia: Inertia;

  home() {
    return this.inertia.render("Home", { greeting: "Hello!" });
  }
}
```

See the [user guide](../../docs/user-guide/view.md) and the [example app](../../examples/) for a working demo.

## License

MIT — see the root [LICENSE](../../LICENSE).
