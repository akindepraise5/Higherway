import type { Metadata } from "next"
import { PeopleManager } from "../../../components/admin/people-manager"
import { hasEmail } from "../../../lib/env"
import { requireRole } from "../../../lib/session"
import { pendingInvitations, staff } from "../../../server/users/queries"

/**
 * People with access.
 *
 * Sign-up is disabled, so everyone listed here was deliberately invited by
 * someone already here. That keeps this page a short legible list rather than
 * a user-management system, which is the right shape for a church archive.
 *
 * Admin and above only — an Editor has no business seeing who else has keys.
 */
export const metadata: Metadata = {
  title: "People",
  robots: { index: false, follow: false },
}

export const dynamic = "force-dynamic"

export default async function AdminUsersPage() {
  const { session, role } = await requireRole("admin")

  const [people, invites] = await Promise.all([staff(), pendingInvitations()])

  return (
    <>
      <p className="text-[11px] font-medium uppercase tracking-[.2em] text-taupe">People</p>
      <h1 className="mt-3 font-serif text-[clamp(28px,3.4vw,38px)] font-light tracking-[-0.02em]">
        {people.length} {people.length === 1 ? "person has" : "people have"} access
      </h1>
      <p className="mt-2 max-w-[56ch] text-[14px] leading-relaxed text-ink-2">
        Nobody can create an account by visiting a page. Everyone here was invited, and every
        invitation link works once.
      </p>

      {!hasEmail ? (
        <p className="mt-5 rounded-[3px] border-l-2 border-gold bg-paper-2 px-4 py-3 text-[13.5px] leading-relaxed text-ink-2">
          Email delivery is not configured yet, so invitations are shown as a link to copy and send
          by hand. Nothing else changes once a sending domain is verified.
        </p>
      ) : null}

      <PeopleManager
        people={people}
        invites={invites}
        role={role}
        currentUserId={session.user.id}
      />
    </>
  )
}
