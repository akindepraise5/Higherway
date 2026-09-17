import { task, tasks } from "@trigger.dev/sdk"
import { type IngestSource, ingestPdf } from "../server/ingest"
import { getObject } from "../server/r2/client"
import type { readMaterial } from "./read-material"

/**
 * Turning a staged upload into a material.
 *
 * The browser uploads straight to R2, so the bytes have never been near the
 * app; this fetches them and walks the ingestion pipeline (ARCHITECTURE.md §6).
 * It runs off Vercel precisely because rendering a 13 MB photograph should not
 * be racing a function timeout.
 *
 * Nothing in here is imported by the Next.js app. The app triggers it by id
 * with a type-only import, so mupdf and sharp never reach the web bundle.
 *
 * It hands off rather than continuing: `read-material` for stage 4 and then
 * `enrich-material` for 5 and 6. That keeps a recogniser and a 33 MB embedding
 * model out of the path a plain upload waits on, and means a failure in either
 * never costs a second render of a 13 MB photograph.
 */

export type ProcessMaterialPayload = {
  /** Where the browser put the file — `staging/<uploadId>.pdf`. */
  stagingKey: string
  title: string
  /** Optional, and usually unknown for a scan. Empty means "not recorded". */
  author?: string
  source: IngestSource
  /** Who uploaded it, so the audit trail names a person and not a job. */
  actorId: string
  sourceUrl?: string
  /** Drive's own identity, when the material came from the inbox. */
  driveFileId?: string
  driveMd5?: string
  /** Topics picked when it was added. Empty means Uncategorised. */
  categoryIds?: string[]
}

export const processMaterial = task({
  id: "process-material",
  maxDuration: 600,
  run: async (payload: ProcessMaterialPayload) => {
    const bytes = await getObject(payload.stagingKey)

    const result = await ingestPdf({
      bytes,
      title: payload.title,
      author: payload.author,
      source: payload.source,
      actorId: payload.actorId,
      sourceUrl: payload.sourceUrl,
      driveFileId: payload.driveFileId,
      driveMd5: payload.driveMd5,
      categoryIds: payload.categoryIds,
    })

    /**
     * Only genuine processing failures are thrown, because throwing is what
     * asks for a retry. A duplicate or a file that is not a PDF will be exactly
     * as duplicate on the third attempt — retrying those would burn the run
     * budget and bury the real answer under three identical failures.
     */
    if (!result.ok && result.reason === "processing") {
      throw new Error(result.error)
    }

    /**
     * Stage 4 onwards, once the material exists and its pages are rendered.
     *
     * `read-material` runs whether or not there is anything to read, and hands
     * on to `enrich-material` itself. Chained rather than both triggered from
     * here, because the order is a real dependency: embedding text that has not
     * been recognised yet stores a vector of nothing.
     *
     * Triggered rather than awaited. The upload is finished from the person's
     * point of view, and holding this run open through a recogniser and a model
     * download would only make an already-successful ingest look slow.
     *
     * Only on success. A duplicate or an invalid file has no material row to
     * read — `existingId` on a duplicate points at the material it copies, which
     * already has its text and must not be scanned against itself.
     */
    if (result.ok) {
      await tasks.trigger<typeof readMaterial>("read-material", {
        materialId: result.materialId,
      })
    }

    return result
  },
})
