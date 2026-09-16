import { config } from "dotenv"
import { defineConfig } from "drizzle-kit"

// drizzle-kit does not read .env.local the way Next.js does.
config({ path: ".env.local" })

/**
 * Schema lives in src/db/schema/, one file per area (see ARCHITECTURE.md §5).
 * Migrations are generated, never hand-edited — see CLAUDE.md.
 *
 * DATABASE_URL is only needed to *run* a migration. Generating one from the
 * schema works offline, which is deliberate: the schema can be built and
 * reviewed before any Neon project exists.
 */
export default defineConfig({
  schema: "./src/db/schema/*.ts",
  out: "./src/db/migrations",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "",
  },
  casing: "snake_case",
  strict: true,
  verbose: true,
})
