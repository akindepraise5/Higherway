import { runs } from "@trigger.dev/sdk"
import { desc, eq, isNull } from "drizzle-orm"
import { db } from "../../db"
import { syncRuns } from "../../db/schema"
import { user } from "../../db/schema/auth"

/** Reading the sync history. `sync_runs` has existed since Phase 1, unwritten. */

export type SyncOutcome = {
  file: string
  driveId: string
  result: "imported" | "skipped" | "flagged" | "failed"
  why?: string
  runId?: string
}

export type SyncRun = {
  id: string
  startedAt: Date
  finishedAt: Date | null
  byName: string | null
  byEmail: string | null
  imported: number
  skipped: number
  flagged: number
  failed: number
  error: string | null
  detail: SyncOutcome[]
}

export async function recentRuns(limit = 10): Promise<SyncRun[]> {
  const rows = await db
    .select({
      id: syncRuns.id,
      startedAt: syncRuns.startedAt,
      finishedAt: syncRuns.finishedAt,
      byName: user.name,
      byEmail: user.email,
      imported: syncRuns.imported,
      skipped: syncRuns.skipped,
      flagged: syncRuns.flagged,
      failed: syncRuns.failed,
      error: syncRuns.error,
      detail: syncRuns.detail,
    })
    .from(syncRuns)
    .leftJoin(user, eq(user.id, syncRuns.startedBy))
    .orderBy(desc(syncRuns.startedAt))
    .limit(limit)

  return rows.map((row) => ({
    ...row,
    /**
     * `detail` is `jsonb`, so it is whatever was written — typed here at the
     * boundary rather than trusted. An older run, or one from a version that
     * wrote a different shape, becomes an empty list instead of throwing while
     * a page renders.
     */
    detail: Array.isArray(row.detail) ? (row.detail as SyncOutcome[]) : [],
  }))
}

export type OpenRun = {
  id: string
  startedAt: Date
  /** Trigger's own word for it, when it could be asked. */
  state: "queued" | "running" | "gone" | "unknown"
}

/**
 * A run that has not reported, and **what Trigger says about it**.
 *
 * Asking matters. A run queued with no worker to pick it up looks exactly like
 * one that is working hard, and the page can only say "a sync is running" — for
 * ever. That is what happened here: two dry runs were queued against a project
 * with no deployed worker, and nothing on the page could say so.
 *
 * `QUEUED` after the first few seconds means nothing is consuming the queue,
 * which is the single most useful thing this page can tell an Owner. If Trigger
 * cannot be reached the state is `unknown` and the page says less rather than
 * guessing.
 */
export async function runningSync(): Promise<OpenRun | null> {
  const [row] = await db
    .select({ id: syncRuns.id, startedAt: syncRuns.startedAt, runId: syncRuns.runId })
    .from(syncRuns)
    .where(isNull(syncRuns.finishedAt))
    .orderBy(desc(syncRuns.startedAt))
    .limit(1)

  if (!row) return null
  if (!row.runId) return { id: row.id, startedAt: row.startedAt, state: "unknown" }

  try {
    const run = await runs.retrieve(row.runId)
    const status = String(run.status)
    return {
      id: row.id,
      startedAt: row.startedAt,
      state:
        status === "QUEUED" || status === "WAITING_FOR_DEPLOY" || status === "DELAYED"
          ? "queued"
          : status === "EXECUTING" || status === "REATTEMPTING"
            ? "running"
            : // Finished, failed, cancelled or expired, yet the row is open —
              // so the task died without closing it. Worth saying plainly.
              "gone",
    }
  } catch {
    return { id: row.id, startedAt: row.startedAt, state: "unknown" }
  }
}
