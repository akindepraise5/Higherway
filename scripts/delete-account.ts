/**
 * Remove someone's access to the admin panel, permanently.
 *
 *   pnpm account:delete someone@example.com                 what it would do
 *   pnpm account:delete someone@example.com --apply         do it
 *   pnpm account:delete someone@example.com --apply --as owner@example.com
 *
 * **Suspending is usually the right answer instead.** Suspending keeps the
 * person, their history and their name against every change they made, and it
 * can be undone from the People page. This is for an address that should not
 * exist at all: a typo, a test, someone who never joined.
 *
 * It removes the account **and withdraws any invitation still open** for that
 * address. That pairing is the point rather than tidiness — an open invitation
 * is a link in somebody's inbox that recreates the account.
 *
 * **Nothing in the audit trail is deleted.** The foreign keys are `SET NULL`, so
 * every entry survives without its actor: what was done still happened, and a
 * trail that loses entries when a person leaves is a worse record than one that
 * says "someone, since removed". The account's email, name and role are written
 * into the final entry, because once the row is gone that is the only record it
 * ever existed.
 *
 * The last Owner is refused, for the same reason they cannot be demoted.
 */

import { eq } from "drizzle-orm"
import { db } from "../src/db"
import { user } from "../src/db/schema"
import { planRemoval, removeAccount } from "../src/server/users/remove"

const args = process.argv.slice(2)
const apply = args.includes("--apply")
const email = args.find((a) => a.includes("@") && !a.startsWith("--as"))

const asIndex = args.indexOf("--as")
const actingAs = asIndex >= 0 ? args[asIndex + 1] : undefined

async function main() {
  if (!email) {
    console.error("usage: pnpm account:delete <email> [--apply] [--as <owner-email>]")
    process.exit(1)
  }

  const plan = await planRemoval(email)

  console.log(`\n${plan.email}`)
  if (plan.kind === "nothing") {
    console.log("  nothing here belongs to that address — no account, no open invitation")
    if (plan.settledInvitations > 0) {
      console.log(
        `  (${plan.settledInvitations} invitation(s) already accepted or withdrawn — history, left alone)`,
      )
    }
    return
  }

  if (plan.kind === "account") {
    console.log(`  account:            ${plan.name ?? "(no name)"} · ${plan.role}`)
    console.log(`  signed-in sessions: ${plan.sessions}  → ended`)
    console.log(`  trail entries:      ${plan.auditEntries}  → kept, actor cleared`)
  } else {
    console.log("  account:            none")
  }
  console.log(`  open invitations:   ${plan.openInvitations}  → withdrawn`)
  console.log(`  settled invitations:${plan.settledInvitations}  → left alone, they are history`)

  if (plan.refuse) {
    console.log(`\nRefused: ${plan.refuse}`)
    process.exit(1)
  }

  if (!apply) {
    console.log("\nNothing changed. Re-run with --apply to do it.")
    return
  }

  /**
   * Somebody has to own the decision. A script has no session, so the acting
   * Owner is named — and when there is only one Owner who is not the target,
   * naming them adds nothing but typing, so it is inferred and printed.
   */
  const owners = await db
    .select({ id: user.id, email: user.email, name: user.name })
    .from(user)
    .where(eq(user.role, "owner"))

  const candidates = owners.filter((o) => o.id !== plan.userId)
  const actor = actingAs
    ? candidates.find((o) => o.email.toLowerCase() === actingAs.toLowerCase())
    : candidates.length === 1
      ? candidates[0]
      : undefined

  if (!actor) {
    console.error(
      actingAs
        ? `\n${actingAs} is not an Owner who could decide this.`
        : `\nThere are ${candidates.length} Owners. Say which one is doing this:\n` +
            candidates.map((o) => `  --as ${o.email}`).join("\n"),
    )
    process.exit(1)
  }

  console.log(`\nacting as ${actor.name ?? actor.email} <${actor.email}>`)

  const result = await removeAccount({ email: plan.email, actorId: actor.id })
  console.log(result.ok ? `\n${result.message}` : `\nFailed: ${result.error}`)
  if (!result.ok) process.exit(1)

  console.log("Check it rather than trusting it — the People page, and Activity.")
}

main()
  .catch((e) => {
    console.error("failed:", e instanceof Error ? e.message : e)
    process.exit(1)
  })
  .then(() => process.exit(0))
