import type { Metadata } from "next"
import { ProfileForm } from "../../../components/admin/profile-form"
import { requireSession } from "../../../lib/session"

/**
 * Your own account.
 *
 * Gated at `requireSession` only — every role can edit their own name and
 * change their own password. Acting on someone else's account is People, and
 * that needs a higher role.
 */
export const metadata: Metadata = {
  title: "Your profile",
  robots: { index: false, follow: false },
}

export const dynamic = "force-dynamic"

export default async function ProfilePage() {
  const session = await requireSession()
  const role = (session.user as { role?: string }).role ?? "editor"

  return (
    <>
      <p className="text-[11px] font-medium uppercase tracking-[.2em] text-taupe">Your profile</p>
      <h1 className="mt-3 font-serif text-[clamp(28px,3.4vw,38px)] font-light tracking-[-0.02em]">
        {session.user.name}
      </h1>
      <p className="mt-3 max-w-[52ch] text-[15px] leading-relaxed text-ink-2">
        You are signed in as <span className="text-ink">{session.user.email}</span> with the {role}{" "}
        role.
      </p>

      <ProfileForm name={session.user.name} email={session.user.email} />
    </>
  )
}
