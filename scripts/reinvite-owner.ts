/**
 * Issue a fresh invitation link for the seeded Owner.
 *
 *   pnpm reinvite
 *
 * Useful when the first link expired, was lost, or — as here — when a password
 * was set from a script to prove the flow and now needs replacing with one the
 * owner chooses themselves. Accepting the new link overwrites the old password.
 *
 * Lives in scripts/ rather than the repo root so its relative imports resolve
 * the same way every other script's do.
 */
import { randomUUID } from "node:crypto"
import { eq } from "drizzle-orm"
import { db } from "../src/db"
import { invitation, user } from "../src/db/schema"
import { env } from "../src/lib/env"
import { INVITE_EXPIRES_HOURS, invitationExpiry, newToken } from "../src/lib/invite-token"

async function main() {
  const email = env.SEED_OWNER_EMAIL
  if (!email) {
    console.error("SEED_OWNER_EMAIL is not set.")
    process.exit(1)
  }

  const [owner] = await db.select().from(user).where(eq(user.email, email)).limit(1)
  if (!owner) {
    console.error(`No account for ${email}. Run pnpm db:seed first.`)
    process.exit(1)
  }

  // Retire any link still outstanding, so only the newest one works.
  await db.update(invitation).set({ revokedAt: new Date() }).where(eq(invitation.email, email))

  const { token, tokenHash } = newToken()
  await db.insert(invitation).values({
    id: randomUUID(),
    email,
    role: owner.role,
    tokenHash,
    expiresAt: invitationExpiry(),
    invitedBy: owner.id,
  })

  const base = (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(/\/$/, "")
  console.log(`
  Fresh link for ${email} — works once, expires in ${INVITE_EXPIRES_HOURS} hours.
  Any earlier link is now revoked.

    ${base}/invite/${token}
  `)
}

main()
  .catch((error) => {
    console.error("Re-invite failed:", error instanceof Error ? error.message : error)
    process.exit(1)
  })
  .then(() => process.exit(0))
