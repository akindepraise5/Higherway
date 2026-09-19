"use server"

import { and, eq, ne, sql } from "drizzle-orm"
import { revalidatePath } from "next/cache"
import { duplicatePairs, materialCategories, materials } from "../../db/schema"
import { txdb } from "../../db/tx"
import { requireRole } from "../../lib/session"
import { audit } from "../audit"

/**
 * Deciding what to do about a possible duplicate.
 *
 * Two outcomes only, and neither destroys anything:
 *
 *   dismiss  — these are not duplicates. Recorded so the pair never returns.
 *   resolve  — keep one, archive the other. The archived material stays in the
 *              database, marked as a duplicate of the one kept, and can be
 *              restored.
 *
 * Admin and above: resolving hides a material from the public library, which is
 * not an Editor's decision to make alone.
 */

export type DuplicateResult = { ok: true; message: string } | { ok: false; error: string }

/** These two are different materials. Remember it, so it is never raised again. */
export async function dismissPair(pairId: string): Promise<DuplicateResult> {
  const { session } = await requireRole("admin")

  const result = await txdb.transaction(async (tx) => {
    const [pair] = await tx
      .select()
      .from(duplicatePairs)
      .where(eq(duplicatePairs.id, pairId))
      .limit(1)
    if (!pair) return { ok: false as const, error: "That pair no longer exists." }
    if (pair.status !== "pending") {
      return { ok: false as const, error: "That pair has already been decided." }
    }

    await tx
      .update(duplicatePairs)
      .set({ status: "dismissed", decidedBy: session.user.id, decidedAt: new Date() })
      .where(eq(duplicatePairs.id, pairId))

    await audit(tx, {
      action: "duplicate.dismiss",
      entityType: "duplicate",
      entityId: pairId,
      before: { score: pair.score, signals: pair.signals },
      after: { status: "dismissed" },
      actorId: session.user.id,
    })

    return { ok: true as const, message: "Marked as different materials. It will not come back." }
  })

  revalidatePath("/admin/duplicates")
  return result
}

/**
 * Keep one, archive the other.
 *
 * The archived material keeps its file, its pages and its text — only its
 * visibility changes, and `duplicateOfId` records what it was judged a copy of.
 * Nothing is deleted, so a wrong call here costs a click to undo rather than a
 * trip to a backup.
 *
 * Its categories move to the keeper first. Someone filed that material under
 * those topics, and losing that work because the other copy happened to win
 * would be a quiet regression.
 */
