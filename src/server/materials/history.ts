import { and, desc, eq, inArray, sql } from "drizzle-orm"
import { db } from "../../db"
import { auditLog, user } from "../../db/schema"
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
  "category.create": "Topic created",
  "category.rename": "Topic renamed",
  "category.merge": "Topics merged",
  "category.unmerge": "Merge undone",
  "category.delete": "Topic deleted",
  "material.publish": "Published",
  "material.archive": "Archived",
  "material.restore": "Restored",
  "material.update": "Details edited",
  "material.categorise": "Added to a topic",
  "material.uncategorise": "Removed from a topic",
  "material.text_visibility": "Text visibility changed",
  "duplicate.dismiss": "Marked not a duplicate",
  "duplicate.merge": "Duplicate merged",
  "invitation.create": "Invitation sent",
  "invitation.revoke": "Invitation revoked",
  "invitation.accept": "Invitation accepted",
  "user.role_change": "Role changed",
  "user.disable": "Account disabled",
  "user.enable": "Account enabled",
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
