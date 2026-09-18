import { and, count, eq, isNull, ne, sql } from "drizzle-orm"
import { db } from "../../db"
import { invitation, user } from "../../db/schema"
import { txdb } from "../../db/tx"
import { audit } from "../audit"

/**
 * Removing someone's access, permanently.
 *
 * `user.delete` has been in the `AuditAction` union since Phase 3 and **nothing
 * has ever written it** — the action was named, labelled in two places, and the
 * function it describes was never built. This is it.
 *
 * Not in `services/`, though the panel calls it through one: a `"use server"`
 * module's exports are all browser-callable actions, and `scripts/` needs the
 * same function with no session to hand. The service wraps this with
 * `requireRole("owner")`; the script passes the Owner it is acting as.
 *
 * **Suspending is the everyday answer.** `setAccountEnabled` keeps the person,
 * their history and their name against every change they made, and is
 * reversible. This is for an address that should not exist at all — a typo, a
 * test, someone who never joined.
 *
 * **What survives.** The foreign keys are already right and are relied on rather
 * than reimplemented: sessions and credentials cascade away, while `audit_log`,
 * `invitation.invited_by` and `invitation.accepted_user_id` are `SET NULL`. So
 * the trail keeps every entry — what was done still happened, and an audit row
 * that vanished with its actor would be a worse record than one that says
 * "someone, since removed". The deleted account's email, name and role go into
 * the final entry's `before`, because once the row is gone that snapshot is the
 * only record it ever existed.
 */

export type RemovalTarget = {
  kind: "account" | "invitations" | "nothing"
  userId: string | null
  email: string
  name: string | null
  role: string | null
  /** Invitations for this address that could still be used. */
  openInvitations: number
  /** Invitations already used or withdrawn. Kept: they are history. */
  settledInvitations: number
  sessions: number
  auditEntries: number
  /** Set when removal must be refused, with the reason. */
  refuse?: string
}

/**
 * What removing this address would actually do — without doing any of it.
 *
 * Separate from the removal so a command can print it and a person can look
 * before committing. Every destructive script in this project works this way,
 * for the reason RUNBOOK.md gives: a script exiting 0 is not evidence.
 */
export async function planRemoval(email: string): Promise<RemovalTarget> {
  const address = email.trim().toLowerCase()

  const [account] = await db
    .select({ id: user.id, email: user.email, name: user.name, role: user.role })
    .from(user)
    .where(sql`lower(${user.email}) = ${address}`)
    .limit(1)

  const [open] = await db
    .select({ n: count() })
    .from(invitation)
    .where(
      and(
        sql`lower(${invitation.email}) = ${address}`,
        isNull(invitation.acceptedAt),
        isNull(invitation.revokedAt),
      ),
    )

  const [settled] = await db
    .select({ n: count() })
    .from(invitation)
    .where(
      and(
        sql`lower(${invitation.email}) = ${address}`,
        sql`(${invitation.acceptedAt} is not null or ${invitation.revokedAt} is not null)`,
      ),
    )

  const openInvitations = open?.n ?? 0
  const settledInvitations = settled?.n ?? 0

  if (!account) {
    return {
      kind: openInvitations > 0 ? "invitations" : "nothing",
      userId: null,
      email: address,
      name: null,
      role: null,
      openInvitations,
      settledInvitations,
      sessions: 0,
      auditEntries: 0,
    }
  }

  const [sessions, entries, owners] = await Promise.all([
    db.execute(sql`select count(*)::int as n from session where user_id = ${account.id}`),
    db.execute(sql`select count(*)::int as n from audit_log where actor_id = ${account.id}`),
    db
      .select({ n: count() })
      .from(user)
      .where(and(eq(user.role, "owner"), ne(user.id, account.id))),
  ])

  const rows = <T>(r: unknown): T[] => ((r as { rows?: T[] }).rows ?? (r as T[])) as T[]

  return {
    kind: "account",
    userId: account.id,
    email: account.email,
    name: account.name,
    role: account.role,
    openInvitations,
    settledInvitations,
    sessions: rows<{ n: number }>(sessions)[0]?.n ?? 0,
    auditEntries: rows<{ n: number }>(entries)[0]?.n ?? 0,
    /**
     * The last Owner cannot be removed, for the same reason they cannot be
     * demoted or suspended: an archive with no Owner has nobody who can manage
     * topics, invite anyone, or undo the mistake.
     */
    refuse:
      account.role === "owner" && (owners[0]?.n ?? 0) === 0
        ? "That is the only Owner. Make someone else an Owner first."
        : undefined,
  }
}

export type RemovalResult = { ok: true; message: string } | { ok: false; error: string }

/**
 * Do it. One transaction, with the audit entry written inside it.
 *
 * Open invitations are withdrawn as well as the account deleted, and that is the
 * point rather than a tidy-up: leaving a live invitation for an address you have
 * just removed means the account can simply be recreated from a link already in
 * somebody's inbox. Settled invitations are left alone — they are history, and
 * history is not ours to edit.
 */
export async function removeAccount(input: {
  email: string
  /** The Owner who decided. Recorded as the actor. */
  actorId: string
}): Promise<RemovalResult> {
  const plan = await planRemoval(input.email)
  if (plan.refuse) return { ok: false, error: plan.refuse }
  if (plan.kind === "nothing") {
    return { ok: false, error: `Nothing here belongs to ${plan.email}.` }
  }
  if (plan.userId && plan.userId === input.actorId) {
    return { ok: false, error: "You cannot remove your own account." }
  }

  return txdb.transaction(async (tx) => {
    const withdrawn = await tx
      .update(invitation)
      .set({ revokedAt: new Date() })
      .where(
        and(
          sql`lower(${invitation.email}) = ${plan.email}`,
          isNull(invitation.acceptedAt),
          isNull(invitation.revokedAt),
        ),
      )

    if (plan.userId) {
      await tx.delete(user).where(eq(user.id, plan.userId))
    }

    /**
     * Written last and inside the same transaction, with the whole snapshot in
     * `before`. Once the row is gone this entry is the only record that the
     * account ever existed, so it has to carry everything worth knowing.
     */
    await audit(tx, {
      action: "user.delete",
      entityType: "user",
      entityId: plan.userId ?? plan.email,
      before: {
        email: plan.email,
        name: plan.name,
        role: plan.role,
        hadAccount: plan.kind === "account",
        sessionsEnded: plan.sessions,
        invitationsWithdrawn: withdrawn.rowCount ?? plan.openInvitations,
        auditEntriesKept: plan.auditEntries,
      },
      actorId: input.actorId,
    })

    const parts: string[] = []
    if (plan.kind === "account") {
      parts.push(`Removed ${plan.name ? `${plan.name} (${plan.email})` : plan.email}`)
      if (plan.sessions > 0) parts.push(`${plan.sessions} signed-in session(s) ended`)
      if (plan.auditEntries > 0) parts.push(`${plan.auditEntries} trail entries kept`)
    } else {
      parts.push(`No account existed for ${plan.email}`)
    }
    if ((withdrawn.rowCount ?? 0) > 0) {
      parts.push(`${withdrawn.rowCount} open invitation(s) withdrawn`)
    }

    return { ok: true as const, message: `${parts.join(" · ")}.` }
  })
}
