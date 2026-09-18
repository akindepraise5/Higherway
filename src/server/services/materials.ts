"use server"

import { randomUUID } from "node:crypto"
import { and, eq, inArray, sql } from "drizzle-orm"
import { revalidatePath } from "next/cache"
import { categories, materialCategories, materials } from "../../db/schema"
import { txdb } from "../../db/tx"
import { hasRole, requireRole, requireSession } from "../../lib/session"
import { slugify } from "../../lib/slug"
import { audit } from "../audit"
import { destroyMaterial } from "../materials/destroy"

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
  return fileUnder(materialId, input, false)
}

/**
 * File a material under a topic the machine proposed.
 *
 * A separate action rather than a flag on `assignCategory`, because the flag
 * would be set by the browser — and "a machine suggested this" is a claim about
 * the archive's provenance that a form post should not be able to make. Here it
 * is the server that knows, because this is the only door that sets it.
 *
 * It records `suggested` on the join row, so the trail can always distinguish a
 * topic a person chose from one they merely agreed with. Nothing files itself:
 * `suggestTopics` proposes, an editor presses accept, and that press is what
 * writes the row.
 */
export async function acceptSuggestedCategory(
  materialId: string,
  categoryId: string,
): Promise<MaterialResult> {
  return fileUnder(materialId, { categoryId }, true)
}

