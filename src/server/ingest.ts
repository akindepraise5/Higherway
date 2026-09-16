import { createHash } from "node:crypto"
import { and, eq, inArray, isNull } from "drizzle-orm"
import { db } from "../db"
import { categories, materialCategories, materialPages, materials } from "../db/schema"
import { txdb } from "../db/tx"
import { looksLikePdf } from "../lib/import/url-guard"
import {
  extractText,
  hasUsableText,
  pageCount,
  renderPages,
  renderThumbnail,
} from "../lib/pdf/render"
import { contentDisposition, pageKey, pdfKey, thumbKey } from "../lib/r2/keys"
import { uniqueSlug } from "../lib/slug"
import { scoreText } from "../lib/text/quality"
import { audit } from "./audit"
import { putObject } from "./r2/client"

/**
 * Bringing a PDF into the archive.
 *
 * One path for every source (ARCHITECTURE.md §6). `scripts/backfill.ts` walks
 * the same stages for the Drive import; this is the same sequence for material
 * arriving through the dashboard, so an uploaded file and an imported one end
 * up indistinguishable from a backfilled one.
 *
 * **Why this is not one transaction.** Uploading to R2 and rendering pages take
 * seconds, sometimes tens of seconds for a 13 MB photograph. `src/db/tx.ts`
 * holds a pool of three connections, so a transaction spanning that work would
 * block every other mutation in the app behind a file upload. Instead: a short
 * transaction to claim the row, the slow work outside it, then a short
 * transaction to finish. Each writes its own audit entry.
 *
 * If the slow middle fails, the row is left as `processing` rather than being
 * deleted. A visible half-finished material is recoverable; a silently removed
 * one, with its bytes already in R2, is litter nobody knows to look for.
 */

export type IngestSource = "admin_upload" | "url_import"

/**
 * Why an ingest failed, because the answer decides whether retrying helps.
 *
 * `invalid` and `duplicate` are terminal — the same bytes will be just as
 * duplicate on a third attempt. Only `processing` is worth trying again.
 */
export type IngestFailure = "invalid" | "duplicate" | "processing"

export type IngestResult =
  | { ok: true; materialId: string; slug: string; pages: number; needsOcr: boolean }
  | { ok: false; reason: IngestFailure; error: string; existingId?: string }

