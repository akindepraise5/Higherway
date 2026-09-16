import { neon } from "@neondatabase/serverless"
import { drizzle } from "drizzle-orm/neon-http"
import * as schema from "./schema"

/**
 * The database handle. Neon over HTTP, which suits serverless request handlers:
 * no connection pool to exhaust, no socket left open between invocations.
 *
 * Long-running work — the backfill, OCR, embedding — runs in scripts/ and
 * src/trigger/ instead, where a normal pooled connection would be the better
 * choice if throughput ever demands it.
 *
 * Nothing here reads the environment at import time beyond this one variable,
 * so importing the schema for a migration or a test costs nothing.
 */
const url = process.env.DATABASE_URL

if (!url) {
  throw new Error(
    "DATABASE_URL is not set. Copy .env.example to .env.local and fill in the Neon connection string.",
  )
}

export const db = drizzle(neon(url), { schema, casing: "snake_case" })

export { schema }
