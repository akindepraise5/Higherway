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

/** A run that has not reported. What stops a second one being started. */
export async function runningSync(): Promise<{ id: string; startedAt: Date } | null> {
  const [row] = await db
    .select({ id: syncRuns.id, startedAt: syncRuns.startedAt })
    .from(syncRuns)
    .where(isNull(syncRuns.finishedAt))
    .orderBy(desc(syncRuns.startedAt))
    .limit(1)

  return row ?? null
}
