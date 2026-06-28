/**
 * nx.config.ts template — placed at the project root by `nx init` /
 * `nx new`.
 */

export default `/**
 * NexusTS project configuration.
 * Run \`nx info\` to see the resolved values.
 */

export default {
  // ---------------------------------------------------------------------------
  // Core
  // ---------------------------------------------------------------------------

  /** Runtime target — \`bun\` (default) or \`cloudflare\`. */
  runtime: '{{ runtime }}',

  /** Routing style used by \`make:controller\` / \`make:crud\`. */
  routing: '{{ routing }}',

  /** View engine — \`inertia\`, \`rendu\`, \`edge\`, or \`none\`. */
  view: '{{ view }}',

  /**
   * Directory searched when a controller returns a view file name
   * (e.g. \`about.html\`). Empty string = inline templates only.
   * Typical: \`'resources/views'\`. On edge runtimes
   * (Cloudflare Workers), leave empty and pass inline strings.
   */
  viewPaths: '{{ viewPaths }}',

  /** ORM driver — \`drizzle\`, \`kysely\`, or \`none\`. */
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
    app:         'app',
    controllers: 'app/controllers',
    services:    'app/services',
    modules:     'app/modules',
    models:      'app/models',
    migrations:  'app/database/migrations',
    seeds:       'db/seeds',
    middleware:  'app/middleware',
    dto:         'app/dto',
  },
};
`;