async function fileUnder(
  materialId: string,
  input: { categoryId?: string; newName?: string },
  fromSuggestion: boolean,
): Promise<MaterialResult> {
  const session = await requireSession()
  const role = (session.user as { role?: "owner" | "admin" | "editor" }).role

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
        /**
         * Filing is every editor's daily work, but *creating* a topic is
         * Owner-only — it adds a public URL and a shelf to the library.
         *
         * This refuses with a message rather than calling `requireRole`, which
         * redirects: being thrown out of the page to the admin home, mid-file,
         * with no explanation is a worse answer than being told why.
         */
        if (!hasRole(role, "owner")) {
          return {
            ok: false as const,
            error: `There is no topic called “${name}” yet, and only an Owner can add one.`,
          }
        }

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
      // Still the person: they accepted it. `suggested` records that a machine
      // proposed it, not that a machine decided it.
      assignedBy: session.user.id,
      suggested: fromSuggestion ? new Date() : null,
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
      // The title is not what changed. Recording it here made every filing read
      // as though someone had edited the title.
      after: {
        topic: category?.name,
        created: createdName ?? undefined,
        via: fromSuggestion ? "suggestion" : undefined,
      },
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
      action: "material.uncategorise",
      entityType: "material",
      entityId: materialId,
      before: { topic: category?.name },
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

/**
 * Publishing, and taking something back out of the library.
 *
 * Gated at Admin rather than Editor. Filing a material is daily work; deciding
 * what the archive says in public is not the same kind of act.
 *
 * `duplicates.ts` has its own restore and this is deliberately not it: that one
 * also clears `duplicateOfId`, because it means "this was not a duplicate after
 * all". Reusing it here would quietly undo a duplicate judgement as a
 * side-effect of unarchiving.
 *
 * Nothing here destroys anything, and archiving keeps the slug — the unique
 * indexes cover live rows only, so an archived row needs no renaming.
 */
export async function publishMaterial(materialId: string): Promise<MaterialResult> {
  const { session } = await requireRole("admin")

  let slug: string | null = null

  const result = await txdb.transaction(async (tx) => {
    const [material] = await tx
      .select()
      .from(materials)
      .where(eq(materials.id, materialId))
      .limit(1)
    if (!material) return { ok: false as const, error: "That material no longer exists." }
    if (material.archivedAt) {
      return { ok: false as const, error: "It is archived. Restore it first." }
    }
    if (material.status === "published") {
      return { ok: false as const, error: "It is already published." }
    }
    // A record with no file behind it would publish a page that cannot be read.
    if (!material.r2KeyPdf) {
      return { ok: false as const, error: "It has no file yet, so there is nothing to publish." }
    }

    slug = material.slug

    await tx
      .update(materials)
      .set({
        status: "published",
        // Keep the first publication date if it has one — republishing is not
        // the same event as publishing, and the library sorts on this.
        publishedAt: material.publishedAt ?? new Date(),
        updatedAt: new Date(),
      })
      .where(eq(materials.id, materialId))

    await audit(tx, {
      action: "material.publish",
      entityType: "material",
      entityId: materialId,
      before: { status: material.status },
      after: { status: "published", name: material.title },
      actorId: session.user.id,
    })

    return { ok: true as const, message: `“${material.title}” is now in the library.` }
  })

  revalidatePath(`/admin/materials/${materialId}`)
  revalidatePath("/admin/materials")
  revalidatePath("/library")
  if (slug) revalidatePath(`/m/${slug}`)
  return result
}

/**
 * Take a material out of public view. Reversible, and never a deletion.
 *
 * The reason is required because CLAUDE.md defines archiving as a soft state
 * with a reason and an actor — an archived material with no explanation is the
 * thing nobody can safely undo a year later.
 */
export async function archiveMaterial(materialId: string, reason: string): Promise<MaterialResult> {
  const { session } = await requireRole("admin")

  const why = reason.trim()
  if (why.length < 3) {
    return { ok: false, error: "Say why it is being archived — it is what makes it undoable." }
  }

  let slug: string | null = null

  const result = await txdb.transaction(async (tx) => {
    const [material] = await tx
      .select()
      .from(materials)
      .where(eq(materials.id, materialId))
      .limit(1)
    if (!material) return { ok: false as const, error: "That material no longer exists." }
    if (material.archivedAt) return { ok: false as const, error: "It is already archived." }

    slug = material.slug

    await tx
      .update(materials)
      .set({ status: "archived", archivedAt: new Date(), updatedAt: new Date() })
      .where(eq(materials.id, materialId))

    await audit(tx, {
      action: "material.archive",
      entityType: "material",
      entityId: materialId,
      before: { status: material.status },
      after: { status: "archived", name: material.title, reason: why },
      actorId: session.user.id,
    })

    return { ok: true as const, message: `“${material.title}” is out of the library.` }
  })

  revalidatePath(`/admin/materials/${materialId}`)
  revalidatePath("/admin/materials")
  revalidatePath("/library")
  if (slug) revalidatePath(`/m/${slug}`)
  return result
}

/**
 * Put an archived material back.
 *
 * It returns to `review` rather than straight to the library: something was
 * archived for a reason, and whoever brings it back should say it belongs
 * before the public sees it again.
 */
export async function unarchiveMaterial(materialId: string): Promise<MaterialResult> {
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
      .set({ status: "review", archivedAt: null, updatedAt: new Date() })
      .where(eq(materials.id, materialId))

    await audit(tx, {
      action: "material.restore",
      entityType: "material",
      entityId: materialId,
      before: { status: "archived" },
      after: { status: "review", name: material.title },
      actorId: session.user.id,
    })

    return {
      ok: true as const,
      message: `“${material.title}” is back, waiting to be published.`,
    }
  })

  revalidatePath(`/admin/materials/${materialId}`)
  revalidatePath("/admin/materials")
  return result
}

