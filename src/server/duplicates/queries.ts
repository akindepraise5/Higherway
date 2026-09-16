import { asc, count, desc, eq, inArray, sql } from "drizzle-orm"
import { db } from "../../db"
import { duplicatePairs, materials } from "../../db/schema"
import { lookFor } from "../../lib/art/palette"
import { pageKey, thumbKey } from "../../lib/r2/keys"

/**
 * Reading duplicate candidates for review.
 *
 * The archive arrived with 62 exact-title groups covering 132 rows, and 69 once
 * case and punctuation are ignored — "Come Hungry" twice, "Contending for the
 * Faith" beside "Contend for the faith". Nothing is resolved automatically;
 * this only puts pairs in front of a person.
 *
 * Pairs are grouped into clusters, because three copies of one material is one
 * decision, not three.
 */

export type PairSide = {
  id: string
  slug: string
  title: string
  author: string | null
  pageCount: number | null
  byteSize: number | null
  status: string
  createdAt: Date
  topics: string[]
  thumbUrl: string
  firstPageUrl: string | null
  look: ReturnType<typeof lookFor>
}

export type DuplicatePair = {
  id: string
  score: number
  signals: Record<string, unknown>
  status: "pending" | "dismissed" | "merged"
  a: PairSide
  b: PairSide
}

const base = () => (process.env.R2_PUBLIC_BASE_URL ?? "").replace(/\/$/, "")

/** How many pairs are waiting, so the overview can show a number. */
export async function pendingCount() {
  const [row] = await db
    .select({ n: count() })
    .from(duplicatePairs)
    .where(eq(duplicatePairs.status, "pending"))
  return row?.n ?? 0
}

async function sides(ids: string[]): Promise<Map<string, PairSide>> {
  if (ids.length === 0) return new Map()

  const rows = await db
    .select({
      id: materials.id,
      slug: materials.slug,
      title: materials.title,
      author: materials.author,
      pageCount: materials.pageCount,
      byteSize: materials.byteSize,
      status: materials.status,
      createdAt: materials.createdAt,
      topics: sql<string[]>`coalesce(array(
        select c.name from material_categories mc
        join categories c on c.id = mc.category_id
        where mc.material_id = ${materials.id}
        order by mc.ordinal
      ), '{}')`,
      hasFirstPage: sql<boolean>`exists (
        select 1 from material_pages mp
        where mp.material_id = ${materials.id} and mp.page_number = 1
      )`,
    })
    .from(materials)
    .where(inArray(materials.id, ids))

  return new Map(
    rows.map((row) => [
      row.id,
      {
        ...row,
        thumbUrl: `${base()}/${thumbKey(row.id)}`,
        firstPageUrl: row.hasFirstPage ? `${base()}/${pageKey(row.id, 1)}` : null,
        look: lookFor(
          row.slug,
          row.topics[0] ? String(row.topics[0]).toLowerCase() : "uncategorised",
        ),
      } as PairSide,
    ]),
  )
}

/**
 * Pairs awaiting a decision, strongest first — the clearest cases are the
 * quickest to resolve, and working down from certainty is less tiring than
 * starting with the ambiguous ones.
 */
export async function pendingPairs(limit = 50): Promise<DuplicatePair[]> {
  const pairs = await db
    .select()
    .from(duplicatePairs)
    .where(eq(duplicatePairs.status, "pending"))
    .orderBy(desc(duplicatePairs.score), asc(duplicatePairs.createdAt))
    .limit(limit)

  const ids = [...new Set(pairs.flatMap((p) => [p.materialAId, p.materialBId]))]
  const byId = await sides(ids)

  return pairs
    .map((pair) => {
      const a = byId.get(pair.materialAId)
      const b = byId.get(pair.materialBId)
      if (!a || !b) return null
      return {
        id: pair.id,
        score: pair.score,
        signals: (pair.signals ?? {}) as Record<string, unknown>,
        status: pair.status,
        a,
        b,
      }
    })
    .filter((p): p is DuplicatePair => p !== null)
}

/** Decisions already made, so a dismissal can be found and reconsidered. */
export async function decidedPairs(limit = 50) {
  return db
    .select({
      id: duplicatePairs.id,
      status: duplicatePairs.status,
      score: duplicatePairs.score,
      decidedAt: duplicatePairs.decidedAt,
      decidedBy: duplicatePairs.decidedBy,
    })
    .from(duplicatePairs)
    .where(sql`${duplicatePairs.status} <> 'pending'`)
    .orderBy(desc(duplicatePairs.decidedAt))
    .limit(limit)
}
