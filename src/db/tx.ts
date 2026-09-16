import { neonConfig, Pool } from "@neondatabase/serverless"
import { drizzle } from "drizzle-orm/neon-serverless"
import ws from "ws"
import * as schema from "./schema"

/**
 * The transactional database handle.
 *
 * `src/db/index.ts` uses Neon's HTTP driver, which is ideal for page queries:
 * one request, no pool to exhaust, nothing left open between invocations. But
 * it has no transaction support at all — `db.transaction()` there throws
 * "No transactions support in neon-http driver".
 *
 * That matters because CLAUDE.md requires every mutation to write its audit
 * entry in the same transaction as the change. A change that is recorded but
 * not applied — or applied but not recorded — is worse than either alone, and
 * for an archive of published material the audit trail is the point.
 *
 * So mutations use this pooled WebSocket connection instead, where a real
 * interactive transaction works: read, decide, write, and roll back together.
 * Reads stay on the HTTP driver.
 */

// Node has no native WebSocket in the runtime Neon expects here.
neonConfig.webSocketConstructor = ws

type Handle = ReturnType<typeof connect>

function connect() {
  const url = process.env.DATABASE_URL
  if (!url) {
    throw new Error(
      "DATABASE_URL is not set. Copy .env.example to .env.local and fill in the Neon connection string.",
    )
  }

  /**
   * One pool for the process. Serverless invocations are short-lived, so this
   * is small deliberately: a large pool on a free-plan database buys nothing
   * and risks exhausting connections under any concurrency.
   */
  const pool = new Pool({ connectionString: url, max: 3 })
  return drizzle(pool, { schema, casing: "snake_case" })
}

let handle: Handle | null = null

/**
 * Connected on first use, never on import — for the same reason as `src/db`.
 *
 * `trigger.dev deploy` imports every task file in a container to discover the
 * tasks inside it, with no environment populated. Reading `DATABASE_URL` at
 * module scope failed the whole deploy with "There was an error importing task
 * files", which names neither the variable nor the file.
 *
 * Opening the pool lazily matters twice over: a pool built at import time would
 * be created by anything that so much as imports this module, including the
 * indexer, which never runs a query.
 */
export const txdb = new Proxy({} as Handle, {
  get(_target, property) {
    handle ??= connect()
    // Bound, or a method would be called with the proxy as `this`.
    const value = Reflect.get(handle, property, handle)
    return typeof value === "function" ? value.bind(handle) : value
  },
})

export type Tx = Parameters<Parameters<typeof txdb.transaction>[0]>[0]
