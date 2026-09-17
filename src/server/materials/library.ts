import { and, asc, count, desc, eq, exists, inArray, type SQL, sql } from "drizzle-orm"
import { db } from "../../db"
import { categories, materialCategories, materials } from "../../db/schema"
import { lookFor } from "../../lib/art/palette"
import { thumbKey } from "../../lib/r2/keys"
import { rankedSearch } from "./search"

/**
 * The library listing: search, filter by topic, sort, page.
 *
 * **Search is ranked now** — `./search`, four retrievals fused by reciprocal
 * rank. It used to be `ilike '%term%'` sorted by date, which returned 345 of 566
 * materials for "prayer" with a material *about* prayer sorting below one that
 * mentions it once, purely because it was older.
 *
 * The filters are still applied here and in SQL, not to the ranked list in
 * memory, so a topic or author filter narrows the *searchable* set rather than
 * a page of it — filtering after paging gives short pages and a wrong total.
 */

export type Sort = "relevance" | "recent" | "oldest" | "title" | "ztitle"
export const SORTS: Sort[] = ["relevance", "recent", "oldest", "title", "ztitle"]
export const PAGE_SIZE = 48

export type LibraryQuery = {
  q?: string
  topic?: string
  /** An exact author name, from the chips — not a search term. */
  author?: string
  sort?: Sort
  page?: number
}

const published = () => eq(materials.status, "published")

/**
 * Guards a sort arriving from a URL; anything unknown falls back.
 *
 * The fallback depends on whether there is a search: **relevance is meaningless
 * without a query** — there is nothing to be relevant to — so browsing defaults
 * to newest first, as it always has, and searching defaults to best match.
 */
export const asSort = (value: string | undefined, searching = false): Sort => {
  if (SORTS.includes(value as Sort)) {
    const sort = value as Sort
    return sort === "relevance" && !searching ? "recent" : sort
  }
  return searching ? "relevance" : "recent"
}

function orderFor(sort: Sort) {
  switch (sort) {
    case "relevance":
      // Handled in JavaScript against the ranked list; this is only reached
      // when there is no query, and then newest is the honest answer.
      return desc(materials.createdAt)
    case "oldest":
      // createdAt preserves v1 sheet order — the archive's real chronology.
      return asc(materials.createdAt)
    case "title":
      return asc(materials.title)
    case "ztitle":
      return desc(materials.title)
    default:
      return desc(materials.createdAt)
  }
}

function filters({ topic, author }: LibraryQuery) {
  const clauses: (SQL | undefined)[] = [published()]

  // An exact match, unlike `q`: this comes from a chip the reader clicked, so
  // "Rev. Darrel Lee" must not also collect "Darrel Lee Jr".
  if (author) clauses.push(eq(materials.author, author))

  if (topic && topic !== "all") {
    clauses.push(
      exists(
        db
          .select({ one: sql`1` })
          .from(materialCategories)
          .innerJoin(categories, eq(categories.id, materialCategories.categoryId))
          .where(and(eq(materialCategories.materialId, materials.id), eq(categories.slug, topic))),
      ),
    )
  }

  /**
   * Note what is *not* here: the query. Matching moved to `./search`, which
   * ranks; this function is only the filters that narrow what may be returned.
   */
  return and(...clauses)
}

/**
 * `createdAt` is selected although no card shows it: a searched result set is
 * ordered in memory, and without it "newest first" on top of a search could not
 * be honoured at all.
 */
const COLUMNS = {
  id: materials.id,
  slug: materials.slug,
  title: materials.title,
  summary: materials.summary,
  author: materials.author,
  pageCount: materials.pageCount,
  createdAt: materials.createdAt,
}

type Row = {
  id: string
  slug: string
  title: string
  summary: string | null
  author: string | null
  pageCount: number | null
  createdAt: Date
}

