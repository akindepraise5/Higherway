import { and, desc, eq, type SQL, sql } from "drizzle-orm"
import { db } from "../db"
import { auditLog, user } from "../db/schema"
import type { AuditAction } from "./audit"

/**
 * Reading the audit trail.
 *
 * `server/audit.ts` only writes; this only reads. The split matters because a
 * page that can read the trail should never be able to amend it.
 *
 * Entries are described in plain words rather than printed as raw action
 * strings: an audit log nobody can read at a glance is a log nobody reads.
 */

export const ACTIVITY_PAGE_SIZE = 50

export type ActivityRow = {
  id: string
  action: string
  entityType: string
  entityId: string | null
  before: unknown
  after: unknown
  ip: string | null
  createdAt: Date
  actorName: string | null
  actorEmail: string | null
}

/**
 * How each action reads in a sentence. Kept here rather than in the component
 * so the wording is in one place, and so an unmapped action falls back to
 * something legible instead of showing a bare identifier.
 */
const PHRASING: Record<AuditAction, string> = {
  "category.create": "created the topic",
  "category.rename": "renamed a topic",
  "category.merge": "merged a topic into another",
  "category.unmerge": "reversed a topic merge",
  "category.delete": "deleted a topic",
  "material.publish": "published",
  "material.archive": "archived",
  "material.restore": "restored",
  "material.update": "edited",
  "material.categorise": "filed",
  "material.text_visibility": "changed text visibility for",
  "duplicate.dismiss": "marked a pair as not duplicates",
  "duplicate.merge": "resolved a duplicate pair",
  "invitation.create": "invited someone",
  "invitation.revoke": "withdrew an invitation",
  "invitation.accept": "accepted an invitation",
  "user.role_change": "changed someone's role",
  "user.disable": "suspended an account",
  "user.enable": "restored an account",
  "sync.run": "ran a Drive sync",
}

export const describe = (action: string): string =>
  PHRASING[action as AuditAction] ?? action.replace(/[._]/g, " ")

/** The distinct actions present, so the filter only offers what exists. */
export async function activityActions() {
  const rows = await db
    .selectDistinct({ action: auditLog.action })
    .from(auditLog)
    .orderBy(auditLog.action)

  return rows.map((r) => r.action)
}

export async function activity({
  actorId,
  action,
  entityId,
  page = 1,
}: {
  actorId?: string
  action?: string
  entityId?: string
  page?: number
} = {}) {
  const clauses: (SQL | undefined)[] = []
  if (actorId) clauses.push(eq(auditLog.actorId, actorId))
  if (action) clauses.push(eq(auditLog.action, action))
  if (entityId) clauses.push(eq(auditLog.entityId, entityId))

  const where = clauses.length ? and(...clauses) : undefined
  const current = Math.max(1, page)

  const [rows, [total]] = await Promise.all([
    db
      .select({
        id: auditLog.id,
        action: auditLog.action,
        entityType: auditLog.entityType,
        entityId: auditLog.entityId,
        before: auditLog.before,
        after: auditLog.after,
        ip: auditLog.ip,
        createdAt: auditLog.createdAt,
        actorName: user.name,
        actorEmail: user.email,
      })
      .from(auditLog)
      .leftJoin(user, eq(user.id, auditLog.actorId))
      .where(where)
      .orderBy(desc(auditLog.createdAt))
      .limit(ACTIVITY_PAGE_SIZE)
      .offset((current - 1) * ACTIVITY_PAGE_SIZE),
    db.select({ n: sql<number>`count(*)::int` }).from(auditLog).where(where),
  ])

  const found = total?.n ?? 0

  return {
    items: rows as ActivityRow[],
    total: found,
    page: current,
    pages: Math.max(1, Math.ceil(found / ACTIVITY_PAGE_SIZE)),
  }
}

/** Everyone who has ever acted, for the actor filter. */
export async function actors() {
  return db
    .selectDistinct({ id: user.id, name: user.name, email: user.email })
    .from(auditLog)
    .innerJoin(user, eq(user.id, auditLog.actorId))
    .orderBy(user.name)
}
