import {
  and,
  asc,
  count,
  desc,
  eq,
  exists,
  ilike,
  inArray,
  isNull,
  or,
  type SQL,
  sql,
} from "drizzle-orm"
import { db } from "../../db"
import { categories, materialCategories, materialPages, materials } from "../../db/schema"
import { thumbKey } from "../../lib/r2/keys"

/**
 * Reading materials for the admin panel.
 *
 * Deliberately separate from `server/materials/queries.ts`, which serves the
 * public site and only ever returns published rows. This one sees everything —
 * staged, in review, archived — because the whole job of the panel is to work
 * on materials the public cannot see yet.
 *
 * Queries only. Anything that changes a material goes through a service that
 * writes an audit entry in the same transaction (CLAUDE.md).
 */

export const ADMIN_PAGE_SIZE = 40

/** The queues the overview links to, plus the plain list. */
export type AdminFilter = "all" | "uncategorised" | "needs-ocr" | "archived" | "review"

export const FILTERS: { value: AdminFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "uncategorised", label: "Uncategorised" },
  { value: "needs-ocr", label: "Awaiting text" },
  { value: "review", label: "In review" },
  { value: "archived", label: "Archived" },
]

export const asFilter = (value: string | undefined): AdminFilter =>
  FILTERS.some((f) => f.value === value) ? (value as AdminFilter) : "all"

export type AdminSort = "recent" | "oldest" | "title"

export const asAdminSort = (value: string | undefined): AdminSort =>
  value === "oldest" || value === "title" ? value : "recent"

function orderFor(sort: AdminSort) {
  if (sort === "title") return asc(materials.title)
  if (sort === "oldest") return asc(materials.createdAt)
  return desc(materials.createdAt)
}

function whereFor(filter: AdminFilter, q?: string): SQL | undefined {
  const clauses: (SQL | undefined)[] = []

  switch (filter) {
    case "archived":
      clauses.push(eq(materials.status, "archived"))
      break
    case "review":
      clauses.push(eq(materials.status, "review"))
      break
    case "uncategorised":
      clauses.push(
        isNull(materials.archivedAt),
        sql`not exists (
          select 1 from material_categories mc where mc.material_id = ${materials.id}
        )`,
      )
      break
    case "needs-ocr":
      clauses.push(
        isNull(materials.archivedAt),
        exists(
          db
            .select({ one: sql`1` })
            .from(materialPages)
            .where(
              and(
                eq(materialPages.materialId, materials.id),
                // Never read, rather than holding no text: a blank page has
                // been read and is finished, and listing it here sent an admin
                // to run OCR that could never clear it.
                eq(materialPages.ocrEngine, "none"),
              ),
            ),
        ),
      )
      break
    default:
      // "All" still hides archived rows; they have their own filter.
      clauses.push(isNull(materials.archivedAt))
  }

  const term = q?.trim()
  if (term) {
    const like = `%${term}%`
    clauses.push(
      or(
        ilike(materials.title, like),
        ilike(materials.titleOriginal, like),
        ilike(materials.author, like),
      ),
    )
  }

  return and(...clauses)
}

export async function adminMaterials({
  filter = "all",
  q,
  sort = "recent",
  page = 1,
}: {
  filter?: AdminFilter
  q?: string
  sort?: AdminSort
  page?: number
}) {
  const where = whereFor(filter, q)
  const current = Math.max(1, page)

  const [rows, [total]] = await Promise.all([
    db
      .select({
        id: materials.id,
        slug: materials.slug,
        title: materials.title,
        titleOriginal: materials.titleOriginal,
        author: materials.author,
        status: materials.status,
        pageCount: materials.pageCount,
        byteSize: materials.byteSize,
        ocrEngine: materials.ocrEngine,
        ocrQuality: materials.ocrQuality,
        createdAt: materials.createdAt,
      })
      .from(materials)
      .where(where)
      .orderBy(orderFor(sort))
      .limit(ADMIN_PAGE_SIZE)
      .offset((current - 1) * ADMIN_PAGE_SIZE),
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

  const base = (process.env.R2_PUBLIC_BASE_URL ?? "").replace(/\/$/, "")
  const found = total?.n ?? 0

  return {
    items: rows.map((row) => ({
      ...row,
      topics: byMaterial.get(row.id) ?? [],
      thumbUrl: `${base}/${thumbKey(row.id)}`,
    })),
    total: found,
    page: current,
    pages: Math.max(1, Math.ceil(found / ADMIN_PAGE_SIZE)),
  }
}

/** Counts for the filter chips, so each one shows its size before you click. */
export async function adminCounts() {
  const [all, uncategorised, needsOcr, review, archived] = await Promise.all([
    db.select({ n: count() }).from(materials).where(whereFor("all")),
    db.select({ n: count() }).from(materials).where(whereFor("uncategorised")),
    db.select({ n: count() }).from(materials).where(whereFor("needs-ocr")),
    db.select({ n: count() }).from(materials).where(whereFor("review")),
    db.select({ n: count() }).from(materials).where(whereFor("archived")),
  ])

  return {
    all: all[0]?.n ?? 0,
    uncategorised: uncategorised[0]?.n ?? 0,
    "needs-ocr": needsOcr[0]?.n ?? 0,
    review: review[0]?.n ?? 0,
    archived: archived[0]?.n ?? 0,
  } satisfies Record<AdminFilter, number>
}
