import { and, asc, count, desc, eq, exists, ilike, inArray, or, type SQL, sql } from "drizzle-orm"
import { db } from "../../db"
import { categories, materialCategories, materialPages, materials } from "../../db/schema"
import { lookFor } from "../../lib/art/palette"
import { thumbKey } from "../../lib/r2/keys"

/**
 * The library listing: search, filter by topic, sort, page.
 *
 * Search here is plain text matching over titles, summaries and the OCR text.
 * Meaning-based search arrives once the archive has been read and embedded
 * (ARCHITECTURE.md §9) — this is the half that works with no model at all, and
 * it stays as the foundation the other two methods are fused onto.
 */

export type Sort = "recent" | "oldest" | "title" | "ztitle"
export const SORTS: Sort[] = ["recent", "oldest", "title", "ztitle"]
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

/** Guards a sort arriving from a URL; anything unknown falls back. */
export const asSort = (value: string | undefined): Sort =>
  SORTS.includes(value as Sort) ? (value as Sort) : "recent"

function orderFor(sort: Sort) {
  switch (sort) {
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

function filters({ q, topic, author }: LibraryQuery) {
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

  // Collapsed here as well as in the column: a reader who types two spaces, or
  // pastes a phrase that wrapped in whatever they copied it from, means the
  // same search as one who does not.
  const term = q?.trim().replace(/\s+/g, " ")
  if (term) {
    const like = `%${term}%`
    clauses.push(
      or(
        ilike(materials.title, like),
        ilike(materials.summary, like),
        ilike(materials.author, like),
        /**
         * The name of a topic it is filed under. Searching "prayer" should find
         * what is shelved under Prayer even when the word appears nowhere in
         * the title — the search box says "materials or topics", and until now
         * only the first half was true.
         */
        exists(
          db
            .select({ one: sql`1` })
            .from(materialCategories)
            .innerJoin(categories, eq(categories.id, materialCategories.categoryId))
            .where(
              and(eq(materialCategories.materialId, materials.id), ilike(categories.name, like)),
            ),
        ),
        /**
         * The OCR text is what makes a photographed page findable at all, and
         * it is stored one line per line of the page — `readingOrder` ends with
         * `.join("\n")`. So a page holds "in a good\nhome", and searching
         * "brought up in a good home" found nothing while "brought up in a
         * good" found it: the literal substring genuinely is not there, because
         * a newline sits where the space would be.
         *
         * Collapsing whitespace on both sides makes a phrase findable across
         * whatever line break it happens to fall on. `material_pages_text_trgm_idx`
         * indexes this exact expression, so it stays an index lookup — the
         * expression must match the index character for character.
         */
        exists(
          db
            .select({ one: sql`1` })
            .from(materialPages)
            .where(
              and(
                eq(materialPages.materialId, materials.id),
                sql`regexp_replace(${materialPages.text}, '[[:space:]]+', ' ', 'g') ilike ${like}`,
              ),
            ),
        ),
      ),
    )
  }

  return and(...clauses)
}

export async function libraryMaterials(query: LibraryQuery) {
  const page = Math.max(1, query.page ?? 1)
  const where = filters(query)

  const [rows, [total]] = await Promise.all([
    db
      .select({
        id: materials.id,
        slug: materials.slug,
        title: materials.title,
        summary: materials.summary,
        author: materials.author,
        pageCount: materials.pageCount,
      })
      .from(materials)
      .where(where)
      .orderBy(orderFor(query.sort ?? "recent"))
      .limit(PAGE_SIZE)
      .offset((page - 1) * PAGE_SIZE),
    db.select({ n: count() }).from(materials).where(where),
  ])

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
    }
  })

  const found = total?.n ?? 0
  return {
    items,
    total: found,
    page,
    pages: Math.max(1, Math.ceil(found / PAGE_SIZE)),
    hasMore: page * PAGE_SIZE < found,
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
