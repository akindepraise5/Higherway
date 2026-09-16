import { and, desc, eq, gt, isNull, sql } from "drizzle-orm"
import { db } from "../../db"
import { invitation, session, user } from "../../db/schema"

/**
 * Reading accounts and invitations for the admin panel.
 *
 * Sign-up is disabled, so the people listed here are exactly the people someone
 * deliberately invited. That makes this page a short, legible list rather than
 * a user-management system — which is the right shape for a church archive.
 *
 * Queries only; changes go through a service that audits them.
 */

export type StaffRow = {
  id: string
  name: string
  email: string
  role: "owner" | "admin" | "editor"
  disabledAt: Date | null
  createdAt: Date
  /** When they were last seen, from their most recent session. */
  lastSeen: Date | null
  activeSessions: number
}

export async function staff(): Promise<StaffRow[]> {
  const rows = await db
    .select({
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      disabledAt: user.disabledAt,
      createdAt: user.createdAt,
      lastSeen: sql<Date | null>`max(${session.createdAt})`,
      activeSessions: sql<number>`count(${session.id}) filter (where ${session.expiresAt} > now())::int`,
    })
    .from(user)
    .leftJoin(session, eq(session.userId, user.id))
    .groupBy(user.id, user.name, user.email, user.role, user.disabledAt, user.createdAt)
    .orderBy(desc(user.createdAt))

  return rows as StaffRow[]
}

export type PendingInvite = {
  id: string
  email: string
  role: "owner" | "admin" | "editor"
  expiresAt: Date
  createdAt: Date
  invitedBy: string | null
}

/** Invitations still worth showing: not accepted, not revoked, not expired. */
export async function pendingInvitations(): Promise<PendingInvite[]> {
  return db
    .select({
      id: invitation.id,
      email: invitation.email,
      role: invitation.role,
      expiresAt: invitation.expiresAt,
      createdAt: invitation.createdAt,
      invitedBy: user.name,
    })
    .from(invitation)
    .leftJoin(user, eq(user.id, invitation.invitedBy))
    .where(
      and(
        isNull(invitation.acceptedAt),
        isNull(invitation.revokedAt),
        gt(invitation.expiresAt, new Date()),
      ),
    )
    .orderBy(desc(invitation.createdAt))
}
