import type { Metadata } from "next"
import Link from "next/link"
import { AcceptInviteForm } from "../../../components/auth/accept-invite-form"
import { AuthShell } from "../../../components/auth/auth-shell"
import { checkInvitation } from "../../../server/auth/invitations"

/**
 * Accepting an invitation.
 *
 * The link is checked before the form is shown, so an expired or used link
 * says so plainly instead of failing after somebody has typed a password.
 */
export const metadata: Metadata = {
  title: "Accept your invitation",
  robots: { index: false, follow: false },
}

export const dynamic = "force-dynamic"

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const invite = await checkInvitation(token)

  if (!invite.valid) {
    return (
      <AuthShell line="Every material is free to read and free to download.">
        <h1 className="font-serif text-[clamp(30px,4vw,40px)] font-light tracking-[-0.02em]">
          This link has expired
        </h1>
        <p className="mt-3 text-[14.5px] leading-relaxed text-ink-2">
          Invitation links work once and last 72 hours. Ask whoever invited you to send another — it
          takes them a moment.
        </p>
        <Link
          href="/sign-in"
          className="mt-8 inline-flex rounded-full border border-line px-6 py-3.5 text-[15px] transition-colors hover:border-ink"
        >
          Go to sign in
        </Link>
      </AuthShell>
    )
  }

  return (
    <AuthShell line="You have been invited to help look after the archive.">
      <AcceptInviteForm token={token} email={invite.email} />
    </AuthShell>
  )
}
