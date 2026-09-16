/**
 * Reverse a category merge, reconstructing membership from the v1 spreadsheet.
 *
 *   pnpm exec tsx --env-file=.env.local scripts/undo-merge.ts <slug>
 *
 * This exists because mergeCategory moves filings with an UPDATE: afterwards a
 * moved row is indistinguishable from one that was always on the target, and
 * the audit entry records how many moved but not which. The spreadsheet is the
 * only remaining source of truth for the original assignment.
 *
 * That is a real limitation, not a quirk of this incident — a category created
 * after the import has no such fallback. The fix is confirmation before the
 * fact, which is why merge now requires typing the category name.
 */
import { and, eq, inArray, isNotNull, sql } from "drizzle-orm"
import { categories, materialCategories, materials } from "../src/db/schema"
import { txdb } from "../src/db/tx"
import { parseSheet } from "../src/lib/sheet/csv"
import { slugify } from "../src/lib/slug"
import { audit } from "../src/server/audit"

const SHEET_ID = process.env.V1_SHEET_ID ?? "1szZo1PYO10RARoQASFCcgx0WgLu63ExJdbKDuGbA7ww"

async function main() {
  const slug = process.argv[2]
  if (!slug) {
    console.error("usage: undo-merge.ts <slug-of-the-merged-away-category>")
    process.exit(1)
  }

  const [source] = await txdb.select().from(categories).where(eq(categories.slug, slug)).limit(1)
  if (!source) {
    console.error(`No category with slug "${slug}".`)
    process.exit(1)
  }
  if (!source.mergedIntoId) {
    console.error(`"${source.name}" is not merged into anything.`)
    process.exit(1)
  }

  const [target] = await txdb
    .select()
    .from(categories)
    .where(eq(categories.id, source.mergedIntoId))
    .limit(1)

  console.log(`Undoing: "${source.name}" was merged into "${target?.name}"`)

  // Which materials did the sheet file under this topic?
  const res = await fetch(
    `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv`,
    { cache: "no-store" },
  )
  const rows = parseSheet(await res.text())
  const wanted = new Set(
    rows
      .filter((r) => r.topics.some((t) => slugify(t) === slug))
      .map((r) => r.driveFileId)
      .filter((id): id is string => Boolean(id)),
  )
  console.log(`  the sheet files ${wanted.size} materials under "${source.name}"`)

  const result = await txdb.transaction(async (tx) => {
    const owned = await tx
      .select({ id: materials.id, driveFileId: materials.driveFileId })
      .from(materials)
      .where(isNotNull(materials.driveFileId))

    const ids = owned.filter((m) => m.driveFileId && wanted.has(m.driveFileId)).map((m) => m.id)
    console.log(`  matched ${ids.length} of them in the database`)

    if (ids.length === 0) return { moved: 0 }

    // Move only the filings that the merge itself moved: those sitting on the
    // target for a material the sheet assigned to the source.
    const moved = await tx
      .update(materialCategories)
      .set({ categoryId: source.id })
      .where(
        and(
          eq(materialCategories.categoryId, source.mergedIntoId as string),
          inArray(materialCategories.materialId, ids),
        ),
      )

    await tx.update(categories).set({ mergedIntoId: null }).where(eq(categories.id, source.id))

    await audit(tx, {
      action: "category.unmerge",
      entityType: "category",
      entityId: source.id,
      before: { mergedInto: target?.name, name: source.name },
      after: { restored: ids.length, reconstructedFrom: "v1 spreadsheet" },
    })

    return { moved: moved.rowCount ?? ids.length }
  })

  const after = await txdb
    .select({
      name: categories.name,
      filings: sql<number>`(select count(*) from material_categories mc where mc.category_id = ${categories.id})::int`,
      mergedInto: categories.mergedIntoId,
    })
    .from(categories)
    .where(inArray(categories.id, [source.id, source.mergedIntoId as string]))

  console.log(`\nrestored ${result.moved} filings\n`)
  for (const row of after) {
    console.log(
      `  ${row.name.padEnd(14)} ${String(row.filings).padStart(3)} filings   merged=${row.mergedInto ?? "no"}`,
    )
  }

  const [{ total }] = await txdb
    .select({ total: sql<number>`count(*)::int` })
    .from(materialCategories)
  console.log(`\ntotal filings: ${total} (was 327 before the merge)`)
}

main()
  .catch((e) => {
    console.error("undo failed:", e instanceof Error ? e.message : e)
    process.exit(1)
  })
  .then(() => process.exit(0))
