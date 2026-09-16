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
