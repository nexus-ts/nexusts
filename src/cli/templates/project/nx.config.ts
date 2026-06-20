/**
 * nx.config.ts template — placed at the project root by `nx init` /
 * `nx new`.
 */

export default `/**
 * Nexus project configuration.
 * Run \`nx info\` to see the resolved values.
 */

export default {
  // ---------------------------------------------------------------------------
  // Core
  // ---------------------------------------------------------------------------

  /** Routing style used by \`make:controller\` / \`make:crud\`. */
  routing: '{{ routing }}',

  /** View engine — \`inertia\`, \`rendu\`, \`edge\`, or \`none\`. */
  view: '{{ view }}',

  /** ORM driver — \`drizzle\`, \`prisma\`, \`kysely\`, or \`none\`. */
  orm: '{{ orm }}',

  // ---------------------------------------------------------------------------
  // Database
  // ---------------------------------------------------------------------------

  database: {
    driver: '{{ dbDriver }}',
    url: process.env.DATABASE_URL ?? '{{ dbUrl }}',
  },

  // ---------------------------------------------------------------------------
  // Inertia (only consulted when \`view === 'inertia'\`)
  // ---------------------------------------------------------------------------

  inertia: {
    frontend: '{{ inertiaFrontend }}',
    ssr: {{ inertiaSSR }},
    version: '{{ inertiaVersion }}',
  },

  // ---------------------------------------------------------------------------
  // Paths
  // ---------------------------------------------------------------------------

  paths: {
    app:         'src/app',
    controllers: 'src/app/controllers',
    services:    'src/app/services',
    modules:     'src/app/modules',
    models:      'src/app/models',
    migrations:  'src/app/database/migrations',
    middleware:  'src/app/middleware',
    dto:         'src/app/dto',
  },
};
`;