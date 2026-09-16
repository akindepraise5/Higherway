/**
 * Seed the database from the v1 spreadsheet. Run once:
 *
 *   pnpm import:sheet
 *
 * This creates the records only. The files themselves are still in Drive at
 * this point — `pnpm backfill` downloads them into R2 and processes them,
 * which is what moves a material from `staged` to `published`.
 *
 * Safe to re-run. Materials are matched on their Drive file id, so a second
 * run imports only what is new and reports the rest as already present.
 *
 * After this, the sheet is retired: the admin panel becomes the only way to
 * add a material. ARCHITECTURE.md §13.
 */

import { sql } from "drizzle-orm"
import { db } from "../src/db"
import { categories, materialCategories, materials } from "../src/db/schema"
import { cleanTitle } from "../src/lib/dedupe/title"
import { parseSheet, type SheetRow } from "../src/lib/sheet/csv"
import { slugify, uniqueSlug } from "../src/lib/slug"

/** The v1 sheet. Public, and read-only to us. */
const SHEET_ID = process.env.V1_SHEET_ID ?? "1szZo1PYO10RARoQASFCcgx0WgLu63ExJdbKDuGbA7ww"
const SHEET_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv`

/**
 * One-line descriptions for the topics that have them, carried over from v1.
 * A topic without one simply shows its name and its count.
 */
const BLURBS: Record<string, string> = {
  faith: "Trusting God when the road is unclear.",
  prayer: "Keeping a conversation that outlasts your enthusiasm.",
  holiness: "A life set apart, worked out in ordinary days.",
  peace: "Rest that does not depend on the circumstances.",
  identity: "Who you are before you are anything else.",
  suffering: "Counsel for the seasons that ask more than you have.",
  purpose: "Why you are here, and what to do about it.",
  heaven: "Living now with the end in view.",
  warfare: "Standing your ground when the ground is contested.",
  victory: "What has already been won, and how to hold it.",
  gospel: "The message the whole collection is built on.",
  love: "The plainest command, and the hardest.",
}

async function fetchSheet(): Promise<string> {
  const res = await fetch(SHEET_URL, { cache: "no-store" })
  if (!res.ok) {
    throw new Error(
      `Could not read the spreadsheet (${res.status}). Check it is shared with anyone who has the link.`,
    )
  }
  const text = await res.text()
  if (/^\s*</.test(text)) {
    throw new Error('Google returned a sign-in page. Set the sheet to "Anyone with the link".')
  }
  return text
}

async function seedCategories(rows: SheetRow[]) {
  const byslug = new Map<string, string>()
  for (const row of rows) {
    for (const topic of row.topics) {
      const slug = slugify(topic)
      // First spelling seen wins, so "Faith" does not become "faith".
      if (!byslug.has(slug)) byslug.set(slug, topic)
    }
  }

  let created = 0
  for (const [slug, name] of byslug) {
    const result = await db
      .insert(categories)
      .values({ slug, name, blurb: BLURBS[slug] ?? null })
      .onConflictDoNothing({ target: categories.slug })
      .returning({ id: categories.id })
    if (result.length > 0) created++
  }

  const all = await db.select({ id: categories.id, slug: categories.slug }).from(categories)
  return {
    created,
    total: byslug.size,
    idBySlug: new Map(all.map((c) => [c.slug, c.id])),
  }
}

async function main() {
  console.log("Reading the v1 spreadsheet…")
  const rows = parseSheet(await fetchSheet())
  console.log(`  ${rows.length} rows with a title and a Drive link\n`)

  const cats = await seedCategories(rows)
  console.log(`Categories: ${cats.created} created, ${cats.total} in the sheet\n`)

  const existing = await db
    .select({ driveFileId: materials.driveFileId, slug: materials.slug })
    .from(materials)
  const known = new Set(existing.map((m) => m.driveFileId).filter(Boolean) as string[])
  const taken = new Set(existing.map((m) => m.slug))

  let imported = 0
  let skipped = 0
  let untagged = 0

  for (const row of rows) {
    if (row.driveFileId && known.has(row.driveFileId)) {
      skipped++
      continue
    }

    // The sheet's titles are often filenames. Keep both: what it said, and
    // what we show. A human can still correct the cleaned one later.
    const title = cleanTitle(row.title)
    const slug = uniqueSlug(title, taken)
    taken.add(slug)

    const [material] = await db
      .insert(materials)
      .values({
        slug,
        title,
        titleOriginal: row.title,
        author: row.author || null,
        summary: row.summary || null,
        // Files are still in Drive; the backfill puts them in R2 and publishes.
        status: "staged",
        source: "drive_sync",
        driveFileId: row.driveFileId,
      })
      .returning({ id: materials.id })

    if (row.topics.length === 0) untagged++

    for (const [i, topic] of row.topics.entries()) {
      const categoryId = cats.idBySlug.get(slugify(topic))
      if (!categoryId) continue
      await db
        .insert(materialCategories)
        .values({ materialId: material.id, categoryId, ordinal: i, assignedBy: "v1-sheet" })
        .onConflictDoNothing()
    }

    imported++
    if (imported % 50 === 0) console.log(`  …${imported} imported`)
  }

  const [{ count }] = await db.select({ count: sql<number>`count(*)::int` }).from(materials)

  console.log(`
Done.
  imported   ${imported}
  already in ${skipped}
  untagged   ${untagged}  (these show as Uncategorised until an admin files them)
  total rows ${count}

Next: pnpm backfill — downloads each file from Drive into R2, renders its
pages, reads the text, and publishes it.`)
}

main().catch((error) => {
  console.error("\nImport failed:", error instanceof Error ? error.message : error)
  process.exit(1)
})
