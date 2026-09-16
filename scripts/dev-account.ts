/**
 * Create a throwaway account for local testing, and print a link to set its
 * password. Development only — it refuses to run against anything else.
 *
 *   pnpm exec tsx --env-file=.env.local scripts/dev-account.ts
 *
 * This exists so the admin surfaces can be checked while signed in without
 * anyone sharing a real password. Delete the account when finished.
 */
import { randomUUID } from "node:crypto"
import { eq } from "drizzle-orm"
import { db } from "../src/db"
import { invitation, user } from "../src/db/schema"
import { invitationExpiry, newToken } from "../src/lib/invite-token"

const EMAIL = "dev-check@localhost.invalid"

async function main() {
  const base = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"
  if (!base.includes("localhost")) {
    console.error("Refusing to run: this is a development-only account.")
    process.exit(1)
  }

  let [account] = await db.select().from(user).where(eq(user.email, EMAIL)).limit(1)

  if (!account) {
    const id = randomUUID()
    await db.insert(user).values({
      id,
      email: EMAIL,
      name: "Dev Check",
      role: "admin",
      emailVerified: true,
    })
    ;[account] = await db.select().from(user).where(eq(user.email, EMAIL)).limit(1)
  }

  await db.update(invitation).set({ revokedAt: new Date() }).where(eq(invitation.email, EMAIL))

  const { token, tokenHash } = newToken()
  await db.insert(invitation).values({
    id: randomUUID(),
    email: EMAIL,
    role: "admin",
    tokenHash,
    expiresAt: invitationExpiry(),
    invitedBy: account?.id ?? null,
  })

  console.log(`TOKEN=${token}`)
  console.log(`EMAIL=${EMAIL}`)
}

main()
  .catch((e) => {
    console.error("failed:", e instanceof Error ? e.message : e)
    process.exit(1)
  })
  .then(() => process.exit(0))
