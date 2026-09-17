import { randomUUID } from "node:crypto"
import { task, tasks } from "@trigger.dev/sdk"
import { eq, isNotNull } from "drizzle-orm"
import { db } from "../db"
import { materials, syncRuns } from "../db/schema"
import { txdb } from "../db/tx"
import { env, hasDrive } from "../lib/env"
import { stagingKey } from "../lib/r2/keys"
import { titleFromFilename } from "../lib/upload/batch"
import { type DriveFile, downloadFile, listFolder } from "../server/drive/client"
import { stageMaterial } from "../server/materials/stage"
import { putObject } from "../server/r2/client"
import type { processMaterial } from "./process-material"

/**
 * Pulling new material out of the Drive inbox — Phase 6 (ARCHITECTURE.md §2).
 *
 * **One way, always.** Drive is a read-only inbox: no uploads, no renames, no
 * deletions, ever. Nothing in this file or in `server/drive/client` can write to
 * Drive, and the OAuth scope it asks for could not authorise it if it tried.
 *
 * It does not ingest anything itself. Each new file is staged in R2 and handed
 * to `process-material`, so a file arriving from Drive walks the identical
 * pipeline as one uploaded from the dashboard — rendered, read, embedded, scanned
 * for duplicates, and left waiting for a person. That is the whole reason the
 * pipeline was built with one entrance.
 *
 * **Nothing is published automatically.** ARCHITECTURE.md §6 stage 8 allows
 * Drive-sourced files to publish on their own, and that was written when Drive
 * *was* the v1 archive — material already published in print for years. A folder
 * someone drops a file into now is not that, so it goes to review like any other
 * upload. Changing that back is a one-line decision and should be a deliberate
 * one.
 *
 * Every run writes a `sync_runs` row: who, when, and what happened to each file.
 * That table has existed since Phase 1 with nothing writing to it.
 */

export type SyncDrivePayload = {
  /** The Owner who pressed the button. The run is recorded against them. */
  actorId: string
  /** Report what would happen and change nothing. */
  dryRun?: boolean
  /** Safety valve for the first run against a large folder. */
  limit?: number
}

type Outcome =
  | { file: string; driveId: string; result: "imported"; runId: string }
  | { file: string; driveId: string; result: "skipped"; why: string }
  | { file: string; driveId: string; result: "flagged"; why: string }
  | { file: string; driveId: string; result: "failed"; why: string }

/** A Drive file larger than this is refused rather than pulled. */
const MAX_BYTES = 80 * 1024 * 1024

