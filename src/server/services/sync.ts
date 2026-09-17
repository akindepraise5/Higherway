"use server"

import { tasks } from "@trigger.dev/sdk"
import { and, desc, eq, isNull } from "drizzle-orm"
import { revalidatePath } from "next/cache"
import { syncRuns } from "../../db/schema"
import { txdb } from "../../db/tx"
import { hasDrive, hasJobs } from "../../lib/env"
import { requireRole } from "../../lib/session"
import type { syncDrive } from "../../trigger/sync-drive"
import { audit } from "../audit"

/**
 * Pulling from the Drive inbox, on purpose and by a person.
 *
 * **Owner only.** Sync adds material to a public archive without anyone having
 * looked at it first, and it is the one action here whose blast radius is the
 * whole folder. Category management was raised to Owner for a smaller reason
 * than this.
 *
 * **Manual, never scheduled.** ARCHITECTURE.md §2 settles it: a cron that pulls
 * whatever appeared overnight makes Drive an authority over the archive, and
 * Drive is an inbox. Somebody presses this, and the run is recorded against
 * their name.
 *
 * The work itself runs as a Trigger task: a folder of six hundred files is far
 * past any function timeout, and the run has to survive the browser being
 * closed.
 */

export type SyncResult = { ok: true; message: string; runId: string } | { ok: false; error: string }

export async function startSync(options?: { dryRun?: boolean }): Promise<SyncResult> {
  const { session } = await requireRole("owner")

  if (!hasDrive) {
    return {
      ok: false,
      error:
        "Drive is not connected. It needs a Google service account with read access to the folder, and the folder id.",
    }
  }
  if (!hasJobs) {
    return {
      ok: false,
      error: "Background jobs are not configured, so a sync would have nothing to process files.",
    }
  }

  /**
   * One at a time. Two runs over the same folder would both see the same file
   * as new — neither has imported it yet — and stage it twice, which the
   * SHA-256 index then rejects as a crash rather than a skip. That is precisely
   * how the backfill ended up with 27 materials stuck.
   */
  const [running] = await txdb
    .select({ id: syncRuns.id, startedAt: syncRuns.startedAt })
    .from(syncRuns)
    .where(isNull(syncRuns.finishedAt))
    .orderBy(desc(syncRuns.startedAt))
    .limit(1)

  if (running) {
    const minutes = Math.round((Date.now() - running.startedAt.getTime()) / 60_000)
    return {
      ok: false,
      error:
        minutes > 60
          ? `A sync started ${minutes} minutes ago and never finished. It has to be cleared before another can run.`
          : `A sync is already running, started ${minutes} minute${minutes === 1 ? "" : "s"} ago.`,
    }
  }

  const handle = await tasks.trigger<typeof syncDrive>("sync-drive", {
    actorId: session.user.id,
    dryRun: options?.dryRun,
  })

  /**
   * Audited here rather than inside the task. The task records *what a sync
   * found* in `sync_runs`; this records *that a person asked for one*, which is
   * the thing the audit trail exists to answer and the only part a human did.
   */
  await txdb.transaction(async (tx) => {
    await audit(tx, {
      action: "sync.run",
      entityType: "sync",
      entityId: handle.id,
      after: { dryRun: Boolean(options?.dryRun) },
      actorId: session.user.id,
    })
  })

  revalidatePath("/admin/sync")
  return {
    ok: true,
    runId: handle.id,
    message: options?.dryRun
      ? "Checking what is in the folder. Nothing will be imported."
      : "Scanning the folder. Anything new will be pulled in and read.",
  }
}

/**
 * Close a run that died without closing itself.
 *
 * A task killed outright — the machine going away, a deploy mid-run — leaves its
 * row open, and `startSync` then refuses for ever because it looks as though a
 * sync is still going. This is the way out, and it is deliberately a person's
 * decision rather than a timeout: an automatic one would sooner or later clear a
 * run that was merely slow and let a second one start beside it.
 */
export async function clearStuckSync(runId: string): Promise<SyncResult> {
  const { session } = await requireRole("owner")

  const result = await txdb.transaction(async (tx) => {
    const [row] = await tx
      .select({ id: syncRuns.id, startedAt: syncRuns.startedAt })
      .from(syncRuns)
      .where(and(eq(syncRuns.id, runId), isNull(syncRuns.finishedAt)))
      .limit(1)

    if (!row) return { ok: false as const, error: "That run has already finished." }

    await tx
      .update(syncRuns)
      .set({ finishedAt: new Date(), error: "Marked as finished by an Owner; it never reported." })
      .where(eq(syncRuns.id, runId))

    await audit(tx, {
      action: "sync.clear",
      entityType: "sync",
      entityId: runId,
      before: { startedAt: row.startedAt },
      actorId: session.user.id,
    })

    return { ok: true as const, message: "Cleared. A new sync can be started.", runId }
  })

  revalidatePath("/admin/sync")
  return result
}