export async function resolvePair(pairId: string, keepId: string): Promise<DuplicateResult> {
  const { session } = await requireRole("admin")

  const result = await txdb.transaction(async (tx) => {
    const [pair] = await tx
      .select()
      .from(duplicatePairs)
      .where(eq(duplicatePairs.id, pairId))
      .limit(1)
    if (!pair) return { ok: false as const, error: "That pair no longer exists." }
    if (pair.status !== "pending") {
      return { ok: false as const, error: "That pair has already been decided." }
    }

    const dropId = pair.materialAId === keepId ? pair.materialBId : pair.materialAId
    if (keepId !== pair.materialAId && keepId !== pair.materialBId) {
      return { ok: false as const, error: "That material is not part of this pair." }
    }

    const [keep] = await tx.select().from(materials).where(eq(materials.id, keepId)).limit(1)
    const [drop] = await tx.select().from(materials).where(eq(materials.id, dropId)).limit(1)
    if (!keep || !drop) return { ok: false as const, error: "One of those no longer exists." }
    if (drop.archivedAt) return { ok: false as const, error: "That one is already archived." }

    // Carry filings across, skipping any the keeper already has so the join
    // table never collides on its composite key.
    const moved = await tx.execute(sql`
      insert into material_categories (material_id, category_id, ordinal, assigned_by)
      select ${keepId}, mc.category_id, mc.ordinal, mc.assigned_by
        from material_categories mc
       where mc.material_id = ${dropId}
         and not exists (
           select 1 from material_categories k
            where k.material_id = ${keepId} and k.category_id = mc.category_id
         )`)

    await tx.delete(materialCategories).where(eq(materialCategories.materialId, dropId))

    // Reading counts follow the material people will now find.
    await tx
      .update(materials)
      .set({
        viewCount: sql`${materials.viewCount} + ${drop.viewCount}`,
        downloadCount: sql`${materials.downloadCount} + ${drop.downloadCount}`,
        updatedAt: new Date(),
      })
      .where(eq(materials.id, keepId))

    await tx
      .update(materials)
      .set({
        status: "archived",
        archivedAt: new Date(),
        duplicateOfId: keepId,
        updatedAt: new Date(),
      })
      .where(eq(materials.id, dropId))

    // Any other pending pair involving the archived material is moot now.
    await tx
      .update(duplicatePairs)
      .set({ status: "dismissed", decidedBy: session.user.id, decidedAt: new Date() })
      .where(
        and(
          ne(duplicatePairs.id, pairId),
          eq(duplicatePairs.status, "pending"),
          sql`(${duplicatePairs.materialAId} = ${dropId} or ${duplicatePairs.materialBId} = ${dropId})`,
        ),
      )

    await tx
      .update(duplicatePairs)
      .set({ status: "merged", decidedBy: session.user.id, decidedAt: new Date() })
      .where(eq(duplicatePairs.id, pairId))

    await audit(tx, {
      action: "duplicate.merge",
      entityType: "duplicate",
      entityId: pairId,
      before: { kept: keep.title, archived: drop.title, score: pair.score },
      after: {
        keptId: keepId,
        archivedId: dropId,
        filingsMoved: moved.rowCount ?? 0,
      },
      actorId: session.user.id,
    })

    /**
     * A second entry, against the **material** that was archived.
     *
     * The one above is filed against the pair, which is right for "this pair was
     * decided" — but it left the archived material's own history saying nothing
     * about the largest thing that ever happened to it. 82 materials here are
     * archived by a merge and not one of them can explain itself from its own
     * page. Whoever opens a material should not have to know that duplicate
     * pairs exist in order to find out why it is gone.
     */
    await audit(tx, {
      action: "material.archive",
      entityType: "material",
      entityId: dropId,
      after: {
        status: "archived",
        name: drop.title,
        reason: `A duplicate of “${keep.title}”, which was kept instead.`,
      },
      actorId: session.user.id,
    })

    return {
      ok: true as const,
      message: `Kept “${keep.title}”. “${drop.title}” is archived and can be restored.`,
    }
  })

  revalidatePath("/admin/duplicates")
  revalidatePath("/library")
  revalidatePath("/") // the home page counts and shows the newest material
  return result
}

/** Put an archived material back. Nothing was destroyed, so this is cheap. */
export async function restoreMaterial(materialId: string): Promise<DuplicateResult> {
  const { session } = await requireRole("admin")

  const result = await txdb.transaction(async (tx) => {
    const [material] = await tx
      .select()
      .from(materials)
      .where(eq(materials.id, materialId))
      .limit(1)
    if (!material) return { ok: false as const, error: "That material no longer exists." }
    if (!material.archivedAt) return { ok: false as const, error: "It is not archived." }

    await tx
      .update(materials)
      .set({
        status: "published",
        archivedAt: null,
        duplicateOfId: null,
        updatedAt: new Date(),
      })
      .where(eq(materials.id, materialId))

    await audit(tx, {
      action: "material.restore",
      entityType: "material",
      entityId: materialId,
      before: { archived: true, duplicateOf: material.duplicateOfId },
      after: { archived: false },
      actorId: session.user.id,
    })

    return { ok: true as const, message: `“${material.title}” is back in the library.` }
  })

  revalidatePath("/admin/duplicates")
  revalidatePath("/admin/materials")
  revalidatePath("/library")
  revalidatePath("/") // the home page counts and shows the newest material
  return result
}
