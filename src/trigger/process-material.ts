import { task, tasks } from "@trigger.dev/sdk"
import { type IngestSource, ingestPdf } from "../server/ingest"
import { getObject } from "../server/r2/client"
import type { enrichMaterial } from "./enrich-material"

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
 * It hands off to `enrich-material` for stages 5 and 6 rather than doing them
 * here. That keeps the 33 MB embedding model out of the path a plain upload
 * waits on, and means a failed duplicate scan never costs a second render of a
 * 13 MB photograph.
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
     * Stages 5 and 6, once the material exists and its pages are readable.
     *
     * Triggered rather than awaited: the upload is finished from the person's
     * point of view, and holding this run open while a model downloads would
     * only make an already-successful ingest look slow. A failure there retries
     * on its own and does not undo this.
     *
     * Only on success. A duplicate or an invalid file has no material row to
     * enrich — `existingId` on a duplicate points at the material it copies,
     * which is already embedded and must not be scanned against itself.
     */
    if (result.ok) {
      await tasks.trigger<typeof enrichMaterial>("enrich-material", {
        materialId: result.materialId,
        reason: "ingest",
      })
    }

    return result
  },
})
