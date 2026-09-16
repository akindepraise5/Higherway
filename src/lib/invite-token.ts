import { createHash, randomBytes } from "node:crypto"

/**
 * Invitation tokens.
 *
 * These live outside `server/auth/invitations.ts` because that file is a
 * `"use server"` module, and Next only permits async exports from one — every
 * export becomes a callable Server Action. These are synchronous helpers and
 * have no business being actions: `hashToken` in particular should never be
 * reachable from a browser.
 *
 * Only the hash is ever stored. A leaked database row must not be usable as an
 * invitation, which is why the plain token exists solely in the link and can be
 * shown to an admin exactly once.
 */

const TOKEN_BYTES = 32
export const INVITE_EXPIRES_HOURS = 72

export const hashToken = (token: string): string => createHash("sha256").update(token).digest("hex")

export function newToken(): { token: string; tokenHash: string } {
  const token = randomBytes(TOKEN_BYTES).toString("base64url")
  return { token, tokenHash: hashToken(token) }
}

export const invitationExpiry = (): Date =>
  new Date(Date.now() + INVITE_EXPIRES_HOURS * 60 * 60 * 1000)

/** Why a link cannot be used. */
export type InviteProblem = "not_found" | "accepted" | "revoked" | "expired"

/** The fields that decide whether a link still works. */
export type InviteState = {
  acceptedAt: Date | null
  revokedAt: Date | null
  expiresAt: Date
}

/**
 * Whether an invitation can still be used, and if not, exactly why.
 *
 * Pure, so every branch is tested without a database. This decision used to be
 * one query demanding all four conditions at once, which collapsed them into a
 * single `null` — and the page said "This link has expired" for a link that
 * had in fact been *withdrawn* when a newer one was sent.
 *
 * `null` means usable. `now` is passed in rather than read here, so a test can
 * stand at the exact edge of expiry.
 */
export function classifyInvitation(
  row: InviteState | null | undefined,
  now: Date,
): InviteProblem | null {
  if (!row) return "not_found"
  // Accepted first: for a used link, "sign in instead" is the useful answer.
  if (row.acceptedAt) return "accepted"
  if (row.revokedAt) return "revoked"
  // At the exact moment of expiry the link is already gone.
  if (row.expiresAt <= now) return "expired"
  return null
}
