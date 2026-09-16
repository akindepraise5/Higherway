"use server"

import { and, eq, gt, isNull } from "drizzle-orm"
import { db } from "../../db"
import { invitation, user } from "../../db/schema"
import { auth } from "../../lib/auth"
import { hashToken } from "../../lib/invite-token"

/**
 * Invitations: the only way an account comes into being.
 *
 * Sign-up is disabled, so nobody can register by visiting a page. Someone
 * already here creates an invitation, and the person follows a single-use link
 * to choose a password. ARCHITECTURE.md §10.
 *
 * Only the *hash* of a token is stored. A leaked database row must not be
 * usable as an invitation, and the plain token exists only in the link — which
 * is why an admin can be shown it exactly once.
 */

export type AcceptResult = { ok: true } | { ok: false; error: string }

/** An invitation that exists, has not been used, revoked, or run out of time. */
async function findLive(token: string) {
  const [row] = await db
    .select()
    .from(invitation)
    .where(
      and(
        eq(invitation.tokenHash, hashToken(token)),
        isNull(invitation.acceptedAt),
        isNull(invitation.revokedAt),
        gt(invitation.expiresAt, new Date()),
      ),
    )
    .limit(1)

  return row ?? null
}

/** Whether a link is still good — so the page can say so before asking for a password. */
export async function checkInvitation(token: string) {
  const row = await findLive(token)
  return row
    ? { valid: true as const, email: row.email, role: row.role }
    : { valid: false as const }
}

/**
 * Accept an invitation by choosing a password.
 *
 * Better Auth has no session-less "set a password" call: `setPassword` needs
 * one, and `resetPassword` expects a token it issued itself. The supported way
 * in is `auth.$context`, which exposes the same password hasher and account
 * writer the library uses internally — so the credential we store is identical
 * to one Better Auth would have written.
 */
export async function acceptInvitation(token: string, password: string): Promise<AcceptResult> {
  if (password.length < 10) {
    return { ok: false, error: "Use at least 10 characters." }
  }

  const invite = await findLive(token)
  if (!invite) {
    return { ok: false, error: "That link has expired or has already been used." }
  }

  const [account] = await db.select().from(user).where(eq(user.email, invite.email)).limit(1)
  if (!account) {
    return { ok: false, error: "That invitation no longer matches an account." }
  }

  const ctx = await auth.$context
  const hashed = await ctx.password.hash(password)

  // The seeded Owner has a user row but no credential; an invited colleague may
  // already have one if they are being re-invited. Both must work.
  const existing = await ctx.internalAdapter.findCredentialAccount?.(account.id)

  if (existing) {
    await ctx.internalAdapter.updatePassword(account.id, hashed)
  } else {
    await ctx.internalAdapter.createAccount({
      userId: account.id,
      providerId: "credential",
      accountId: account.id,
      password: hashed,
    })
  }

  await db
    .update(invitation)
    .set({ acceptedAt: new Date(), acceptedUserId: account.id })
    .where(eq(invitation.id, invite.id))

  // Accepting the link is itself proof the address reaches them.
  await db
    .update(user)
    .set({ emailVerified: true, updatedAt: new Date() })
    .where(eq(user.id, account.id))

  return { ok: true }
}
