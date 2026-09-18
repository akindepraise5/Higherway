import {
  and,
  asc,
  count,
  desc,
  eq,
  exists,
  gte,
  ilike,
  inArray,
  isNotNull,
  isNull,
  lt,
  or,
  type SQL,
  sql,
} from "drizzle-orm"
import { db } from "../../db"
import { categories, materialCategories, materialPages, materials } from "../../db/schema"
import { thumbKey } from "../../lib/r2/keys"
import { USABLE_THRESHOLD } from "../../lib/text/quality"

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
export type AdminFilter =
  | "all"
  | "in-progress"
  | "uncategorised"
  | "needs-ocr"
  | "poorly-read"
  | "archived"
  | "review"

export const FILTERS: { value: AdminFilter; label: string }[] = [
  { value: "all", label: "All" },
  /**
   * Everything the pipeline has not finished with, plus everything it refused.
   *
   * It exists because these states had **no way to be seen**. A material was
   * created inside the background task, so an upload to a project whose worker
   * was not running left nothing in the archive at all — the form said
   * "Uploaded" and that was the last anyone heard. Rows are created at upload
   * time now, and this is where they appear until they are read.
   */
  { value: "in-progress", label: "In progress" },
  { value: "uncategorised", label: "Uncategorised" },
  { value: "needs-ocr", label: "Awaiting text" },
  /**
   * Read, but badly. Distinct from "Awaiting text", and the distinction is the
   * whole point: a page with no text can be helped by running a recogniser,
   * while a page read at 0.3 has already been through one and needs a person to
   * look at the image. Sending someone to run OCR on it would be sending them to
   * do something that cannot work.
   *
   * `lib/text/quality` has scored every page since Phase 1 and `ocr:status`
   * counts these, but nothing has ever *shown* them — the flagging half of
   * "quality scoring and flagging" was never built.
   */
  { value: "poorly-read", label: "Read badly" },
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
    case "in-progress":
      clauses.push(
        isNull(materials.archivedAt),
        inArray(materials.status, ["staged", "processing", "rejected"]),
      )
      break
    case "uncategorised":
      clauses.push(
        isNull(materials.archivedAt),
        sql`not exists (
          select 1 from material_categories mc where mc.material_id = ${materials.id}
        )`,
      )
      break
    case "poorly-read":
      clauses.push(
        isNull(materials.archivedAt),
        exists(
          db
            .select({ one: sql`1` })
            .from(materialPages)
            .where(
              and(
                eq(materialPages.materialId, materials.id),
                lt(materialPages.ocrQuality, USABLE_THRESHOLD),
              ),
            ),
        ),
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
  const [all, inProgress, uncategorised, needsOcr, poorlyRead, review, archived] =
    await Promise.all([
      db.select({ n: count() }).from(materials).where(whereFor("all")),
      db.select({ n: count() }).from(materials).where(whereFor("in-progress")),
      db.select({ n: count() }).from(materials).where(whereFor("uncategorised")),
      db.select({ n: count() }).from(materials).where(whereFor("needs-ocr")),
      db.select({ n: count() }).from(materials).where(whereFor("poorly-read")),
      db.select({ n: count() }).from(materials).where(whereFor("review")),
      db.select({ n: count() }).from(materials).where(whereFor("archived")),
    ])

  return {
    all: all[0]?.n ?? 0,
    "in-progress": inProgress[0]?.n ?? 0,
    uncategorised: uncategorised[0]?.n ?? 0,
    "needs-ocr": needsOcr[0]?.n ?? 0,
    "poorly-read": poorlyRead[0]?.n ?? 0,
    review: review[0]?.n ?? 0,
    archived: archived[0]?.n ?? 0,
  } satisfies Record<AdminFilter, number>
}

/**
 * How many materials are being worked on **right now**.
 *
 * Three constraints, and every one of them exists because of something in this
 * archive rather than in the abstract:
 *
 * - `staged` and `processing` only, **not** `rejected`. Rejected is settled: it
 *   has an answer and will not change on its own, so counting it would leave a
 *   "waiting to be read" notice up for ever over finished work.
 * - **And only recently.** Three materials have been `staged` since the
 *   backfill — one whose Drive link 404s, one Drive served a sign-in page for,
 *   one that strayed into the folder — and nothing will ever process them.
 *   Counting those would put a spinner on this page permanently, which is how a
 *   notice becomes wallpaper. They are not in flight; they are stuck, and the
 *   "In progress" filter is where they can be dealt with.
 * - An hour is generous. A pipeline stage is seconds, and the longest thing in
 *   it is rendering a 13 MB photograph.
 */
const IN_FLIGHT_WINDOW_MS = 60 * 60 * 1000

export async function inFlightCount(): Promise<number> {
  const since = new Date(Date.now() - IN_FLIGHT_WINDOW_MS)

  const [row] = await db
    .select({ n: count() })
    .from(materials)
    .where(
      and(
        isNull(materials.archivedAt),
        inArray(materials.status, ["staged", "processing"]),
        gte(materials.updatedAt, since),
      ),
    )

  return row?.n ?? 0
}

/**
 * Every author name in use, busiest first — including on materials that are not
 * published yet.
 *
 * Distinct from the public `authorList`, which counts only published materials
 * because it builds the library's filter chips. Here the point is the opposite:
 * an editor filing a new material needs to see a name that was used yesterday on
 * something still in review, or they will type it again and spell it differently.
 *
 * `author` is stored null when unknown, never "", so a NOT NULL test is enough.
 */
export async function adminAuthors(): Promise<{ name: string; count: number }[]> {
  const rows = await db
    .select({ name: materials.author, count: count(materials.id) })
    .from(materials)
    .where(and(isNull(materials.archivedAt), isNotNull(materials.author)))
    .groupBy(materials.author)
    .orderBy(desc(count(materials.id)), materials.author)

  return rows.map((row) => ({ name: row.name ?? "", count: row.count })).filter((r) => r.name)
}
