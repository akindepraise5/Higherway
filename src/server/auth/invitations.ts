"use server"

import { randomUUID } from "node:crypto"
import { eq } from "drizzle-orm"
import { db } from "../../db"
import { invitation, user } from "../../db/schema"
import { auth } from "../../lib/auth"
import { classifyInvitation, hashToken, type InviteProblem } from "../../lib/invite-token"

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

type Inspection =
  | { ok: true; row: typeof invitation.$inferSelect }
  | { ok: false; problem: InviteProblem }

/**
 * Finds the invitation behind a link and says exactly why it is unusable.
 *
 * This used to be one query demanding every condition at once — right token,
 * not accepted, not revoked, not expired — so all four failures came back as
 * the same `null`, and the page could only ever say "This link has expired".
 *
 * That hid the commonest real failure. Sending someone a fresh link requires
 * revoking the old one first, so anyone who opened an *earlier* link found it
 * withdrawn — and was told it had expired, which it had not. Nobody could
 * diagnose it from the screen; it took reading the rows.
 *
 * Telling the holder of a link which way it failed leaks nothing useful. A
 * token is 32 random bytes, so only someone who already holds a real link can
 * reach any answer other than `not_found`.
 */
async function inspect(token: string): Promise<Inspection> {
  const [row] = await db
    .select()
    .from(invitation)
    .where(eq(invitation.tokenHash, hashToken(token)))
    .limit(1)

  // The decision is pure and lives in lib/, where every branch is tested
  // without a database. This only fetches the row.
  const problem = classifyInvitation(row, new Date())
  if (problem) return { ok: false, problem }
  // classifyInvitation returns null only for a row that exists.
  return row ? { ok: true, row } : { ok: false, problem: "not_found" }
}

/** Whether a link is still good — so the page can say so before asking for a password. */
export async function checkInvitation(token: string) {
  const found = await inspect(token)
  return found.ok
    ? { valid: true as const, email: found.row.email, role: found.row.role }
    : { valid: false as const, problem: found.problem }
}

/** Short, for a form that failed on submit rather than on arrival. */
const REFUSED: Record<InviteProblem, string> = {
  not_found: "That link is not recognised. Check it was copied in full.",
  accepted: "This invitation has already been used. Sign in instead.",
  revoked: "This invitation was withdrawn. Use the most recent link you were sent.",
  expired: "This link has expired. Ask whoever invited you for a new one.",
}

/** A name to start from. The person can change it on their profile. */
const nameFromEmail = (email: string): string => {
  const local = (email.split("@")[0] ?? email).replace(/[._-]+/g, " ").trim()
  return local ? local.charAt(0).toUpperCase() + local.slice(1) : email
}

/**
 * The account an invitation belongs to — created here if it does not exist.
 *
 * This is the fix for invitations never working. The two halves were written
 * against different shapes:
 *
 *   - `db:seed` creates the Owner's *user row* and an invitation together, so
 *     accepting only has to attach a password to an account already there.
 *   - Inviting from the admin panel creates *only* the invitation, and refuses
 *     outright if an account already exists.
 *
 * Accepting then looked for an existing account, found none, and failed with
 * "That invitation no longer matches an account" — for every person invited
 * from the admin panel, every time. The seeded Owner was the only account that
 * ever existed, and so the only one that could ever get in.
 *
 * The row is created with exactly the fields the seed uses, since that is the
 * one shape already proven to sign in. `onConflictDoNothing` makes a double
 * submit harmless: whichever request loses the race reads back the row the
 * other created, rather than failing on the unique email.
 *
 * If a later step fails, this leaves a user row with no password and the
 * invitation still open — the same state a freshly seeded Owner starts in — so
 * the very same link works on a second attempt.
 */
async function ensureUser(invite: typeof invitation.$inferSelect) {
  const [existing] = await db.select().from(user).where(eq(user.email, invite.email)).limit(1)
  if (existing) return existing

  await db
    .insert(user)
    .values({
      id: randomUUID(),
      email: invite.email,
      name: nameFromEmail(invite.email),
      role: invite.role,
      emailVerified: false,
    })
    .onConflictDoNothing({ target: user.email })

  const [created] = await db.select().from(user).where(eq(user.email, invite.email)).limit(1)
  return created ?? null
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

  // Checked again here, not only when the page loads: the link can be revoked,
  // or used in another tab, while the form sits open.
  const found = await inspect(token)
  if (!found.ok) {
    return { ok: false, error: REFUSED[found.problem] }
  }
  const invite = found.row

  const account = await ensureUser(invite)
  if (!account) {
    return { ok: false, error: "The account could not be created. Try the same link again." }
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
