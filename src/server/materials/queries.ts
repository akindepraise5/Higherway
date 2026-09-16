import { and, count, desc, eq, inArray, isNull, sql } from "drizzle-orm"
import { db } from "../../db"
import { categories, materialCategories, materialPages, materials } from "../../db/schema"
import { lookFor } from "../../lib/art/palette"
import { pageKey, publicUrl, thumbKey } from "../../lib/r2/keys"

/**
 * Everything the public site reads. Queries only — nothing here writes, and
 * nothing here is reachable by a visitor without going through a page.
 *
 * Two rules hold throughout:
 *   - Only `published` materials are ever returned. An archived duplicate, a
 *     staged upload and a rejected submission are all invisible here.
 *   - A material with no category is *computed* as Uncategorised rather than
 *     carrying a row for it, so filing one later changes nothing else.
 */

const UNCATEGORISED = { id: "uncategorised", name: "Uncategorised", slug: "uncategorised" } as const

export type MaterialCard = {
  id: string
  slug: string
  title: string
  summary: string | null
  author: string | null
  pageCount: number | null
  topics: { name: string; slug: string }[]
  /** The shelf a card is standing on decides its colours. */
  look: ReturnType<typeof lookFor>
  thumbUrl: string
}

const base = () => publicUrl("", process.env.R2_PUBLIC_BASE_URL ?? "").replace(/\/$/, "")

function toCard(row: {
  id: string
  slug: string
  title: string
  summary: string | null
  author: string | null
  pageCount: number | null
  topics: { name: string; slug: string }[]
  shelf?: string
}): MaterialCard {
  const shelf = row.shelf ?? row.topics[0]?.slug ?? UNCATEGORISED.slug
  return {
    ...row,
    look: lookFor(row.slug, shelf),
    thumbUrl: `${base()}/${thumbKey(row.id)}`,
  }
}

/** Topics attached to a set of materials, in one query rather than N. */
async function topicsFor(ids: string[]) {
  if (ids.length === 0) return new Map<string, { name: string; slug: string }[]>()

  const rows = await db
    .select({
      materialId: materialCategories.materialId,
      name: categories.name,
      slug: categories.slug,
      ordinal: materialCategories.ordinal,
    })
    .from(materialCategories)
    .innerJoin(categories, eq(categories.id, materialCategories.categoryId))
    .where(inArray(materialCategories.materialId, ids))
    .orderBy(materialCategories.ordinal)

  const byMaterial = new Map<string, { name: string; slug: string }[]>()
  for (const row of rows) {
    const list = byMaterial.get(row.materialId) ?? []
    list.push({ name: row.name, slug: row.slug })
    byMaterial.set(row.materialId, list)
  }
  return byMaterial
}

const published = () => eq(materials.status, "published")

/**
 * The newest additions.
 *
 * Ordered by `createdAt`, which preserves the order of the v1 spreadsheet —
 * read top to bottom, so its last rows are the archive's newest material.
 * Deliberately *not* `publishedAt`: that records when the backfill script
 * happened to reach a file, which is alphabetical and means nothing to a
 * reader. Once the admin panel is adding materials, both agree again.
 */
export async function recentMaterials(limit = 8): Promise<MaterialCard[]> {
  const rows = await db
    .select({
      id: materials.id,
      slug: materials.slug,
      title: materials.title,
      summary: materials.summary,
      author: materials.author,
      pageCount: materials.pageCount,
    })
    .from(materials)
    .where(published())
    .orderBy(desc(materials.createdAt))
    .limit(limit)

  const topics = await topicsFor(rows.map((r) => r.id))
  return rows.map((r) => toCard({ ...r, topics: topics.get(r.id) ?? [] }))
}

/** Topics with something on them, busiest first — the home page tiles. */
export async function topicList(limit?: number) {
  const rows = await db
    .select({
      name: categories.name,
      slug: categories.slug,
      blurb: categories.blurb,
      count: count(materialCategories.materialId),
    })
    .from(categories)
    .innerJoin(materialCategories, eq(materialCategories.categoryId, categories.id))
    .innerJoin(
      materials,
      and(eq(materials.id, materialCategories.materialId), eq(materials.status, "published")),
    )
    .where(isNull(categories.mergedIntoId))
    .groupBy(categories.id, categories.name, categories.slug, categories.blurb)
    .orderBy(desc(count(materialCategories.materialId)), categories.name)
    .limit(limit ?? 100)

  return rows
}

/** One material, by its public slug. Returns null rather than throwing. */
export async function materialBySlug(slug: string) {
  const [row] = await db
    .select()
    .from(materials)
    .where(and(eq(materials.slug, slug), published()))
    .limit(1)

  if (!row) return null

  const [topics, pages] = await Promise.all([
    topicsFor([row.id]),
    db
      .select({
        pageNumber: materialPages.pageNumber,
        width: materialPages.width,
        height: materialPages.height,
        text: materialPages.text,
      })
      .from(materialPages)
      .where(eq(materialPages.materialId, row.id))
      .orderBy(materialPages.pageNumber),
  ])

  const list = topics.get(row.id) ?? []

  return {
    ...row,
    topics: list,
    look: lookFor(row.slug, list[0]?.slug ?? UNCATEGORISED.slug),
    /** The original, straight from the bucket's custom domain. */
    downloadUrl: row.r2KeyPdf ? `${base()}/${row.r2KeyPdf}` : null,
    pages: pages.map((p) => ({
      ...p,
      url: `${base()}/${pageKey(row.id, p.pageNumber)}`,
    })),
    /** Only shown when the admin has not hidden it. OCR of photos errs. */
    readableText: row.textPublic
      ? pages
          .map((p) => p.text ?? "")
          .join("\n\n")
          .trim()
      : "",
  }
}

/** Every published slug — for the sitemap and for static generation. */
export async function allPublishedSlugs(): Promise<{ slug: string; updatedAt: Date }[]> {
  return db
    .select({ slug: materials.slug, updatedAt: materials.updatedAt })
    .from(materials)
    .where(published())
}

/** Counts for the home page and the about page. */
export async function archiveStats() {
  const [[materialCount], [topicCount]] = await Promise.all([
    db.select({ n: count() }).from(materials).where(published()),
    db
      .select({ n: sql<number>`count(distinct ${materialCategories.categoryId})::int` })
      .from(materialCategories)
      .innerJoin(
        materials,
        and(eq(materials.id, materialCategories.materialId), eq(materials.status, "published")),
      ),
  ])

  return { materials: materialCount?.n ?? 0, topics: topicCount?.n ?? 0 }
}
