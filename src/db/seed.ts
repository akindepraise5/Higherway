/**
 * Create the first Owner:
 *
 *   pnpm db:seed
 *
 * Sign-up is disabled, so this is the only account that exists without an
 * invitation — everyone else is invited by someone already here
 * (ARCHITECTURE.md §10). Run it once, after the migrations.
 *
 * Safe to re-run: if the account already exists it reports and changes
 * nothing, so this can never quietly reset a password or demote a role.
 *
 * The password is not chosen here. The account is created without one, and the
 * script prints a single-use link to set it — so a password never sits in a
 * shell history, a terminal buffer, or this file.
 */

import { randomUUID } from "node:crypto"
import { eq } from "drizzle-orm"
import { env } from "../lib/env"
import { INVITE_EXPIRES_HOURS, invitationExpiry, newToken } from "../lib/invite-token"
import { db } from "."
import { invitation, user } from "./schema"

async function main() {
  const email = env.SEED_OWNER_EMAIL
  if (!email) {
    console.error("SEED_OWNER_EMAIL is not set. Add it to .env.local and run this again.")
    process.exit(1)
  }

  const name = env.SEED_OWNER_NAME ?? "Higherway Owner"

  const [existing] = await db.select().from(user).where(eq(user.email, email)).limit(1)

  if (existing) {
    console.log(`
An account already exists for ${email}.
  name: ${existing.name}
  role: ${existing.role}

Nothing changed. To reset the password, send an invitation from the admin
panel or use the password reset flow — this script will not overwrite an
existing account.`)
    return
  }

  const id = randomUUID()

  await db.insert(user).values({
    id,
    email,
    name,
    role: "owner",
    emailVerified: false,
  })

  // A set-password invitation rather than a password chosen here.
  const { token, tokenHash } = newToken()
  const expiresAt = invitationExpiry()

  await db.insert(invitation).values({
    id: randomUUID(),
    email,
    role: "owner",
    tokenHash,
    expiresAt,
    acceptedUserId: null,
  })

  const link = `${env.NEXT_PUBLIC_SITE_URL.replace(/\/$/, "")}/invite/${token}`

  console.log(`
Owner account created.
  email: ${email}
  name:  ${name}
  role:  owner

Set the password with this link — it works once and expires in ${INVITE_EXPIRES_HOURS} hours:

  ${link}

Only the hash of that token is stored, so this is the only time the link can be
shown. If it is lost, re-run after deleting the pending invitation.`)
}

main()
  .catch((error) => {
    console.error("\nSeed failed:", error instanceof Error ? error.message : error)
    process.exit(1)
  })
  .then(() => process.exit(0))
