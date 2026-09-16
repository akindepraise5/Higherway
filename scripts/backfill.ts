/**
 * Move the archive from Drive into R2, and process it. Run after
 * `pnpm import:sheet`:
 *
 *   pnpm backfill              every staged material
 *   pnpm backfill --limit 5    a handful first, to see it work
 *   pnpm backfill --force      redo materials already done
 *
 * For each material: download from Drive, store the original in R2, render
 * every page to WebP, take the embedded text if the PDF has any, and publish.
 *
 * Safe to stop and restart. Work already done is detected in R2 and skipped,
 * so an interrupted run resumes rather than starting over.
 *
 * OCR is deliberately *not* done here. Pages without embedded text are left
 * for `pnpm ocr:local`, which reads them with macOS Vision at ~0.73s a page —
 * roughly 13 minutes for the whole archive, free, and the best quality of
 * anything measured. ARCHITECTURE.md §7.
 */

import { createHash } from "node:crypto"
import { eq, inArray } from "drizzle-orm"
import { db } from "../src/db"
import { materialPages, materials } from "../src/db/schema"
import {
  extractText,
  hasUsableText,
  pageCount,
  renderPages,
  renderThumbnail,
} from "../src/lib/pdf/render"
import { pageKey, pdfKey, thumbKey } from "../src/lib/r2/keys"
import { scoreText } from "../src/lib/text/quality"
import { objectExists, putObject } from "../src/server/r2/client"

const args = process.argv.slice(2)
const limit = Number(args[args.indexOf("--limit") + 1]) || Infinity
const force = args.includes("--force")

const driveUrl = (id: string) => `https://drive.google.com/uc?export=download&id=${id}`

async function download(driveFileId: string): Promise<Uint8Array> {
  const res = await fetch(driveUrl(driveFileId), { redirect: "follow" })
  if (!res.ok) throw new Error(`Drive returned ${res.status}`)

  const bytes = new Uint8Array(await res.arrayBuffer())

  // Google serves an HTML interstitial instead of the file when a link is not
  // actually public. Catch it here rather than storing a web page as a PDF.
  if (bytes.length < 5 || String.fromCharCode(...bytes.slice(0, 4)) !== "%PDF") {
    throw new Error("Not a PDF — Drive may have returned a sign-in page")
  }
  return bytes
}

async function processOne(material: { id: string; title: string; driveFileId: string | null }) {
  if (!material.driveFileId) throw new Error("No Drive file id")

  if (!force && (await objectExists(pdfKey(material.id)))) {
    return { status: "skipped" as const, pages: 0 }
  }

  const bytes = await download(material.driveFileId)
  const sha256 = createHash("sha256").update(bytes).digest("hex")

  await putObject(pdfKey(material.id), Buffer.from(bytes), "application/pdf")

  const pages = await renderPages(bytes)
  for (const page of pages) {
    await putObject(pageKey(material.id, page.pageNumber), page.webp, "image/webp")
  }

  const thumb = await renderThumbnail(bytes)
  if (thumb) await putObject(thumbKey(material.id), thumb, "image/webp")

  // Free and perfect when the PDF already has text; otherwise left for OCR.
  const embedded = await extractText(bytes)
  const usable = hasUsableText(embedded)

  await db.delete(materialPages).where(eq(materialPages.materialId, material.id))
  await db.insert(materialPages).values(
    pages.map((page) => {
      const text = usable
        ? (embedded.find((t) => t.pageNumber === page.pageNumber)?.text ?? "")
        : ""
      return {
        materialId: material.id,
        pageNumber: page.pageNumber,
        r2KeyWebp: pageKey(material.id, page.pageNumber),
        width: page.width,
        height: page.height,
        text: text || null,
        ocrEngine: (usable ? "text_layer" : "none") as "text_layer" | "none",
        ocrQuality: text ? scoreText(text).score : null,
      }
    }),
  )

  await db
    .update(materials)
    .set({
      status: "published",
      publishedAt: new Date(),
      updatedAt: new Date(),
      r2KeyPdf: pdfKey(material.id),
      byteSize: bytes.length,
      pageCount: await pageCount(bytes),
      sha256,
      ocrEngine: usable ? "text_layer" : "none",
      driveCheckedAt: new Date(),
    })
    .where(eq(materials.id, material.id))

  return { status: usable ? ("text" as const) : ("needs-ocr" as const), pages: pages.length }
}

async function main() {
  const pending = await db
    .select({ id: materials.id, title: materials.title, driveFileId: materials.driveFileId })
    .from(materials)
    .where(inArray(materials.status, force ? ["staged", "published"] : ["staged"]))

  const queue = pending.slice(0, limit === Infinity ? undefined : limit)
  console.log(`${queue.length} materials to process\n`)

  const tally = { text: 0, "needs-ocr": 0, skipped: 0, failed: 0 }
  const failures: string[] = []

  for (const [i, material] of queue.entries()) {
    const label = `[${i + 1}/${queue.length}] ${material.title.slice(0, 52)}`
    try {
      const result = await processOne(material)
      tally[result.status]++
      console.log(`${label} — ${result.status}, ${result.pages} pages`)
    } catch (error) {
      tally.failed++
      const message = error instanceof Error ? error.message : String(error)
      failures.push(`${material.title}: ${message}`)
      console.error(`${label} — FAILED: ${message}`)
    }
  }

  console.log(`
Done.
  had text    ${tally.text}       (free, no OCR needed)
  need OCR    ${tally["needs-ocr"]}
  skipped     ${tally.skipped}    (already in R2 — use --force to redo)
  failed      ${tally.failed}`)

  if (failures.length > 0) {
    console.log(`\nFailures:\n${failures.map((f) => `  ${f}`).join("\n")}`)
  }
  if (tally["needs-ocr"] > 0) {
    console.log(
      `\nNext: pnpm ocr:local — reads the ${tally["needs-ocr"]} without text, on this Mac.`,
    )
  }
}

main().catch((error) => {
  console.error("\nBackfill failed:", error instanceof Error ? error.message : error)
  process.exit(1)
})
