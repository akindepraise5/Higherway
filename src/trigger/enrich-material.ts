import { task } from "@trigger.dev/sdk"
import { scanMaterial } from "../server/duplicates/scan"
import { embedMaterial } from "../server/embed/store"

/**
 * Pipeline stages 5 and 6, after a material has been rendered and read.
 *
 * **A task of its own, not more of `process-material`.** ARCHITECTURE.md §6 is
 * explicit that each stage is separate so a failure can be retried without
 * redoing the rest, and here that earns its keep twice over. Embedding loads a
 * 33 MB model, so keeping it out of the ingest task means a plain upload never
 * waits on a model download. And an embedding that fails is not a reason to
 * render a 13 MB photograph a second time.
 *
 * The order matters. The duplicate scan reads the document vectors this writes,
 * so scanning first would score every new material's meaning signal as 0 —
 * which is precisely the bug this whole change exists to fix.
 *
 * Failing here leaves a perfectly good material in the archive with no vectors
 * and no duplicate check. That is the right failure: it is visible, `pnpm embed`
 * picks it up, and the alternative is refusing a material the archive can read
 * because a secondary index could not be built.
 */

export type EnrichMaterialPayload = {
  materialId: string
  /** Set after an OCR pass rewrote the text, so old chunks must be replaced. */
  reason?: "ingest" | "reread"
}

export const enrichMaterial = task({
  id: "enrich-material",
  maxDuration: 600,
  run: async ({ materialId, reason = "ingest" }: EnrichMaterialPayload) => {
    const embedded = await embedMaterial(materialId)

    /**
     * No text yet — a photographed PDF waiting on a recogniser. The scan still
     * runs, because titles are a real signal and an uploaded duplicate is worth
     * catching before someone spends time on it, but there is nothing to embed
     * and saying so is more useful than a silent zero.
     */
    const scanned = await scanMaterial(materialId)

    return {
      materialId,
      reason,
      chunks: embedded.chunks,
      embedded: embedded.embedded,
      duplicatesRaised: scanned.raised,
      duplicatesRescored: scanned.rescored,
      comparedAgainst: scanned.compared,
      strongest: scanned.strongest,
    }
  },
})
