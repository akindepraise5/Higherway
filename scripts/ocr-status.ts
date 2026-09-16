/**
 * What still has no text, and why. Read-only — it changes nothing.
 *
 *   pnpm ocr:status
 *
 * The point of it is that `ocr:local` only tells you what is outstanding by
 * running, which needs a Mac and twenty minutes. This answers the same question
 * from anywhere in a second, so someone can decide whether a re-read is even
 * worth starting, and see at a glance whether a material added from the
 * dashboard is still waiting for a recogniser that only runs locally.
 *
 * Until server-side OCR exists (ARCHITECTURE.md §7), a photographed upload
 * arrives with no searchable text at all. This is how you find those.
 */

import { sql } from "drizzle-orm"
import { db } from "../src/db"

/** neon-http returns a result object; other drivers return the array itself. */
async function rows<T>(query: Promise<unknown>): Promise<T[]> {
  const out = (await query) as { rows?: T[] } | T[]
  return Array.isArray(out) ? out : (out.rows ?? [])
}

async function main() {
  const [totals] = await rows<{
    pages: number
    vision: number
    text_layer: number
    none: number
    unreadable: number
    poor: number
  }>(
    db.execute(sql`
    select
      count(*)::int as pages,
      count(*) filter (where ocr_engine = 'vision')::int as vision,
      count(*) filter (where ocr_engine = 'text_layer')::int as text_layer,
      count(*) filter (where ocr_engine = 'none')::int as none,
      -- No page image means no recogniser can ever read it: the render failed
      -- or never ran, so this is a rendering problem wearing an OCR costume.
      count(*) filter (where ocr_engine = 'none' and r2_key_webp is null)::int as unreadable,
      count(*) filter (where ocr_quality is not null and ocr_quality < 0.5)::int as poor
    from material_pages`),
  )

  const read = totals.vision + totals.text_layer
  const pct = ((read / Math.max(totals.pages, 1)) * 100).toFixed(1)

  console.log(`\n${read} of ${totals.pages} pages have text (${pct}%)`)
  console.log(`  ${totals.text_layer}  taken from the PDF itself — exact, free, never re-read`)
  console.log(`  ${totals.vision}  read by macOS Vision`)
  console.log(`  ${totals.poor}  scored below 0.5 — worth a look in the admin panel\n`)

  const queue = totals.none - totals.unreadable
  if (queue > 0) {
    console.log(`${queue} pages are waiting for a recogniser.`)
    console.log("  Run `pnpm ocr:local` on a Mac to read them.\n")
  } else {
    console.log("Nothing is waiting for a recogniser.\n")
  }

  if (totals.unreadable > 0) {
    console.log(`${totals.unreadable} pages have no page image, so OCR cannot help them.`)
    console.log("  These need re-rendering, not re-reading:\n")

    const stuck = await rows<{ title: string; slug: string; pages: number }>(
      db.execute(sql`
      select m.title, m.slug, count(*)::int as pages
      from material_pages p
      join materials m on m.id = p.material_id
      where p.ocr_engine = 'none' and p.r2_key_webp is null
      group by m.title, m.slug
      order by 3 desc, 1`),
    )

    for (const s of stuck) {
      console.log(`    ${String(s.pages).padStart(3)} page(s)  ${s.title}  (/m/${s.slug})`)
    }
    console.log()
  }

  // A material with no page rows at all never finished ingesting — it is a
  // different failure from a page that was rendered but never read.
  const empty = await rows<{ title: string; slug: string; status: string }>(
    db.execute(sql`
    select m.title, m.slug, m.status
    from materials m
    left join material_pages p on p.material_id = m.id
    where m.archived_at is null
    group by m.id, m.title, m.slug, m.status
    having count(p.id) = 0
    order by m.title`),
  )

  if (empty.length > 0) {
    console.log(`${empty.length} live materials have no pages at all — ingest never finished:\n`)
    for (const e of empty) console.log(`    ${e.status.padEnd(10)}  ${e.title}  (/m/${e.slug})`)
    console.log()
  }
}

main().catch((error) => {
  console.error("\nCould not read OCR status:", error instanceof Error ? error.message : error)
  process.exit(1)
})
