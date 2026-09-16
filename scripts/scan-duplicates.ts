/**
 * Find possible duplicates and record them for review.
 *
 *   pnpm scan:duplicates              every signal available right now
 *   pnpm scan:duplicates --titles     titles only, ignoring OCR text
 *   pnpm scan:duplicates --dry        report without writing anything
 *
 * Nothing here resolves anything. It raises pairs and explains why, and a
 * person decides — ARCHITECTURE.md §8. A pair already dismissed is never
 * raised again, so this is safe to re-run as the archive grows.
 *
 * Signals available depend on what has been processed. Titles work from the
 * moment materials are imported; the content signals need OCR text, so running
 * this before `pnpm ocr:local` finds title matches only. That is worth doing on
 * its own: titles alone surface 66 groups across 140 materials.
 */

import { randomUUID } from "node:crypto"
import { eq, sql } from "drizzle-orm"
import { duplicatePairs, materials } from "../src/db/schema"
import { txdb } from "../src/db/tx"
import { scoreDuplicate } from "../src/lib/dedupe/score"
import { titleOverlap, titleSimilarity } from "../src/lib/dedupe/title"
import { containment, textSimilarity } from "../src/lib/text/similarity"

const args = process.argv.slice(2)
const titlesOnly = args.includes("--titles")
const dry = args.includes("--dry")

type Row = {
  id: string
  title: string
  sha256: string | null
  pageCount: number | null
  text: string
}

/** Ordered so a pair is stored once, never twice. */
const orderPair = (a: string, b: string): [string, string] => (a < b ? [a, b] : [b, a])

async function main() {
  const base = await txdb
    .select({
      id: materials.id,
      title: materials.title,
      sha256: materials.sha256,
      pageCount: materials.pageCount,
    })
    .from(materials)
    .where(sql`${materials.archivedAt} is null`)

  // Page text, gathered per material in one pass. Deliberately a separate
  // query: a correlated subquery built by interpolating a column object into a
  // nested sql template silently matches nothing.
  const textRows = await txdb.execute(sql`
    select mp.material_id as id,
           string_agg(mp.text, ' ' order by mp.page_number) as text
      from material_pages mp
     where mp.text is not null
     group by mp.material_id`)

  const textById = new Map<string, string>()
  for (const r of (textRows.rows ?? textRows) as { id: string; text: string }[]) {
    textById.set(r.id, r.text ?? "")
  }

  const rows: Row[] = base.map((r) => ({ ...r, text: textById.get(r.id) ?? "" }))

  console.log(`comparing ${rows.length} materials`)
  const withText = rows.filter((r) => r.text.length > 200).length
  console.log(`  ${withText} have usable text${titlesOnly ? " (ignored: --titles)" : ""}`)

  // A pair a person has ruled on never comes back. A pair still pending can
  // be re-scored, so running this again after OCR improves earlier findings
  // instead of leaving them frozen at their weakest.
  const existing = await txdb
    .select({
      id: duplicatePairs.id,
      a: duplicatePairs.materialAId,
      b: duplicatePairs.materialBId,
      status: duplicatePairs.status,
    })
    .from(duplicatePairs)

  const settled = new Set(
    existing.filter((p) => p.status !== "pending").map((p) => `${p.a}:${p.b}`),
  )
  const pendingId = new Map(
    existing.filter((p) => p.status === "pending").map((p) => [`${p.a}:${p.b}`, p.id]),
  )
  console.log(`  ${settled.size} already decided, ${pendingId.size} pending and re-scorable\n`)

  const found: { a: string; b: string; score: number; signals: Record<string, unknown> }[] = []

  for (let i = 0; i < rows.length; i++) {
    for (let j = i + 1; j < rows.length; j++) {
      const x = rows[i]
      const y = rows[j]

      const title = titleSimilarity(x.title, y.title)
      const sha256Equal = Boolean(x.sha256 && y.sha256 && x.sha256 === y.sha256)

      // Comparing text is the expensive part, so only do it for pairs that
      // already look related by title or are byte-identical.
      //
      // Gated on raw word overlap, not on `title`: the series rule sets `title`
      // to 0 for "…Witness" against "…Witness1", and gating on that would stop
      // the text ever being read — losing the containment finding that is the
      // whole reason the pair deserves a look.
      const bothHaveText = !titlesOnly && x.text.length > 200 && y.text.length > 200
      const worthReading = bothHaveText && (titleOverlap(x.title, y.title) >= 0.35 || sha256Equal)

      const shingles = worthReading ? textSimilarity(x.text, y.text) : 0
      const contained = worthReading ? containment(x.text, y.text) : 0

      const verdict = scoreDuplicate({
        sha256Equal,
        title,
        shingles,
        containment: contained,
        samePageCount: x.pageCount !== null && x.pageCount === y.pageCount,
      })

      if (verdict.level === "distinct") continue

      const [a, b] = orderPair(x.id, y.id)
      if (settled.has(`${a}:${b}`)) continue

      found.push({
        a,
        b,
        score: verdict.score,
        signals: {
          level: verdict.level,
          reasons: verdict.reasons,
          title: Number(title.toFixed(3)),
          ...(sha256Equal ? { sha256Equal } : {}),
          ...(shingles ? { shingles: Number(shingles.toFixed(3)) } : {}),
          ...(contained ? { containment: Number(contained.toFixed(3)) } : {}),
        },
      })
    }
  }

  found.sort((p, q) => q.score - p.score)

  const byLevel = found.reduce<Record<string, number>>((acc, f) => {
    const level = String((f.signals as { level: string }).level)
    acc[level] = (acc[level] ?? 0) + 1
    return acc
  }, {})

  console.log(`${found.length} pairs to raise: ${JSON.stringify(byLevel)}\n`)
  console.log("strongest ten:")
  const titleOf = new Map(rows.map((r) => [r.id, r.title]))
  for (const f of found.slice(0, 10)) {
    console.log(
      `  ${f.score.toFixed(2)}  "${titleOf.get(f.a)?.slice(0, 34)}"  vs  "${titleOf.get(f.b)?.slice(0, 34)}"`,
    )
  }

  if (dry) {
    console.log("\n--dry: nothing written")
    return
  }

  if (found.length === 0) {
    console.log("\nnothing new to raise")
    return
  }

  // One transaction: either the whole scan's findings are recorded or none are.
  let added = 0
  let rescored = 0

  await txdb.transaction(async (tx) => {
    for (const f of found) {
      const known = pendingId.get(`${f.a}:${f.b}`)
      if (known) {
        await tx
          .update(duplicatePairs)
          .set({ score: f.score, signals: f.signals })
          .where(eq(duplicatePairs.id, known))
        rescored++
      } else {
        await tx.insert(duplicatePairs).values({
          id: randomUUID(),
          materialAId: f.a,
          materialBId: f.b,
          score: f.score,
          signals: f.signals,
          status: "pending",
        })
        added++
      }
    }
  })

  console.log(`\n${added} raised, ${rescored} re-scored — review at /admin/duplicates`)
}

main()
  .catch((e) => {
    console.error("scan failed:", e instanceof Error ? e.message : e)
    process.exit(1)
  })
  .then(() => process.exit(0))
