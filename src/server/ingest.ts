import { createHash } from "node:crypto"
import { and, eq, isNull, ne } from "drizzle-orm"
import { db } from "../db"
import { materialPages, materials } from "../db/schema"
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
 *
 * **The row already exists when this runs.** `uploads.ts` creates it as `staged`
 * the moment the bytes land (pipeline stage 1), and this adopts it. It used to
 * be created here, which meant a material did not exist at all until a worker
 * picked up the run — so an upload to a project with no running worker showed
 * the admin a success message and then nothing, anywhere, for ever.
 *
 * The consequence for the failure paths is the point of the change: a duplicate
 * or an unreadable file **marks the row `rejected` with a reason in the trail**
 * instead of vanishing. Re-uploading a file the archive already holds now says
 * so on the material's own row, where before it said nothing at all.
 */

export type IngestSource = "admin_upload" | "url_import" | "drive_sync" | "public_submission"

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

/**
 * Mark a staged row as refused, and say why in the trail.
 *
 * The reason is written as an audit entry rather than a column, so it shows up
 * in the materials list's "Last change" without a migration — and because *why
 * a material was refused* is exactly the kind of thing the trail exists for.
 */
async function reject(
  materialId: string,
  actorId: string | null,
  why: string,
  duplicateOf?: string,
) {
  await txdb.transaction(async (tx) => {
    await tx
      .update(materials)
      .set({
        status: "rejected",
        duplicateOfId: duplicateOf ?? null,
        updatedAt: new Date(),
      })
      .where(eq(materials.id, materialId))

    await audit(tx, {
      action: "material.update",
      entityType: "material",
      entityId: materialId,
      after: { rejected: why },
      actorId,
    })
  })
}

export async function ingestPdf({
  materialId: staged,
  bytes,
  title,
  author,
  actorId,
  driveFileId,
  driveMd5,
}: {
  /**
   * The `staged` row this file already has. Adopted rather than re-created —
   * the person who uploaded it is already looking at it in the list.
   */
  materialId: string
  bytes: Uint8Array
  title: string
  /**
   * Optional, and unknown for most of this archive. Whoever adds a material is
   * the person most likely to know, so it is asked for at the door rather than
   * only on the edit screen — but an empty answer is a real one.
   */
  author?: string
  /**
   * Who did this, or **null** for a public submission — which genuinely has no
   * account behind it. `audit_log.actor_id` is nullable, and writing one of our
   * own accounts in would be a false record of who acted.
   */
  actorId: string | null
  /**
   * Drive's own identity for the file, when it came from the inbox.
   *
   * Stored so a second sync recognises it and a file *edited* in Drive can be
   * told apart from a new one — Drive changes `md5Checksum` on an edit while the
   * id stays put. Without these a re-sync would re-import the whole folder and
   * be caught only by the SHA-256 index, as 24 crashes rather than 24
   * skips — which is exactly how the backfill ended.
   */
  driveFileId?: string
  driveMd5?: string
}): Promise<IngestResult> {
  const clean = title.trim()
  if (clean.length < 2) {
    const error = "Give it a title of at least two characters."
    await reject(staged, actorId, error)
    return { ok: false, reason: "invalid", error }
  }

  // Judged by the file's own header, never its name. §6.
  if (!looksLikePdf(bytes)) {
    const error = "That file is not a PDF."
    await reject(staged, actorId, error)
    return { ok: false, reason: "invalid", error }
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
    .where(
      and(
        eq(materials.sha256, sha256),
        isNull(materials.archivedAt),
        // Not itself. This row is staged and has no checksum yet, but being
        // explicit costs nothing and a self-match would be baffling.
        ne(materials.id, staged),
      ),
    )
    .limit(1)

  if (existing) {
    const error = `The archive already has this exact file, as “${existing.title}”.`
    await reject(staged, actorId, error, existing.id)
    return { ok: false, reason: "duplicate", error, existingId: existing.id }
  }

  // Slugs are unique among live rows only, so archived materials are not
  // competing for the name. Two materials genuinely share a title here.
  const live = await db
    .select({ slug: materials.slug })
    .from(materials)
    .where(isNull(materials.archivedAt))
  const slug = uniqueSlug(clean, new Set(live.map((row) => row.slug)))

  const materialId = staged

  await txdb.transaction(async (tx) => {
    await tx
      .update(materials)
      .set({
        slug,
        title: clean,
        // Empty becomes null, not "". An empty string is a value that passes
        // every "is it set?" check and then reads as a blank byline, and it
        // would split the author list into "unattributed" and "attributed to
        // nothing".
        author: author?.trim() || null,
        status: "processing",
        sha256,
        byteSize: bytes.length,
        driveFileId: driveFileId ?? null,
        driveMd5: driveMd5 ?? null,
        driveCheckedAt: driveFileId ? new Date() : null,
        updatedAt: new Date(),
      })
      .where(eq(materials.id, materialId))

    await audit(tx, {
      action: "material.update",
      entityType: "material",
      entityId: materialId,
      after: { name: clean, stage: "reading the file" },
      actorId,
    })
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