export async function libraryMaterials(query: LibraryQuery) {
  const page = Math.max(1, query.page ?? 1)
  const where = filters(query)
  const term = query.q?.trim().replace(/\s+/g, " ")
  const sort = query.sort ?? (term ? "relevance" : "recent")

  let rows: Row[]
  let found: number
  /** Page numbers from the text hits, so a result can say where it matched. */
  let pageOf = new Map<string, number | null>()

  if (term) {
    const hits = await rankedSearch(term)
    pageOf = new Map(hits.map((h) => [h.materialId, h.page]))
    const order = new Map(hits.map((h, index) => [h.materialId, index]))

    if (hits.length === 0) {
      rows = []
      found = 0
    } else {
      /**
       * The filters run in SQL against the ranked ids, not over the ranked list
       * here, so "prayer under Faith" is narrowed before it is paged. The list
       * is a few hundred ids at most — 566 published materials — so passing it
       * back to Postgres costs nothing and keeps one source of truth for what a
       * reader is allowed to see.
       */
      const allowed = await db
        .select(COLUMNS)
        .from(materials)
        .where(and(where, inArray(materials.id, [...order.keys()])))

      const ordered =
        sort === "relevance"
          ? allowed.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0))
          : sortInMemory(allowed, sort)

      found = ordered.length
      rows = ordered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)
    }
  } else {
    const [listed, [count_]] = await Promise.all([
      db
        .select(COLUMNS)
        .from(materials)
        .where(where)
        .orderBy(orderFor(sort))
        .limit(PAGE_SIZE)
        .offset((page - 1) * PAGE_SIZE),
      db.select({ n: count() }).from(materials).where(where),
    ])
    rows = listed
    found = count_?.n ?? 0
  }

  const ids = rows.map((r) => r.id)
  const topicRows = ids.length
    ? await db
        .select({
          materialId: materialCategories.materialId,
          name: categories.name,
          slug: categories.slug,
        })
        .from(materialCategories)
        .innerJoin(categories, eq(categories.id, materialCategories.categoryId))
        .where(inArray(materialCategories.materialId, ids))
        .orderBy(materialCategories.ordinal)
    : []

  const byMaterial = new Map<string, { name: string; slug: string }[]>()
  for (const row of topicRows) {
    const list = byMaterial.get(row.materialId) ?? []
    list.push({ name: row.name, slug: row.slug })
    byMaterial.set(row.materialId, list)
  }

  const items = rows.map((row) => {
    const topics = byMaterial.get(row.id) ?? []
    /**
     * A material filed under several topics wears the colours of the shelf you
     * are standing at, so a filtered library reads as one shelf. Away from a
     * shelf it wears its first topic.
     */
    const shelf = query.topic && query.topic !== "all" ? query.topic : topics[0]?.slug
    return {
      ...row,
      topics,
      look: lookFor(row.slug, shelf ?? "uncategorised"),
      thumbUrl: `${(process.env.R2_PUBLIC_BASE_URL ?? "").replace(/\/$/, "")}/${thumbKey(row.id)}`,
      /** Where in the material the search matched, when it matched the text. */
      matchedPage: pageOf.get(row.id) ?? null,
    }
  })

  return {
    items,
    total: found,
    page,
    pages: Math.max(1, Math.ceil(found / PAGE_SIZE)),
    hasMore: page * PAGE_SIZE < found,
  }
}

/**
 * Re-sort a searched result set by something other than relevance.
 *
 * In memory because the ranked ids are already in hand and the set is small;
 * going back to SQL for an ORDER BY would be a second round trip to reorder a
 * list of at most a few hundred.
 */
function sortInMemory(rows: Row[], sort: Sort): Row[] {
  const by = [...rows]
  switch (sort) {
    case "title":
      return by.sort((a, b) => a.title.localeCompare(b.title))
    case "ztitle":
      return by.sort((a, b) => b.title.localeCompare(a.title))
    case "oldest":
      return by.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
    case "recent":
      return by.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    default:
      return by
  }
}

/** One topic, by slug — for /topics/[slug]. Null when it does not exist. */
export async function topicBySlug(slug: string) {
  const [topic] = await db
    .select({ name: categories.name, slug: categories.slug, blurb: categories.blurb })
    .from(categories)
    .where(eq(categories.slug, slug))
    .limit(1)

  return topic ?? null
}
