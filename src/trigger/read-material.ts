import { task, tasks } from "@trigger.dev/sdk"
import { and, asc, eq, isNull, or } from "drizzle-orm"
import { db } from "../db"
import { materialPages, materials } from "../db/schema"
import { txdb } from "../db/tx"
import { readPage, recogniser } from "../server/ocr"
import { getObject } from "../server/r2/client"
import type { enrichMaterial } from "./enrich-material"

/**
 * Pipeline stage 4 — reading the pages a PDF did not carry text for.
 *
 * **This was the largest hole in the archive.** `ingestPdf` takes a PDF's
 * embedded text layer and stops, so a photographed document added from the
 * dashboard arrived with *no* searchable text and stayed that way until someone
 * ran `pnpm ocr:local` on a Mac. For an archive whose whole purpose is being
 * findable, a material nobody can search for is barely in it.
 *
 * It reads the page images out of R2 rather than the PDF: `renderPages` has
 * already turned each page into a WebP at reading width, so re-rendering to feed
 * a recogniser would be doing the expensive half of ingest twice.
 *
 * Pages only, one at a time, sequentially. A material here averages 1.68 pages,
 * so there is nothing to gain from parallelism, and tesseract holds a single
 * worker whose whole point is being reused.
 *
 * A page that fails is left unread and the rest continue. `ocr_engine` stays
 * `none` for it, which is exactly what `pnpm ocr:status` reports and what a
 * later `ocr:local` picks up — the queue is the recovery mechanism and it costs
 * nothing to fall back into.
 */

export type ReadMaterialPayload = {
  materialId: string
  /** Re-read pages an engine has already done, not just the untouched ones. */
  force?: boolean
}

export const readMaterial = task({
  id: "read-material",
  maxDuration: 600,
  run: async ({ materialId, force = false }: ReadMaterialPayload) => {
    const pages = await db
      .select({
        id: materialPages.id,
        pageNumber: materialPages.pageNumber,
        key: materialPages.r2KeyWebp,
        // Passed to the recogniser: tesseract does not report the image size,
        // and without it every box normalises to nothing.
        width: materialPages.width,
        height: materialPages.height,
      })
      .from(materialPages)
      .where(
        force
          ? eq(materialPages.materialId, materialId)
          : and(
              eq(materialPages.materialId, materialId),
              /**
               * Untouched pages only. `text_layer` pages came from the PDF
               * itself — that text is exact and free, and no recogniser will
               * improve on it. `ocr:local --force` excludes them for the same
               * reason.
               */
              eq(materialPages.ocrEngine, "none"),
              or(isNull(materialPages.text), eq(materialPages.text, "")),
            ),
      )
      .orderBy(asc(materialPages.pageNumber))

    const readable = pages.filter((p): p is typeof p & { key: string } => Boolean(p.key))

    if (readable.length === 0) {
      // Nothing to read is the common case: most of this archive is
      // born-digital and arrived with its own text. Still hand on, because
      // stages 5 and 6 have not run yet.
      await tasks.trigger<typeof enrichMaterial>("enrich-material", {
        materialId,
        reason: "ingest",
      })
      return { materialId, read: 0, failed: 0, engine: null, skipped: pages.length }
    }

    const engine = recogniser()
    let read = 0
    let failed = 0
    let worst = 1

    for (const page of readable) {
      try {
        const image = await getObject(page.key)
        const result = await readPage(
          image,
          engine,
          page.width && page.height ? { width: page.width, height: page.height } : undefined,
        )
        worst = Math.min(worst, result.surviving)

        await txdb
          .update(materialPages)
          .set({
            text: result.text || null,
            ocrEngine: result.engine,
            ocrQuality: result.quality,
          })
          .where(eq(materialPages.id, page.id))

        if (result.text.length > 0) read++
      } catch (error) {
        failed++
        // Named, and the run continues. One unreadable page must not cost a
        // material the pages either side of it, and leaving it `none` is what
        // puts it back in the re-read queue.
        console.error(
          `page ${page.pageNumber} of ${materialId} could not be read:`,
          error instanceof Error ? error.message : error,
        )
      }
    }

    if (read > 0) {
      await txdb
        .update(materials)
        .set({ ocrEngine: engine.name, updatedAt: new Date() })
        .where(eq(materials.id, materialId))
    }

    /**
     * Stages 5 and 6 come after this, not before. Embedding text that has not
     * been read yet stores a vector of nothing, and the duplicate scan's meaning
     * signal would then be comparing two vectors of nothing and finding them
     * identical.
     */
    await tasks.trigger<typeof enrichMaterial>("enrich-material", {
      materialId,
      reason: "reread",
    })

    return {
      materialId,
      read,
      failed,
      engine: engine.name,
      skipped: pages.length - readable.length,
      /** Below ~0.6 the page was probably a photograph rather than print. */
      leastSurviving: Number(worst.toFixed(3)),
    }
  },
})
