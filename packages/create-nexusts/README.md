# create-nexusts

> Scaffold a new [NexusTS](https://github.com/nexus-ts/nexusts) project — Bun-native fullstack framework.

The official scaffolder for [NexusTS](https://github.com/nexus-ts/nexusts). Creates a new project with the framework's MVC + DI + routing + validation stack pre-configured, plus your choice of view engine, ORM, and database.

## Quick start

```bash
# Create a new NexusTS project:
bun create nexusts@latest my-app
# Or:
bunx create-nexusts@latest my-app
```

Then:

```bash
cd my-app
bun install
bun run dev
```

Your app will be running at `http://localhost:3000`.

## Options

| Flag | Default | Description |
|------|---------|-------------|
| `--style` | `nest` | Routing style: `nest`, `adonis`, `functional` |
| `--view` | `rendu` | View engine: `rendu`, `edge`, `eta`, `inertia`, `none` |
| `--orm` | `drizzle` | ORM: `drizzle`, `prisma`, `kysely`, `none` |
| `--db` | `sqlite` | Database: `sqlite`, `postgres`, `mysql`, `none` |

### Examples

```bash
# Minimal: NestJS-style + Rendu + Drizzle + SQLite
bun create nexusts@latest my-app

# Inertia.js v3 + React SPA
bun create nexusts@latest my-app --view inertia

# No ORM (just an HTTP skeleton)
bun create nexusts@latest my-app --orm none --db none

# Functional handler style (Hono-style)
bun create nexusts@latest my-app --style functional
```

## What you get

A complete project structure:

```
my-app/
├── app/
│   ├── app.module.ts          # Root module
│   ├── app.controller.ts      # Example controller
│   ├── app.service.ts         # Example service
│   └── main.ts                # Bootstrap (listens on PORT)
├── app.config.ts              # Framework config (loaded at boot)
├── package.json               # @nexusts/core + your chosen add-ons
├── tsconfig.json              # Standard decorators (Bun 1.3 default)
└── README.md                  # Project-specific README
```

Internally this runs `bunx @nexusts/core init` in the new directory — you can use that command directly in an existing project to add NexusTS without losing files.

## Help

```bash
create-nexusts --help     # Show usage
create-nexusts --version  # Show version
```

## License

MIT — see the [LICENSE](./LICENSE) file in the main [NexusTS repo](https://github.com/nexus-ts/nexusts).