export const syncDrive = task({
  id: "sync-drive",
  maxDuration: 3600,
  run: async ({ actorId, dryRun = false, limit }: SyncDrivePayload) => {
    if (!hasDrive || !env.GOOGLE_DRIVE_FOLDER_ID) {
      throw new Error("Drive is not configured — set the service account and the folder id.")
    }

    const [run] = await txdb
      .insert(syncRuns)
      .values({ startedBy: actorId })
      .returning({ id: syncRuns.id })
    if (!run) throw new Error("The sync run could not be recorded")

    const outcomes: Outcome[] = []

    try {
      const files = await listFolder(env.GOOGLE_DRIVE_FOLDER_ID)

      /**
       * What the archive already knows about Drive, in one query.
       *
       * Archived materials are **included on purpose**. A material archived as a
       * duplicate, or removed by an Owner, must not come straight back on the
       * next sync — that would turn a deliberate decision into a recurring
       * chore, and the 82 archived rows here are exactly such decisions.
       */
      const known = new Map<string, { id: string; md5: string | null; archived: boolean }>()
      for (const row of await db
        .select({
          id: materials.id,
          driveFileId: materials.driveFileId,
          driveMd5: materials.driveMd5,
          archivedAt: materials.archivedAt,
        })
        .from(materials)
        .where(isNotNull(materials.driveFileId))) {
        if (row.driveFileId) {
          known.set(row.driveFileId, {
            id: row.id,
            md5: row.driveMd5,
            archived: row.archivedAt !== null,
          })
        }
      }

      const fresh = files.filter((f) => !known.has(f.id))
      const queue = limit ? fresh.slice(0, limit) : fresh

      // Everything already imported, judged before anything is fetched.
      for (const file of files) {
        const seen = known.get(file.id)
        if (!seen) continue

        if (seen.archived) {
          outcomes.push({
            file: file.name,
            driveId: file.id,
            result: "skipped",
            why: "already imported and since archived — not brought back",
          })
        } else if (file.md5Checksum && seen.md5 && file.md5Checksum !== seen.md5) {
          /**
           * The file in Drive has been edited since it was imported. Held back
           * rather than re-imported: replacing a published material's bytes
           * silently is not a sync, it is an edit nobody asked for, and the
           * person who changed it in Drive may not have meant it to reach the
           * public archive at all.
           */
          outcomes.push({
            file: file.name,
            driveId: file.id,
            result: "flagged",
            why: "changed in Drive since it was imported — left alone for a person to decide",
          })
        } else {
          outcomes.push({
            file: file.name,
            driveId: file.id,
            result: "skipped",
            why: "already here",
          })
        }
      }

      if (!dryRun) {
        for (const file of queue) {
          outcomes.push(await pull(file, actorId))
        }
      } else {
        for (const file of queue) {
          outcomes.push({
            file: file.name,
            driveId: file.id,
            result: "skipped",
            why: "new — would be imported (dry run)",
          })
        }
      }

      const counts = tally(outcomes)
      await txdb
        .update(syncRuns)
        .set({ ...counts, finishedAt: new Date(), detail: outcomes })
        .where(eq(syncRuns.id, run.id))

      return { runId: run.id, inFolder: files.length, ...counts, dryRun }
    } catch (error) {
      /**
       * A run that dies must still close its own row. Left open it reads as
       * "still going" for ever, and the next press would sit behind a run that
       * ended minutes ago — the failure has to be visible on the page that
       * reports runs.
       */
      const message = error instanceof Error ? error.message : String(error)
      await txdb
        .update(syncRuns)
        .set({ ...tally(outcomes), finishedAt: new Date(), detail: outcomes, error: message })
        .where(eq(syncRuns.id, run.id))
      throw error
    }
  },
})

/** Stage one file and hand it to the pipeline. Never touches Drive twice. */
async function pull(file: DriveFile, actorId: string): Promise<Outcome> {
  try {
    if (file.size !== null && file.size > MAX_BYTES) {
      return {
        file: file.name,
        driveId: file.id,
        result: "failed",
        why: `${(file.size / 1_048_576).toFixed(0)} MB is larger than this pulls`,
      }
    }

    const bytes = await downloadFile(file.id)
    const key = stagingKey(randomUUID())
    await putObject(key, Buffer.from(bytes), "application/pdf")

    const materialId = await stageMaterial({
      actorId,
      title: titleFromFilename(file.name),
      source: "drive_sync",
      stagingKey: key,
      driveFileId: file.id,
      categoryIds: [],
    })

    const handle = await tasks.trigger<typeof processMaterial>("process-material", {
      materialId,
      stagingKey: key,
      title: titleFromFilename(file.name),
      source: "drive_sync",
      actorId,
      driveFileId: file.id,
      driveMd5: file.md5Checksum ?? undefined,
    })

    return { file: file.name, driveId: file.id, result: "imported", runId: handle.id }
  } catch (error) {
    // Per file, and the run continues. One unreadable file must not end a sync
    // over a folder of six hundred.
    return {
      file: file.name,
      driveId: file.id,
      result: "failed",
      why: error instanceof Error ? error.message : "unknown error",
    }
  }
}

function tally(outcomes: Outcome[]) {
  return {
    imported: outcomes.filter((o) => o.result === "imported").length,
    skipped: outcomes.filter((o) => o.result === "skipped").length,
    flagged: outcomes.filter((o) => o.result === "flagged").length,
    failed: outcomes.filter((o) => o.result === "failed").length,
  }
}
