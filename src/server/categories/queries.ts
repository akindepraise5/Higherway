import { asc, count, desc, eq, isNull, sql } from "drizzle-orm"
import { db } from "../../db"
import { categories, materialCategories, materials } from "../../db/schema"

/**
 * Reading categories for the admin panel.
 *
 * The archive arrived with 69 topics taken from the v1 spreadsheet, 19 of them
 * used exactly once — which is why merging is a first-class action rather than
 * a delete-and-retag chore, and why this file surfaces the small ones plainly.
 *
 * Queries only; anything that changes a category goes through a service.
 */

export type CategoryRow = {
  id: string
  name: string
  slug: string
  blurb: string | null
  total: number
  published: number
  mergedIntoId: string | null
}

/** Every category with how much sits on it, busiest first. */
export async function adminCategories(): Promise<CategoryRow[]> {
  const rows = await db
    .select({
      id: categories.id,
      name: categories.name,
      slug: categories.slug,
      blurb: categories.blurb,
      mergedIntoId: categories.mergedIntoId,
      total: count(materialCategories.materialId),
      published: sql<number>`count(*) filter (where ${materials.status} = 'published')::int`,
    })
    .from(categories)
    .leftJoin(materialCategories, eq(materialCategories.categoryId, categories.id))
    .leftJoin(materials, eq(materials.id, materialCategories.materialId))
    .where(isNull(categories.mergedIntoId))
    .groupBy(
      categories.id,
      categories.name,
      categories.slug,
      categories.blurb,
      categories.mergedIntoId,
    )
    .orderBy(desc(count(materialCategories.materialId)), asc(categories.name))

  return rows
}

/**
 * Categories holding one material or none.
 *
 * Not a fault in itself — a topic can be legitimately rare — but it is usually
 * a near-duplicate of a larger one ("Pain" beside "Suffering"), and those are
 * worth putting in front of a person rather than leaving to be found.
 */
export async function thinCategories(threshold = 1) {
  const all = await adminCategories()
  return all.filter((c) => c.total <= threshold)
}

/** One category by id, for the edit screen. */
export async function categoryById(id: string) {
  const [row] = await db.select().from(categories).where(eq(categories.id, id)).limit(1)
  return row ?? null
}

/** Is this slug free? Used before renaming, so the failure is explained early. */
export async function slugTaken(slug: string, exceptId?: string) {
  const [row] = await db
    .select({ id: categories.id })
    .from(categories)
    .where(eq(categories.slug, slug))
    .limit(1)

  return row ? row.id !== exceptId : false
}