/**
 * The same actions, over a selection.
 *
 * **Why these exist.** 314 published materials have no topic, and filing them
 * one at a time means one page load, one picker and one round trip each. The
 * backlog is the archive's main outstanding job and the interface was making it
 * a thousand small errands.
 *
 * Three rules, and they are what keep bulk safe rather than fast:
 *
 * 1. **One audit entry per material**, exactly as if each had been done by hand.
 *    A single "filed 40 materials" entry would record the *operation* and not
 *    the *changes*, and the trail's job is to answer "why is this material here",
 *    material by material. This project has already learned that the hard way:
 *    `mergeCategory` moved 42 materials with one UPDATE and recorded how many
 *    moved but not which, and only the v1 spreadsheet made it recoverable.
 * 2. **One transaction.** Either the selection is done or none of it is — a
 *    half-applied bulk action leaves nobody able to say what happened.
 * 3. **Skipping is not failing.** A material already filed there, or already
 *    published, is counted and stepped over rather than aborting the other
 *    thirty-nine. The result says how many were changed and how many were left.
 */

export type BulkResult =
  | { ok: true; changed: number; skipped: number; message: string }
  | { ok: false; error: string }

/**
 * The most a single action may touch.
 *
 * A page of the admin list is 40, so this covers "select everything on screen"
 * with room to spare, and refuses anything that could only have come from a
 * crafted request. It is also a real safety rail: the whole point of the
 * confirmation on category merge is that a wide, silent change is the dangerous
 * kind.
 */
const MAX_BULK = 100

const cleanIds = (ids: string[]): string[] =>
  [...new Set(ids)].filter((id) => UUID_PATTERN.test(id)).slice(0, MAX_BULK)

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** File a selection under one topic. Editor work, like filing one. */
export async function fileManyUnder(
  materialIds: string[],
  categoryId: string,
): Promise<BulkResult> {
  const session = await requireSession()
  const ids = cleanIds(materialIds)
  if (ids.length === 0) return { ok: false, error: "Nothing was selected." }
  if (!UUID_PATTERN.test(categoryId)) return { ok: false, error: "That is not a topic." }

  const result = await txdb.transaction(async (tx) => {
    const [topic] = await tx
      .select({ id: categories.id, name: categories.name })
      .from(categories)
      .where(eq(categories.id, categoryId))
      .limit(1)
    if (!topic) return { ok: false as const, error: "That topic no longer exists." }

    const rows = await tx
      .select({ id: materials.id, title: materials.title })
      .from(materials)
      .where(inArray(materials.id, ids))

    const already = await tx
      .select({ materialId: materialCategories.materialId })
      .from(materialCategories)
      .where(
        and(
          eq(materialCategories.categoryId, categoryId),
          inArray(materialCategories.materialId, ids),
        ),
      )
    const filed = new Set(already.map((r) => r.materialId))

    let changed = 0
    for (const material of rows) {
      if (filed.has(material.id)) continue

      // Ordinal per material, not a shared counter: it decides which topic's
      // colours a cover wears, and that is a fact about the material.
      const [{ next }] = await tx
        .select({ next: sql<number>`coalesce(max(${materialCategories.ordinal}), -1) + 1` })
        .from(materialCategories)
        .where(eq(materialCategories.materialId, material.id))

      await tx.insert(materialCategories).values({
        materialId: material.id,
        categoryId,
        ordinal: next,
        assignedBy: session.user.id,
      })

      await audit(tx, {
        action: "material.categorise",
        entityType: "material",
        entityId: material.id,
        after: { topic: topic.name, inBulk: ids.length },
        actorId: session.user.id,
      })
      changed++
    }

    const skipped = ids.length - changed
    return {
      ok: true as const,
      changed,
      skipped,
      message:
        changed === 0
          ? `All ${ids.length} were already filed under “${topic.name}”.`
          : `Filed ${changed} under “${topic.name}”${skipped > 0 ? `, ${skipped} already were` : ""}.`,
    }
  })

  revalidatePath("/admin/materials")
  revalidatePath("/library")
  return result
}

