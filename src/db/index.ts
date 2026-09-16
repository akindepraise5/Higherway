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
type Handle = ReturnType<typeof connect>

function connect() {
  const url = process.env.DATABASE_URL
  if (!url) {
    throw new Error(
      "DATABASE_URL is not set. Copy .env.example to .env.local and fill in the Neon connection string.",
    )
  }
  return drizzle(neon(url), { schema, casing: "snake_case" })
}

let handle: Handle | null = null

/**
 * Connected on first use, never on import.
 *
 * This used to read the environment and throw at module scope, which broke
 * `trigger.dev deploy`: the indexer *imports* every task file inside a
 * container to discover the tasks in it, and the environment is not populated
 * at that point. The import threw, and the whole deploy failed with "There was
 * an error importing task files" — a message naming neither the variable nor
 * the file, so it says nothing about the actual cause.
 *
 * Deferring keeps the helpful message for anyone who really is missing the
 * variable, and lets a module be imported by something that never queries.
 */
export const db = new Proxy({} as Handle, {
  get(_target, property) {
    handle ??= connect()
    // Bound, or a method would be called with the proxy as `this`.
    const value = Reflect.get(handle, property, handle)
    return typeof value === "function" ? value.bind(handle) : value
  },
})

export { schema }
