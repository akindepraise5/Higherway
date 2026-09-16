"use server"

import { randomUUID } from "node:crypto"
import { and, eq, isNull } from "drizzle-orm"
import { revalidatePath } from "next/cache"
import { invitation, user } from "../../db/schema"
import { txdb } from "../../db/tx"
import { hasEmail } from "../../lib/env"
import { INVITE_EXPIRES_HOURS, invitationExpiry, newToken } from "../../lib/invite-token"
import { type Role, requireRole } from "../../lib/session"
import { audit } from "../audit"

/**
 * Issuing invitations from the admin panel.
 *
 * Sign-up is disabled, so this is the only way an account comes into being
 * after the seeded Owner (ARCHITECTURE.md §10). Each function runs in a
 * transaction that also writes its audit entry, so who invited whom is
 * recorded by construction.
 *
 * The plain token is returned **once**, to be shown to the admin who created
 * it. Only its hash is stored, so if the link is lost the invitation has to be
 * reissued — which is the correct trade: a database leak must not hand anyone
 * a way in.
 */

export type InviteResult =
  | { ok: true; link: string; emailed: boolean; message: string }
  | { ok: false; error: string }

export type SimpleResult = { ok: true; message: string } | { ok: false; error: string }

const siteUrl = () =>
  (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(/\/$/, "")

/**
 * Invite someone.
 *
 * Only an Owner may create another Owner or an Admin — an Admin inviting
 * themselves a peer would be a way to escalate sideways. Admins may invite
 * Editors, which is the common case.
 */
export async function inviteUser(email: string, role: Role): Promise<InviteResult> {
  const { session, role: actorRole } = await requireRole("admin")

  const address = email.trim().toLowerCase()
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(address)) {
    return { ok: false, error: "That does not look like an email address." }
  }

  if ((role === "owner" || role === "admin") && actorRole !== "owner") {
    return { ok: false, error: "Only an Owner can invite an Owner or an Admin." }
  }

  const { token, tokenHash } = newToken()

  const result = await txdb.transaction(async (tx) => {
    const [existing] = await tx.select().from(user).where(eq(user.email, address)).limit(1)
    if (existing) {
      return { ok: false as const, error: `${address} already has an account.` }
    }

    // One open invitation per address — the partial unique index enforces it,
    // but saying so plainly beats surfacing a constraint violation.
    const [open] = await tx
      .select({ id: invitation.id })
      .from(invitation)
      .where(
        and(
          eq(invitation.email, address),
          isNull(invitation.acceptedAt),
          isNull(invitation.revokedAt),
        ),
      )
      .limit(1)

    if (open) {
      return {
        ok: false as const,
        error: `${address} already has an invitation waiting. Revoke it first to send a new one.`,
      }
    }

    const id = randomUUID()
    await tx.insert(invitation).values({
      id,
      email: address,
      role,
      tokenHash,
      expiresAt: invitationExpiry(),
      invitedBy: session.user.id,
    })

    await audit(tx, {
      action: "invitation.create",
      entityType: "invitation",
      entityId: id,
      after: { email: address, role },
      actorId: session.user.id,
    })

    return { ok: true as const }
  })

  if (!result.ok) return result

  revalidatePath("/admin/users")

  // Email delivery needs a verified sending domain. Until that exists, the
  // admin copies the link — the flow works either way, which is why the
  // invitation does not depend on Resend being configured.
  return {
    ok: true,
    link: `${siteUrl()}/invite/${token}`,
    emailed: false,
    message: hasEmail
      ? `Invitation created for ${address}. Copy the link below — email delivery is not wired up yet.`
      : `Invitation created for ${address}. Copy the link below and send it to them; it works once and expires in ${INVITE_EXPIRES_HOURS} hours.`,
  }
}

/** Withdraw an invitation that has not been used. */
export async function revokeInvitation(id: string): Promise<SimpleResult> {
  const { session } = await requireRole("admin")

  const result = await txdb.transaction(async (tx) => {
    const [invite] = await tx.select().from(invitation).where(eq(invitation.id, id)).limit(1)
    if (!invite) return { ok: false as const, error: "That invitation no longer exists." }
    if (invite.acceptedAt) {
      return { ok: false as const, error: "That invitation has already been accepted." }
    }

    await tx.update(invitation).set({ revokedAt: new Date() }).where(eq(invitation.id, id))

    await audit(tx, {
      action: "invitation.revoke",
      entityType: "invitation",
      entityId: id,
      before: { email: invite.email, role: invite.role },
      actorId: session.user.id,
    })

    return { ok: true as const, message: `Invitation for ${invite.email} withdrawn.` }
  })

  revalidatePath("/admin/users")
  return result
}

/**
 * Change someone's role.
 *
 * Only an Owner may. The last Owner cannot be demoted — an archive with nobody
 * able to manage it is a locked door, and recovering from that means editing
 * the database by hand.
 */
export async function changeRole(userId: string, role: Role): Promise<SimpleResult> {
  const { session } = await requireRole("owner")

  const result = await txdb.transaction(async (tx) => {
    const [target] = await tx.select().from(user).where(eq(user.id, userId)).limit(1)
    if (!target) return { ok: false as const, error: "That account no longer exists." }
    if (target.role === role) return { ok: false as const, error: `Already ${role}.` }

    if (target.role === "owner") {
      const owners = await tx.select({ id: user.id }).from(user).where(eq(user.role, "owner"))
      if (owners.length <= 1) {
        return { ok: false as const, error: "This is the only Owner. Promote someone else first." }
      }
    }

    await tx.update(user).set({ role, updatedAt: new Date() }).where(eq(user.id, userId))

    await audit(tx, {
      action: "user.role_change",
      entityType: "user",
      entityId: userId,
      before: { role: target.role },
      after: { role },
      actorId: session.user.id,
    })

    return { ok: true as const, message: `${target.name} is now ${role}.` }
  })

  revalidatePath("/admin/users")
  return result
}

/**
 * Suspend or restore an account. Suspending keeps everything the person did —
 * removing their history would damage the audit trail, which is the opposite
 * of what suspending someone is for.
 */
export async function setAccountEnabled(userId: string, enabled: boolean): Promise<SimpleResult> {
  const { session } = await requireRole("owner")

  const result = await txdb.transaction(async (tx) => {
    const [target] = await tx.select().from(user).where(eq(user.id, userId)).limit(1)
    if (!target) return { ok: false as const, error: "That account no longer exists." }

    if (!enabled && target.id === session.user.id) {
      return { ok: false as const, error: "You cannot suspend your own account." }
    }

    if (!enabled && target.role === "owner") {
      const owners = await tx.select({ id: user.id }).from(user).where(eq(user.role, "owner"))
      if (owners.length <= 1) {
        return { ok: false as const, error: "This is the only Owner." }
      }
    }

    await tx
      .update(user)
      .set({ disabledAt: enabled ? null : new Date(), updatedAt: new Date() })
      .where(eq(user.id, userId))

    await audit(tx, {
      action: enabled ? "user.enable" : "user.disable",
      entityType: "user",
      entityId: userId,
      before: { disabled: Boolean(target.disabledAt) },
      after: { disabled: !enabled },
      actorId: session.user.id,
    })

    return {
      ok: true as const,
      message: enabled ? `${target.name} can sign in again.` : `${target.name} is suspended.`,
    }
  })

  revalidatePath("/admin/users")
  return result
}
