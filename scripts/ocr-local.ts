/**
 * Read the pages that have no text yet, using macOS Vision. Run on a Mac:
 *
 *   pnpm ocr:local                 everything waiting
 *   pnpm ocr:local --limit 20      a few first
 *   pnpm ocr:local --redo          re-read pages an engine already did
 *
 * This is the quality step of the OCR chain (ARCHITECTURE.md §7). The backfill
 * takes embedded text where a PDF has it — free and perfect — and leaves the
 * rest here. Vision reads them at ~0.73s a page at 97-99%, which is better and
 * faster than anything else measured, and costs nothing.
 *
 * It is macOS-only, which is why it is a script rather than part of the server
 * pipeline: new uploads are read by Google Cloud Vision or tesseract.js on the
 * server, and this upgrades them whenever someone runs it.
 *
 * Safe to stop and restart — a page is only claimed once its text is stored.
 */

import { execFileSync, spawnSync } from "node:child_process"
import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { GetObjectCommand } from "@aws-sdk/client-s3"
import { and, eq, isNull, or, sql } from "drizzle-orm"
import { db } from "../src/db"
import { materialPages } from "../src/db/schema"
import { scoreText } from "../src/lib/text/quality"
import { bucket, r2 } from "../src/server/r2/client"

const args = process.argv.slice(2)
const limit = Number(args[args.indexOf("--limit") + 1]) || Infinity
const redo = args.includes("--redo")
const BATCH = 8

const HERE = new URL(".", import.meta.url).pathname
const SWIFT_SOURCE = join(HERE, "vision-ocr.swift")

/** Compile once. The interpreter costs ~55s of startup; the binary does not. */
function buildRecogniser(dir: string): string {
  const binary = join(dir, "vision-ocr")
  console.log("Compiling the Vision helper…")
  execFileSync("swiftc", ["-O", "-o", binary, SWIFT_SOURCE], { stdio: "inherit" })
  return binary
}

type PageRow = { id: string; materialId: string; pageNumber: number; r2KeyWebp: string | null }

async function fetchPage(key: string, to: string) {
  const res = await r2().send(new GetObjectCommand({ Bucket: bucket(), Key: key }))
  const bytes = await res.Body?.transformToByteArray()
  if (!bytes) throw new Error(`empty object: ${key}`)
  writeFileSync(to, Buffer.from(bytes))
}

async function main() {
  if (process.platform !== "darwin") {
    console.error("This reads pages with macOS Vision, so it only runs on a Mac.")
    console.error("On other machines the server pipeline handles OCR instead.")
    process.exit(1)
  }

  const waiting = await db
    .select({
      id: materialPages.id,
      materialId: materialPages.materialId,
      pageNumber: materialPages.pageNumber,
      r2KeyWebp: materialPages.r2KeyWebp,
    })
    .from(materialPages)
    .where(
      redo
        ? sql`${materialPages.ocrEngine} <> 'vision' and ${materialPages.r2KeyWebp} is not null`
        : and(
            or(isNull(materialPages.text), eq(materialPages.ocrEngine, "none")),
            sql`${materialPages.r2KeyWebp} is not null`,
          ),
    )

  const queue = (waiting as PageRow[]).slice(0, limit === Infinity ? undefined : limit)

  if (queue.length === 0) {
    console.log("Nothing waiting — every page already has text.")
    return
  }

  console.log(`${queue.length} pages to read\n`)

  const dir = mkdtempSync(join(tmpdir(), "higherway-ocr-"))
  const recogniser = buildRecogniser(dir)
  const started = Date.now()

  let read = 0
  let poor = 0
  let failed = 0

  try {
    for (let i = 0; i < queue.length; i += BATCH) {
      const batch = queue.slice(i, i + BATCH)
      const files: { page: PageRow; file: string }[] = []

      for (const page of batch) {
        if (!page.r2KeyWebp) continue
        const file = join(dir, `${page.id}.webp`)
        try {
          await fetchPage(page.r2KeyWebp, file)
          files.push({ page, file })
        } catch (error) {
          failed++
          console.error(`  could not fetch page ${page.pageNumber}: ${String(error)}`)
        }
      }

      if (files.length === 0) continue

      const result = spawnSync(
        recogniser,
        files.map((f) => f.file),
        { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
      )

      if (result.status !== 0) {
        failed += files.length
        console.error(`  Vision failed on a batch: ${result.stderr?.slice(0, 200)}`)
        continue
      }

      const byPath = new Map<string, { text: string; confidence: number }>()
      for (const line of result.stdout.split("\n")) {
        if (!line.trim()) continue
        try {
          const parsed = JSON.parse(line)
          byPath.set(parsed.path, { text: parsed.text ?? "", confidence: parsed.confidence ?? 0 })
        } catch {
          // A malformed line loses one page, not the batch.
        }
      }

      for (const { page, file } of files) {
        const out = byPath.get(file)
        if (!out) {
          failed++
          continue
        }

        const quality = scoreText(out.text)
        if (!quality.usable) poor++

        await db
          .update(materialPages)
          .set({ text: out.text || null, ocrEngine: "vision", ocrQuality: quality.score })
          .where(eq(materialPages.id, page.id))

        rmSync(file, { force: true })
        read++
      }

      const done = Math.min(i + BATCH, queue.length)
      const rate = (Date.now() - started) / done / 1000
      console.log(`  ${done}/${queue.length} pages — ${rate.toFixed(2)}s each`)
    }

    // A material's engine reflects the best read any of its pages has had.
    await db.execute(sql`
      update materials set ocr_engine = 'vision', updated_at = now()
      where id in (
        select material_id from material_pages
        where ocr_engine = 'vision' group by material_id
      ) and ocr_engine <> 'text_layer'`)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }

  const elapsed = (Date.now() - started) / 1000

  console.log(`
Done in ${Math.round(elapsed)}s (${(elapsed / Math.max(read, 1)).toFixed(2)}s a page).
  read      ${read}
  poor      ${poor}  (scored too low to trust — worth a look in the admin panel)
  failed    ${failed}`)

  const remaining = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(materialPages)
    .where(or(isNull(materialPages.text), eq(materialPages.ocrEngine, "none")))

  console.log(`  still waiting ${remaining[0]?.n ?? 0}`)
}

main().catch((error) => {
  console.error("\nOCR failed:", error instanceof Error ? error.message : error)
  process.exit(1)
})