/** Publish a selection. Admin work, like publishing one. */
export async function publishMany(materialIds: string[]): Promise<BulkResult> {
  const { session } = await requireRole("admin")
  const ids = cleanIds(materialIds)
  if (ids.length === 0) return { ok: false, error: "Nothing was selected." }

  const result = await txdb.transaction(async (tx) => {
    const rows = await tx
      .select({
        id: materials.id,
        title: materials.title,
        status: materials.status,
        archivedAt: materials.archivedAt,
        r2KeyPdf: materials.r2KeyPdf,
        publishedAt: materials.publishedAt,
      })
      .from(materials)
      .where(inArray(materials.id, ids))

    let changed = 0
    for (const material of rows) {
      // The same three refusals as publishing one, applied per material rather
      // than to the batch: one archived material in a selection of forty must
      // not stop the other thirty-nine.
      if (material.archivedAt) continue
      if (material.status === "published") continue
      if (!material.r2KeyPdf) continue

      await tx
        .update(materials)
        .set({
          status: "published",
          publishedAt: material.publishedAt ?? new Date(),
          updatedAt: new Date(),
        })
        .where(eq(materials.id, material.id))

      await audit(tx, {
        action: "material.publish",
        entityType: "material",
        entityId: material.id,
        before: { status: material.status },
        after: { status: "published", name: material.title, inBulk: ids.length },
        actorId: session.user.id,
      })
      changed++
    }

    const skipped = ids.length - changed
    return {
      ok: true as const,
      changed,
      skipped,
      message:
        changed === 0
          ? "None of those could be published — they are archived, already out, or have no file."
          : `Published ${changed}${skipped > 0 ? `, skipped ${skipped} that could not be` : ""}.`,
    }
  })

  revalidatePath("/admin/materials")
  revalidatePath("/library")
  return result
}

/**
 * Take a selection out of the library. Admin work, and the reason is required.
 *
 * Asked for in the dialog rather than collected afterwards, for the same reason
 * the single version does: a reason collected afterwards is one nobody writes.
 * Over forty materials at once it matters more, not less — this is the action
 * whose blast radius is widest and whose trail has to carry the most.
 */
export async function archiveMany(materialIds: string[], reason: string): Promise<BulkResult> {
  const { session } = await requireRole("admin")
  const ids = cleanIds(materialIds)
  if (ids.length === 0) return { ok: false, error: "Nothing was selected." }

  const why = reason.trim()
  if (why.length < 3) return { ok: false, error: "Say why, in a few words at least." }

  const result = await txdb.transaction(async (tx) => {
    const rows = await tx
      .select({ id: materials.id, title: materials.title, archivedAt: materials.archivedAt })
      .from(materials)
      .where(inArray(materials.id, ids))

    let changed = 0
    for (const material of rows) {
      if (material.archivedAt) continue

      await tx
        .update(materials)
        .set({ status: "archived", archivedAt: new Date(), updatedAt: new Date() })
        .where(eq(materials.id, material.id))

      await audit(tx, {
        action: "material.archive",
        entityType: "material",
        entityId: material.id,
        after: { status: "archived", name: material.title, reason: why, inBulk: ids.length },
        actorId: session.user.id,
      })
      changed++
    }

    const skipped = ids.length - changed
    return {
      ok: true as const,
      changed,
      skipped,
      message:
        changed === 0
          ? "They were all archived already."
          : `Took ${changed} out of the library${skipped > 0 ? `, ${skipped} already were` : ""}. Each can be restored.`,
    }
  })

  revalidatePath("/admin/materials")
  revalidatePath("/library")
  return result
}

/**
 * Destroy a material and its files. Owner only, and only once archived.
 *
 * The logic is in `server/materials/destroy.ts`, which also re-checks the typed
 * title — a confirmation that lives only in the browser is a suggestion.
 */
export async function destroyMaterialAction(
  materialId: string,
  typed: string,
): Promise<MaterialResult> {
  const { session } = await requireRole("owner")

  const result = await destroyMaterial({ materialId, actorId: session.user.id, typed })

  revalidatePath("/admin/materials")
  revalidatePath("/library")
  return result.ok ? { ok: true, message: result.message } : { ok: false, error: result.error }
}
