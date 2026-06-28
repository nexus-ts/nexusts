---
title: Getting Started
description: Get started with NexusTS
---

# Getting Started

## Prerequisites

- [Bun](https://bun.sh) ≥ 1.3.10

## Quick Start

The fastest way to create a new NexusTS project:

```bash
bun create nexusts@latest my-app
cd my-app
bun install
bun run dev
```

This scaffolds a complete project with:

- MVC structure (`app/` directory with controllers, modules)
- Drizzle ORM (bun-sqlite — zero-config SQLite)
- Static file serving
- `.env` / `.env.local` configuration

## Using the CLI

For more control over the scaffolding, use the `nx` CLI directly:

```bash
# Create a minimal project
bunx nx new my-app

# Create with specific options
bunx nx new my-app --style nest --view inertia --orm drizzle --db sqlite --frontend react

# Initialize in an existing directory (non-destructive)
bunx nx init --style nest --view inertia --orm drizzle
```

## Project Structure

```
my-app/
├── app/
│   ├── main.ts                 # Entry point
│   ├── app.module.ts           # Root module
│   └── controllers/
│       └── home.controller.ts  # Sample controller
├── resources/
│   ├── views/                  # Templates (Rendu/Edge/Eta)
│   └── js/                     # Inertia pages (React/Vue)
├── public/                     # Static assets
├── nx.config.ts                # Framework configuration
├── drizzle.config.ts           # Drizzle configuration
├── tsconfig.json
└── package.json
```

## Next Steps

Once your project is running, try these:

```bash
# Generate a CRUD API
bunx nx make:crud Post

# Generate a controller
bunx nx make:controller User

# Run database migrations
bunx nx db:generate
bunx nx db:migrate

# Open the interactive REPL
bunx nx repl
```

## Learn More

- [User Guide](https://github.com/nexus-ts/nexusts/tree/main/docs/user-guide) — detailed guides for all 32 modules
- [API Reference](https://github.com/nexus-ts/nexusts/blob/main/docs/api-reference.md) — complete API documentation
- [Examples](https://github.com/nexus-ts/nexusts/tree/main/examples) — 34 working example apps
- [NestJS Comparison](https://github.com/nexus-ts/nexusts/blob/main/docs/analysis/nestjs-comparison.md)
- [AdonisJS Comparison](https://github.com/nexus-ts/nexusts/blob/main/docs/analysis/adonisjs-comparison.md)
