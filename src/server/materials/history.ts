import { and, desc, eq, inArray, sql } from "drizzle-orm"
import { db } from "../../db"
import { auditLog, materials, user } from "../../db/schema"
import type { AuditAction } from "../audit"

/**
 * Who last touched a material, and when.
 *
 * Read from the audit trail rather than a column on the material, because the
 * trail is written inside the same transaction as every change — a
 * `lastEditedBy` column would be a second record of the same fact, free to
 * drift from it.
 */

/**
 * Audit actions in the words an admin would use.
 *
 * The stored strings are machine-shaped on purpose — they are matched on and
 * must not drift — so the human phrasing lives here rather than in the trail.
 *
 * Typed to the union, not `Record<string, string>`: keyed loosely it happily
 * accepted five actions that do not exist while missing nine that do, and
 * nothing complained. Adding a case to `AuditAction` must break this file.
 */
export const ACTION_LABEL: Record<AuditAction, string> = {
  "sync.clear": "Sync cleared",
  "category.create": "Topic created",
  "category.rename": "Topic renamed",
  "category.merge": "Topics merged",
  "category.unmerge": "Merge undone",
  "category.delete": "Topic deleted",
  "material.create": "Added",
  "material.publish": "Published",
  "material.archive": "Archived",
  "material.restore": "Restored",
  "material.update": "Details edited",
  "material.categorise": "Added to a topic",
  "material.uncategorise": "Removed from a topic",
  "material.text_visibility": "Text visibility changed",
  "material.destroy": "Destroyed",
  "duplicate.dismiss": "Marked not a duplicate",
  "duplicate.merge": "Duplicate merged",
  "invitation.create": "Invitation sent",
  "invitation.revoke": "Invitation revoked",
  "invitation.accept": "Invitation accepted",
  "user.role_change": "Role changed",
  "user.disable": "Account disabled",
  "user.enable": "Account enabled",
  "user.delete": "Account deleted",
  "sync.run": "Pulled from Drive",
}

/**
 * The trail comes back from the database as plain strings, so look up through
 * this rather than indexing the map directly — an action written before a label
 * existed should show as itself, not as `undefined`.
 */
export const actionLabel = (action: string) => ACTION_LABEL[action as AuditAction] ?? action

export type LastChange = {
  action: string
  at: Date
  byName: string | null
  byEmail: string | null
  /** Carried so the table can say *which* topic, not just "a topic". */
  before: unknown
  after: unknown
}

/**
 * The most recent entry for each of these materials, in one query.
 *
 * One query for the whole page rather than one per row: the table shows 24
 * materials at a time, and 24 round trips to Neon for a timestamp is a
 * noticeable page. Sorting by material then time means the first row seen for
 * each id is its latest, so the loop below keeps that one and skips the rest.
 */
export async function lastChanges(materialIds: string[]): Promise<Map<string, LastChange>> {
  if (materialIds.length === 0) return new Map()

  const rows = await db
    .select({
      entityId: auditLog.entityId,
      action: auditLog.action,
      at: auditLog.createdAt,
      byName: user.name,
      byEmail: user.email,
      before: auditLog.before,
      after: auditLog.after,
    })
    .from(auditLog)
    .leftJoin(user, eq(user.id, auditLog.actorId))
    .where(and(eq(auditLog.entityType, "material"), inArray(auditLog.entityId, materialIds)))
    .orderBy(auditLog.entityId, desc(auditLog.createdAt))

  const byMaterial = new Map<string, LastChange>()
  for (const row of rows) {
    if (!row.entityId || byMaterial.has(row.entityId)) continue
    byMaterial.set(row.entityId, {
      action: row.action,
      at: row.at,
      byName: row.byName,
      byEmail: row.byEmail,
      before: row.before,
      after: row.after,
    })
  }
  return byMaterial
}

/**
 * Everyone who has touched one material, most recent first — the contributor
 * list for its detail page.
 */
export async function contributors(materialId: string) {
  const rows = await db
    .select({
      name: user.name,
      email: user.email,
      // A string, not a Date. Drizzle parses timestamps via the column's
      // mapper, and a raw sql<> fragment has none — max() arrives as
      // "2026-09-16 03:17:18.882198+00". Typing it Date compiles and then
      // throws the first time anyone calls .toISOString() on it.
      last: sql<string>`max(${auditLog.createdAt})`,
      changes: sql<number>`count(*)::int`,
    })
    .from(auditLog)
    .innerJoin(user, eq(user.id, auditLog.actorId))
    .where(sql`${auditLog.entityType} = 'material' and ${auditLog.entityId} = ${materialId}`)
    .groupBy(user.id, user.name, user.email)
    .orderBy(desc(sql`max(${auditLog.createdAt})`))

  return rows
}

