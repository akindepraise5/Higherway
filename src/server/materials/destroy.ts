import { eq, isNull, sql } from "drizzle-orm"
import { db } from "../../db"
import { materialPages, materials } from "../../db/schema"
import { txdb } from "../../db/tx"
import { pdfKey, thumbKey } from "../../lib/r2/keys"
import { audit } from "../audit"
import { deleteObject } from "../r2/client"

/**
 * Destroying a material: the row, and the bytes behind it.
 *
 * **This is the only thing in the project that truly deletes archive content.**
 * CLAUDE.md is explicit that nothing is deleted — archiving is a soft state with
 * a reason and an actor — and reserves this as an Owner's separate, deliberate
 * act. It is for a file that should never have been here: something that strayed
 * into the Drive folder, a mistaken submission, a scan of the wrong document.
 *
 * **It refuses anything that is not already archived.** Two decisions, not one.
 * Archiving asks why and is reversible; this is the second step and is not. A
 * single button that took a live material straight to nothing would make an
 * irreversible act available in one click from the same page as a typo fix.
 *
 * **Order matters, and the reason is recorded in STATUS.** The row and its audit
 * entry go first, in one transaction, and only then the R2 objects. If the
 * objects fail to delete, the result is orphaned bytes — litter, findable,
 * harmless. The other order risks a row whose file is already gone, which is a
 * material that exists, lists, and cannot be opened. Bytes nobody references are
 * better than a record that lies.
 */

export type DestroyPlan = {
  id: string
  title: string
  archived: boolean
  pages: number
  /** Every object that will be removed from R2. */
  keys: string[]
  /** Archived materials recorded as duplicates *of this one*. */
  pointedAtBy: number
  refuse?: string
}

export async function planDestroy(materialId: string): Promise<DestroyPlan | null> {
  const [material] = await db
    .select({
      id: materials.id,
      title: materials.title,
      archivedAt: materials.archivedAt,
      r2KeyPdf: materials.r2KeyPdf,
    })
    .from(materials)
    .where(eq(materials.id, materialId))
    .limit(1)

  if (!material) return null

  const pages = await db
    .select({ key: materialPages.r2KeyWebp })
    .from(materialPages)
    .where(eq(materialPages.materialId, materialId))

  const [pointed] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(materials)
    .where(eq(materials.duplicateOfId, materialId))

  /**
   * Both derived keys are included whether or not anything recorded them.
   * `thumbKey` is never stored on the row, and a rendering that half-finished
   * may have written page images the `material_pages` rows never captured.
   * Asking R2 to delete a key that does not exist costs nothing; leaving a file
   * behind because no row mentioned it is how orphans accumulate.
   */
  const keys = [
    material.r2KeyPdf ?? pdfKey(materialId),
    thumbKey(materialId),
    ...pages.map((p) => p.key).filter((k): k is string => Boolean(k)),
  ]

  return {
    id: material.id,
    title: material.title,
    archived: material.archivedAt !== null,
    pages: pages.length,
    keys: [...new Set(keys)],
    pointedAtBy: pointed?.n ?? 0,
    refuse: material.archivedAt
      ? undefined
      : "Take it out of the library first. Destroying is the second step, and it cannot be undone.",
  }
}

export type DestroyResult =
  | { ok: true; message: string; orphaned: string[] }
  | { ok: false; error: string }

export async function destroyMaterial(input: {
  materialId: string
  actorId: string
  /** Must match the title exactly. Checked here as well as in the dialog. */
  typed: string
}): Promise<DestroyResult> {
  const plan = await planDestroy(input.materialId)
  if (!plan) return { ok: false, error: "That material no longer exists." }
  if (plan.refuse) return { ok: false, error: plan.refuse }

  /**
   * Checked on the server too, not only in the dialog. A confirmation that
   * exists solely in the browser is a suggestion.
   */
  if (input.typed.trim() !== plan.title.trim()) {
    return { ok: false, error: "That is not the title. Nothing was destroyed." }
  }

  await txdb.transaction(async (tx) => {
    /**
     * Anything recorded as a duplicate *of this one* loses that pointer first.
     * `duplicate_of_id` has no foreign key, so nothing would clean it up: 83
     * archived materials point at 77 others, and leaving one aimed at a row
     * that no longer exists makes its page say "kept instead:" followed by
     * nothing.
     */
    await tx
      .update(materials)
      .set({ duplicateOfId: null })
      .where(eq(materials.duplicateOfId, plan.id))

    /**
     * Written **before** the delete, because the entry references the row it is
     * about and the whole snapshot is the only record left. Pages, chunks,
     * filings and duplicate pairs all cascade away with it.
     */
    await audit(tx, {
      action: "material.destroy",
      entityType: "material",
      entityId: plan.id,
      before: {
        title: plan.title,
        pages: plan.pages,
        objects: plan.keys.length,
        // Listed so orphaned bytes are findable if R2 refuses below.
        keys: plan.keys,
      },
      actorId: input.actorId,
    })

    await tx.delete(materials).where(eq(materials.id, plan.id))
  })

  /**
   * The bytes, after the record. A failure here leaves litter rather than a
   * material that cannot be opened, and the keys are in the audit entry above
   * so the litter can be found.
   */
  const orphaned: string[] = []
  for (const key of plan.keys) {
    try {
      await deleteObject(key)
    } catch {
      orphaned.push(key)
    }
  }

  return {
    ok: true,
    orphaned,
    message:
      orphaned.length === 0
        ? `“${plan.title}” is gone, along with ${plan.keys.length} file(s).`
        : `“${plan.title}” is gone, but ${orphaned.length} file(s) could not be removed from storage. They are listed in the activity trail.`,
  }
}

/** Materials the archive is keeping but nobody can open — for a sweep later. */
export async function materialsWithNoFile(): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(materials)
    .where(isNull(materials.r2KeyPdf))

  return row?.n ?? 0
}
