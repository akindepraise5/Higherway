"use server"

import { randomUUID } from "node:crypto"
import { and, eq, ne, sql } from "drizzle-orm"
import { revalidatePath } from "next/cache"
import { categories, materialCategories } from "../../db/schema"
import { txdb } from "../../db/tx"
import { requireRole } from "../../lib/session"
import { slugify } from "../../lib/slug"
import { audit } from "../audit"

/**
 * Changing categories.
 *
 * Every function here runs inside a `txdb` transaction and writes its audit
 * entry in the same one, so a change and the record of it cannot come apart
 * (CLAUDE.md). The HTTP driver cannot do this — see `src/db/tx.ts`.
 *
 * Nothing here destroys a material. Deleting a category unfiles the materials
 * on it; they become Uncategorised and stay in the library.
 */

export type ServiceResult = { ok: true; message?: string } | { ok: false; error: string }

/**
 * Create a category. **Owner only.**
 *
 * A topic is a public URL and a shelf in the library, so adding one is a
 * structural decision about how the archive is organised rather than part of
 * filing. 69 topics arrived from v1 with 19 used exactly once — "Pain" beside
 * "Suffering" — which is what an open create door produces over time.
 */
export async function createCategory(name: string, blurb?: string): Promise<ServiceResult> {
  const { session } = await requireRole("owner")

  const trimmed = name.trim()
  if (trimmed.length < 2) return { ok: false, error: "A name needs at least two characters." }

  const slug = slugify(trimmed)

  const result = await txdb.transaction(async (tx) => {
    const [existing] = await tx
      .select({ id: categories.id, name: categories.name })
      .from(categories)
      .where(eq(categories.slug, slug))
      .limit(1)

    if (existing) {
      return { ok: false as const, error: `“${existing.name}” already covers that.` }
    }

    const id = randomUUID()
    await tx.insert(categories).values({ id, name: trimmed, slug, blurb: blurb?.trim() || null })

    await audit(tx, {
      action: "category.create",
      entityType: "category",
      entityId: id,
      after: { name: trimmed, slug },
      actorId: session.user.id,
    })

    return { ok: true as const, message: `Created “${trimmed}”.` }
  })

  revalidatePath("/admin/categories")
  return result
}

/**
 * Rename a category. **Owner only** — the slug follows the name, so this
 * changes a public URL and breaks every link anyone has already shared to it.
 */
export async function renameCategory(
  id: string,
  name: string,
  blurb?: string,
): Promise<ServiceResult> {
  const { session } = await requireRole("owner")

  const trimmed = name.trim()
  if (trimmed.length < 2) return { ok: false, error: "A name needs at least two characters." }

  const slug = slugify(trimmed)

  const result = await txdb.transaction(async (tx) => {
    const [current] = await tx.select().from(categories).where(eq(categories.id, id)).limit(1)
    if (!current) return { ok: false as const, error: "That category no longer exists." }

    const [clash] = await tx
      .select({ id: categories.id, name: categories.name })
      .from(categories)
      .where(and(eq(categories.slug, slug), ne(categories.id, id)))
      .limit(1)

    if (clash) return { ok: false as const, error: `“${clash.name}” already uses that name.` }

    await tx
      .update(categories)
      .set({ name: trimmed, slug, blurb: blurb?.trim() || null, updatedAt: new Date() })
      .where(eq(categories.id, id))

    await audit(tx, {
      action: "category.rename",
      entityType: "category",
      entityId: id,
      before: { name: current.name, slug: current.slug, blurb: current.blurb },
      after: { name: trimmed, slug, blurb: blurb?.trim() || null },
      actorId: session.user.id,
    })

    return { ok: true as const, message: `Renamed to “${trimmed}”.` }
  })

  revalidatePath("/admin/categories")
  revalidatePath("/library")
  revalidatePath("/") // the home page counts and shows the newest material
  return result
}

/**
 * Merge one category into another.
 *
 * The archive arrived with 69 topics, 19 used exactly once — "Pain" beside
 * "Suffering", that sort of thing. Merging moves every material across, skips
 * any that already sit on the target, and leaves the source pointing at its
 * new home so old links keep working rather than dead-ending.
 */
export async function mergeCategory(fromId: string, intoId: string): Promise<ServiceResult> {
  const { session } = await requireRole("owner")

  if (fromId === intoId) return { ok: false, error: "That is the same category." }

  const result = await txdb.transaction(async (tx) => {
    const [from] = await tx.select().from(categories).where(eq(categories.id, fromId)).limit(1)
    const [into] = await tx.select().from(categories).where(eq(categories.id, intoId)).limit(1)

    if (!from || !into) return { ok: false as const, error: "One of those no longer exists." }

    // Move only what is not already filed on the target, so the join table
    // never collides on its composite key.
    const moved = await tx.execute(sql`
      update material_categories mc
         set category_id = ${intoId}
       where mc.category_id = ${fromId}
         and not exists (
           select 1 from material_categories other
            where other.material_id = mc.material_id
              and other.category_id = ${intoId}
         )`)

    // Anything left was already on both; drop the duplicate filing.
    await tx.delete(materialCategories).where(eq(materialCategories.categoryId, fromId))

    await tx
      .update(categories)
      .set({ mergedIntoId: intoId, updatedAt: new Date() })
      .where(eq(categories.id, fromId))

    await audit(tx, {
      action: "category.merge",
      entityType: "category",
      entityId: fromId,
      before: { name: from.name, slug: from.slug },
      after: { mergedInto: into.name, moved: moved.rowCount ?? 0 },
      actorId: session.user.id,
    })

    return {
      ok: true as const,
      message: `Merged “${from.name}” into “${into.name}”.`,
    }
  })

  revalidatePath("/admin/categories")
  revalidatePath("/library")
  revalidatePath("/") // the home page counts and shows the newest material
  return result
}

/**
 * Delete a category. Materials on it are unfiled, not deleted — they become
 * Uncategorised and remain in the library exactly as before.
 */
export async function deleteCategory(id: string): Promise<ServiceResult> {
  const { session } = await requireRole("owner")

  const result = await txdb.transaction(async (tx) => {
    const [current] = await tx.select().from(categories).where(eq(categories.id, id)).limit(1)
    if (!current) return { ok: false as const, error: "That category no longer exists." }

    const [{ n }] = await tx
      .select({ n: sql<number>`count(*)::int` })
      .from(materialCategories)
      .where(eq(materialCategories.categoryId, id))

    await tx.delete(materialCategories).where(eq(materialCategories.categoryId, id))
    await tx.delete(categories).where(eq(categories.id, id))

    await audit(tx, {
      action: "category.delete",
      entityType: "category",
      entityId: id,
      before: { name: current.name, slug: current.slug, materials: n },
      actorId: session.user.id,
    })

    return {
      ok: true as const,
      message:
        n > 0
          ? `Deleted “${current.name}”. ${n} ${n === 1 ? "material is" : "materials are"} now Uncategorised.`
          : `Deleted “${current.name}”.`,
    }
  })

  revalidatePath("/admin/categories")
  revalidatePath("/library")
  revalidatePath("/") // the home page counts and shows the newest material
  return result
}