export async function ingestPdf({
  bytes,
  title,
  author,
  source,
  actorId,
  sourceUrl,
  categoryIds = [],
}: {
  bytes: Uint8Array
  title: string
  /**
   * Optional, and unknown for most of this archive. Whoever adds a material is
   * the person most likely to know, so it is asked for at the door rather than
   * only on the edit screen — but an empty answer is a real one.
   */
  author?: string
  source: IngestSource
  actorId: string
  /** Recorded in the trail so an imported material can be traced to its link. */
  sourceUrl?: string
  /**
   * Topics chosen when the material was added. Empty is a real answer, not a
   * missing one: "Uncategorised" is the absence of rows here, and 367 of the
   * imported materials are in exactly that state.
   */
  categoryIds?: string[]
}): Promise<IngestResult> {
  const clean = title.trim()
  if (clean.length < 2) {
    return {
      ok: false,
      reason: "invalid",
      error: "Give it a title of at least two characters.",
    }
  }

  // Judged by the file's own header, never its name. §6.
  if (!looksLikePdf(bytes)) {
    return { ok: false, reason: "invalid", error: "That file is not a PDF." }
  }

  const sha256 = createHash("sha256").update(bytes).digest("hex")

  /**
   * §6 stage 2: an exact match stops here and reports the existing material.
   * The unique index would also catch this, but as a constraint violation —
   * which tells the person nothing about *which* material they already have.
   */
  const [existing] = await db
    .select({ id: materials.id, title: materials.title })
    .from(materials)
    .where(and(eq(materials.sha256, sha256), isNull(materials.archivedAt)))
    .limit(1)

  if (existing) {
    return {
      ok: false,
      reason: "duplicate",
      error: `The archive already has this exact file, as “${existing.title}”.`,
      existingId: existing.id,
    }
  }

  // Slugs are unique among live rows only, so archived materials are not
  // competing for the name. Two materials genuinely share a title here.
  const live = await db
    .select({ slug: materials.slug })
    .from(materials)
    .where(isNull(materials.archivedAt))
  const slug = uniqueSlug(clean, new Set(live.map((row) => row.slug)))

  const materialId = await txdb.transaction(async (tx) => {
    const [row] = await tx
      .insert(materials)
      .values({
        slug,
        title: clean,
        // Empty becomes null, not "". An empty string is a value that passes
        // every "is it set?" check and then reads as a blank byline, and it
        // would split the author list into "unattributed" and "attributed to
        // nothing".
        author: author?.trim() || null,
        status: "processing",
        source,
        sha256,
        byteSize: bytes.length,
      })
      .returning({ id: materials.id })

    if (!row) throw new Error("The material row was not created")

    await audit(tx, {
      action: "material.create",
      entityType: "material",
      entityId: row.id,
      after: { name: clean, source, sourceUrl },
      actorId,
    })

    if (categoryIds.length > 0) {
      // Read the names back so the trail can say *which* topic. Filing is
      // recorded one entry per topic, exactly as it is when done by hand, so
      // "Added to Faith" reads the same however the material arrived.
      const named = await tx
        .select({ id: categories.id, name: categories.name })
        .from(categories)
        .where(inArray(categories.id, categoryIds))

      if (named.length > 0) {
        await tx.insert(materialCategories).values(
          named.map((topic, ordinal) => ({
            materialId: row.id,
            categoryId: topic.id,
            // The first topic decides the cover's colours, so the order the
            // person chose them in is worth keeping.
            ordinal,
            assignedBy: actorId,
          })),
        )

        for (const topic of named) {
          await audit(tx, {
            action: "material.categorise",
            entityType: "material",
            entityId: row.id,
            after: { topic: topic.name },
            actorId,
          })
        }
      }
    }

    return row.id
  })

  try {
    const buffer = Buffer.from(bytes)

    // The download name has to travel with the object: a cross-origin download
    // ignores HTML's `download` attribute.
    await putObject(pdfKey(materialId), buffer, "application/pdf", contentDisposition(clean))

    const rendered = await renderPages(bytes)
    for (const page of rendered) {
      await putObject(pageKey(materialId, page.pageNumber), page.webp, "image/webp")
    }

    const thumb = await renderThumbnail(bytes)
    if (thumb) await putObject(thumbKey(materialId), thumb, "image/webp")

    // Free and exact when the PDF carries its own text; otherwise OCR (§7)
    // picks it up later from the re-read queue.
    const embedded = await extractText(bytes)
    const usable = hasUsableText(embedded)
    const count = await pageCount(bytes)

    await txdb.transaction(async (tx) => {
      await tx.insert(materialPages).values(
        rendered.map((page) => {
          const text = usable
            ? (embedded.find((t) => t.pageNumber === page.pageNumber)?.text ?? "")
            : ""
          return {
            materialId,
            pageNumber: page.pageNumber,
            r2KeyWebp: pageKey(materialId, page.pageNumber),
            width: page.width,
            height: page.height,
            text: text || null,
            ocrEngine: (usable ? "text_layer" : "none") as "text_layer" | "none",
            ocrQuality: text ? scoreText(text).score : null,
          }
        }),
      )

      await tx
        .update(materials)
        .set({
          // Not published. The v1 archive went straight out because it had
          // already been published in print for years; something arriving now
          // has not been seen by anyone yet.
          status: "review",
          r2KeyPdf: pdfKey(materialId),
          pageCount: count,
          ocrEngine: usable ? "text_layer" : "none",
          updatedAt: new Date(),
        })
        .where(eq(materials.id, materialId))

      await audit(tx, {
        action: "material.update",
        entityType: "material",
        entityId: materialId,
        after: {
          name: clean,
          pages: rendered.length,
          text: usable ? "from the file" : "awaiting OCR",
        },
        actorId,
      })
    })

    return {
      ok: true,
      materialId,
      slug,
      pages: rendered.length,
      needsOcr: !usable,
    }
  } catch (error) {
    // Left as `processing` on purpose — see the note at the top of this file.
    return {
      ok: false,
      reason: "processing",
      error: `The file was accepted but could not be processed: ${
        error instanceof Error ? error.message : "unknown error"
      }`,
      existingId: materialId,
    }
  }
}