/** The full history of one material, for its detail page. */
export async function materialHistory(materialId: string, limit = 20) {
  return db
    .select({
      id: auditLog.id,
      action: auditLog.action,
      before: auditLog.before,
      after: auditLog.after,
      at: auditLog.createdAt,
      byName: user.name,
    })
    .from(auditLog)
    .leftJoin(user, eq(user.id, auditLog.actorId))
    .where(sql`${auditLog.entityType} = 'material' and ${auditLog.entityId} = ${materialId}`)
    .orderBy(desc(auditLog.createdAt))
    .limit(limit)
}

/**
 * Why a material was taken out of the library, and what it duplicates.
 *
 * Both facts have always been recorded and **neither was shown anywhere**. The
 * reason is collected in the archive dialog precisely so it exists — "a reason
 * collected afterwards is one nobody writes" — and it went straight into the
 * audit trail and out of sight. `duplicate_of_id` is set by the duplicate review
 * and by an ingest that refuses a copy, and pointed at nothing a person could
 * follow.
 *
 * The reason comes from the trail rather than a column because that is where it
 * is, and adding a column would be a second copy of the same fact, free to
 * drift. The most recent `material.archive` entry is the operative one: a
 * material can be archived, restored and archived again for a different reason.
 */
export async function whyArchived(materialId: string): Promise<{
  reason: string | null
  by: { name: string | null; email: string | null } | null
  at: Date | null
  duplicateOf: { id: string; title: string; slug: string; live: boolean } | null
}> {
  const [entry] = await db
    .select({
      after: auditLog.after,
      at: auditLog.createdAt,
      byName: user.name,
      byEmail: user.email,
    })
    .from(auditLog)
    .leftJoin(user, eq(user.id, auditLog.actorId))
    .where(
      and(
        eq(auditLog.entityType, "material"),
        eq(auditLog.entityId, materialId),
        eq(auditLog.action, "material.archive"),
      ),
    )
    .orderBy(desc(auditLog.createdAt))
    .limit(1)

  const after = (entry?.after ?? null) as { reason?: unknown } | null
  let reason = typeof after?.reason === "string" && after.reason.trim() ? after.reason : null
  let by = entry ? { name: entry.byName, email: entry.byEmail } : null
  let at = entry?.at ?? null

  /**
   * Fall back to the duplicate review's own entry.
   *
   * A merge writes `material.archive` against the material *now*, but the 82
   * materials archived before that only have `duplicate.merge` filed against the
   * **pair** — so looking only at the material's own entries finds nothing for
   * almost every archived material in the archive. This reads the pair entry by
   * the id it recorded.
   */
  if (!reason) {
    const [merged] = await db
      .select({
        before: auditLog.before,
        at: auditLog.createdAt,
        byName: user.name,
        byEmail: user.email,
      })
      .from(auditLog)
      .leftJoin(user, eq(user.id, auditLog.actorId))
      .where(
        and(
          eq(auditLog.action, "duplicate.merge"),
          sql`${auditLog.after}->>'archivedId' = ${materialId}`,
        ),
      )
      .orderBy(desc(auditLog.createdAt))
      .limit(1)

    if (merged) {
      const kept = (merged.before as { kept?: unknown } | null)?.kept
      reason =
        typeof kept === "string"
          ? `A duplicate of “${kept}”, which was kept instead.`
          : "Merged with a duplicate."
      by = { name: merged.byName, email: merged.byEmail }
      at = merged.at
    }
  }

  const [self] = await db
    .select({ duplicateOfId: materials.duplicateOfId })
    .from(materials)
    .where(eq(materials.id, materialId))
    .limit(1)

  let duplicateOf: { id: string; title: string; slug: string; live: boolean } | null = null
  if (self?.duplicateOfId) {
    const [twin] = await db
      .select({
        id: materials.id,
        title: materials.title,
        slug: materials.slug,
        archivedAt: materials.archivedAt,
      })
      .from(materials)
      .where(eq(materials.id, self.duplicateOfId))
      .limit(1)

    if (twin) {
      duplicateOf = {
        id: twin.id,
        title: twin.title,
        slug: twin.slug,
        // Worth saying. "Kept instead of this one" is only true while the other
        // one is actually still in the library.
        live: twin.archivedAt === null,
      }
    }
  }

  return { reason, by, at, duplicateOf }
}
