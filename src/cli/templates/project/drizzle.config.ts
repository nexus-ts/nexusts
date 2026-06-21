/**
 * drizzle.config.ts template — placed at the project root by
 * `nx config` when the project's ORM is set to `drizzle`.
 *
 * The dialect is derived from the project's `db` driver:
 *   bun-sqlite / node-sqlite / libsql  →  sqlite
 *   postgres                            →  postgresql
 *   mysql                               →  mysql
 */

export default `
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "{{ dialect }}",
  schema: "./src/app/models/*.model.ts",
  out: "./drizzle",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "{{ dbUrl }}",
  },
  verbose: true,
  strict: true,
});
`;
