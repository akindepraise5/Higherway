import { headers } from "next/headers"
import { auditLog } from "../db/schema"
import type { Tx } from "../db/tx"

/**
 * The audit trail.
 *
 * Every mutation writes one of these **inside the same transaction** as the
 * change it describes, so the two cannot come apart. An entry without its
 * change is a lie; a change without its entry is untraceable. For an archive
 * that a congregation relies on, the second is the worse of the two.
 *
 * This takes a transaction handle rather than reaching for a database itself,
 * which makes the requirement structural: you cannot call it without already
 * being in a transaction, and the service that owns that transaction decides
 * whether the whole thing commits.
 *
 * Reads live in `server/activity.ts`; this file only writes.
 */

/**
 * Actions are `entity.verb`, past tense where it reads better. Kept as a union
 * so the Activity page can describe them in plain words rather than printing a
 * raw string, and so a typo becomes a compile error instead of an orphan entry.
 */
export type AuditAction =
  | "category.create"
  | "category.rename"
  | "category.merge"
  /** Reversing a merge. Never recorded as a merge — an undo that hides in the
      trail as the thing it undid makes the trail worse than useless. */
  | "category.unmerge"
  | "category.delete"
  /** A material entering the archive through the dashboard rather than the
      backfill — an upload or an imported link. */
  | "material.create"
  | "material.publish"
  | "material.archive"
  | "material.restore"
  | "material.update"
  | "material.categorise"
  /** Taking a material off a topic. Deliberately not the same action as putting
      it on one: they are opposite events, and a trail that gives them one name
      cannot answer "who removed this from Faith?". Same reasoning as
      `category.unmerge`. */
  | "material.uncategorise"
  | "material.text_visibility"
  | "duplicate.dismiss"
  | "duplicate.merge"
  | "invitation.create"
  | "invitation.revoke"
  | "invitation.accept"
  | "user.role_change"
  | "user.disable"
  | "user.enable"
  | "sync.run"

export type AuditEntry = {
  action: AuditAction
  entityType: "category" | "material" | "duplicate" | "invitation" | "user" | "sync"
  entityId?: string | null
  /** Enough to answer "what changed, and what was it before". */
  before?: unknown
  after?: unknown
  actorId?: string | null
}

/**
 * Who did it and from where. Taken from the request rather than passed in, so
 * a caller cannot accidentally attribute an action to the wrong person.
 *
 * Returns nulls outside a request — scripts and background jobs have no
 * headers, and an entry attributed to nobody is still worth having.
 */
async function requestContext() {
  try {
    const h = await headers()
    return {
      ip: h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? h.get("x-real-ip") ?? null,
      userAgent: h.get("user-agent"),
    }
  } catch {
    return { ip: null, userAgent: null }
  }
}

/**
 * Record one action. Must be called with the transaction that is performing
 * the change:
 *
 *   await txdb.transaction(async (tx) => {
 *     await tx.update(categories).set(...)
 *     await audit(tx, { action: "category.rename", ... })
 *   })
 *
 * If the change fails, this rolls back with it. That is the whole point.
 */
export async function audit(tx: Tx, entry: AuditEntry) {
  const { ip, userAgent } = await requestContext()

  await tx.insert(auditLog).values({
    action: entry.action,
    entityType: entry.entityType,
    entityId: entry.entityId ?? null,
    before: entry.before ?? null,
    after: entry.after ?? null,
    actorId: entry.actorId ?? null,
    ip,
    userAgent,
  })
}
