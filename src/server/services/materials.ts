"use server"

import { randomUUID } from "node:crypto"
import { and, eq, sql } from "drizzle-orm"
import { revalidatePath } from "next/cache"
import { categories, materialCategories, materials } from "../../db/schema"
import { txdb } from "../../db/tx"
import { requireSession } from "../../lib/session"
import { slugify } from "../../lib/slug"
import { audit } from "../audit"

/**
 * Editing a material.
 *
 * Filing is an Editor's daily work — 367 of the 651 imported materials arrived
 * with no topic at all, because the v1 spreadsheet said "Review manually" — so
 * none of this is gated above Editor. Only actions that hide a material from
 * the public library need a higher role, and those live elsewhere.
 *
 * Every function runs in a transaction that also writes its audit entry.
 */

export type MaterialResult = { ok: true; message: string } | { ok: false; error: string }

/**
 * Put a material on a topic, creating the topic if it does not exist yet.
 *
 * Creating from here matters: an editor filing a material should not have to
 * leave the page, go to Categories, make the topic, and come back. That detour
 * is how things end up uncategorised.
 */
export async function assignCategory(
  materialId: string,
  input: { categoryId?: string; newName?: string },
): Promise<MaterialResult> {
  const session = await requireSession()

  const result = await txdb.transaction(async (tx) => {
    const [material] = await tx
      .select()
      .from(materials)
      .where(eq(materials.id, materialId))
      .limit(1)
    if (!material) return { ok: false as const, error: "That material no longer exists." }

    let categoryId = input.categoryId
    let createdName: string | null = null

    if (!categoryId) {
      const name = input.newName?.trim()
      if (!name || name.length < 2) {
        return { ok: false as const, error: "A topic name needs at least two characters." }
      }

      const slug = slugify(name)
      const [existing] = await tx
        .select({ id: categories.id })
        .from(categories)
        .where(eq(categories.slug, slug))
        .limit(1)

      if (existing) {
        categoryId = existing.id
      } else {
        categoryId = randomUUID()
        await tx.insert(categories).values({ id: categoryId, name, slug })
        createdName = name

        await audit(tx, {
          action: "category.create",
          entityType: "category",
          entityId: categoryId,
          after: { name, slug, createdWhileFiling: material.title },
          actorId: session.user.id,
        })
      }
    }

    const [already] = await tx
      .select({ id: materialCategories.categoryId })
      .from(materialCategories)
      .where(
        and(
          eq(materialCategories.materialId, materialId),
          eq(materialCategories.categoryId, categoryId),
        ),
      )
      .limit(1)

    if (already) return { ok: false as const, error: "It is already filed there." }

    // Ordinal keeps "first topic" meaningful — it decides the cover's colours.
    const [{ next }] = await tx
      .select({ next: sql<number>`coalesce(max(${materialCategories.ordinal}), -1) + 1` })
      .from(materialCategories)
      .where(eq(materialCategories.materialId, materialId))

    await tx.insert(materialCategories).values({
      materialId,
      categoryId,
      ordinal: next,
      assignedBy: session.user.id,
    })

    const [category] = await tx
      .select({ name: categories.name })
      .from(categories)
      .where(eq(categories.id, categoryId))
      .limit(1)

    await audit(tx, {
      action: "material.categorise",
      entityType: "material",
      entityId: materialId,
      before: { title: material.title },
      after: { added: category?.name, created: createdName ?? undefined },
      actorId: session.user.id,
    })

    return {
      ok: true as const,
      message: createdName
        ? `Created “${createdName}” and filed it there.`
        : `Filed under “${category?.name}”.`,
    }
  })

  revalidatePath(`/admin/materials/${materialId}`)
  revalidatePath("/admin/materials")
  revalidatePath("/library")
  return result
}

/** Take a material off a topic. The topic itself is untouched. */
export async function unassignCategory(
  materialId: string,
  categoryId: string,
): Promise<MaterialResult> {
  const session = await requireSession()

  const result = await txdb.transaction(async (tx) => {
    const [category] = await tx
      .select({ name: categories.name })
      .from(categories)
      .where(eq(categories.id, categoryId))
      .limit(1)

    await tx
      .delete(materialCategories)
      .where(
        and(
          eq(materialCategories.materialId, materialId),
          eq(materialCategories.categoryId, categoryId),
        ),
      )

    await audit(tx, {
      action: "material.categorise",
      entityType: "material",
      entityId: materialId,
      before: { had: category?.name },
      after: { removed: category?.name },
      actorId: session.user.id,
    })

    return { ok: true as const, message: `Removed from “${category?.name}”.` }
  })

  revalidatePath(`/admin/materials/${materialId}`)
  revalidatePath("/admin/materials")
  revalidatePath("/library")
  return result
}

/** Correct a title, author or summary. */
export async function updateMaterial(
  materialId: string,
  fields: { title?: string; author?: string; summary?: string },
): Promise<MaterialResult> {
  const session = await requireSession()

  const title = fields.title?.trim()
  if (title !== undefined && title.length < 2) {
    return { ok: false, error: "A title needs at least two characters." }
  }

  const result = await txdb.transaction(async (tx) => {
    const [material] = await tx
      .select()
      .from(materials)
      .where(eq(materials.id, materialId))
      .limit(1)
    if (!material) return { ok: false as const, error: "That material no longer exists." }

    const next = {
      title: title ?? material.title,
      author: fields.author?.trim() || null,
      summary: fields.summary?.trim() || null,
    }

    await tx
      .update(materials)
      .set({ ...next, updatedAt: new Date() })
      .where(eq(materials.id, materialId))

    await audit(tx, {
      action: "material.update",
      entityType: "material",
      entityId: materialId,
      before: { title: material.title, author: material.author, summary: material.summary },
      after: next,
      actorId: session.user.id,
    })

    return { ok: true as const, message: "Saved." }
  })

  revalidatePath(`/admin/materials/${materialId}`)
  revalidatePath("/admin/materials")
  revalidatePath("/library")
  return result
}

/**
 * Show or hide the OCR text on the public page.
 *
 * It is shown by default because it is what makes a photographed page findable
 * at all, but a bad read is worth hiding until someone can re-run it.
 */
export async function setTextPublic(
  materialId: string,
  textPublic: boolean,
): Promise<MaterialResult> {
  const session = await requireSession()

  // The public page is keyed by slug, not id, so revalidating it needs the slug
  // the transaction read — /m/<id> is a path that does not exist.
  let slug: string | null = null

  const result = await txdb.transaction(async (tx) => {
    const [material] = await tx
      .select()
      .from(materials)
      .where(eq(materials.id, materialId))
      .limit(1)
    if (!material) return { ok: false as const, error: "That material no longer exists." }
    slug = material.slug

    await tx
      .update(materials)
      .set({ textPublic, updatedAt: new Date() })
      .where(eq(materials.id, materialId))

    await audit(tx, {
      action: "material.text_visibility",
      entityType: "material",
      entityId: materialId,
      before: { textPublic: material.textPublic },
      after: { textPublic },
      actorId: session.user.id,
    })

    return {
      ok: true as const,
      message: textPublic ? "The text is shown on the public page." : "The text is hidden.",
    }
  })

  revalidatePath(`/admin/materials/${materialId}`)
  if (slug) revalidatePath(`/m/${slug}`)
  return result
}
