import type { Metadata } from "next"
import Link from "next/link"
import { AcceptInviteForm } from "../../../components/auth/accept-invite-form"
import { AuthShell } from "../../../components/auth/auth-shell"
import type { InviteProblem } from "../../../lib/invite-token"
import { checkInvitation } from "../../../server/auth/invitations"

/**
 * One message per way a link can fail. This page used to say "This link has
 * expired" for all of them — including a link that had been *withdrawn* because
 * a newer one was sent, which is the case people actually hit and the one that
 * message described least accurately.
 */
const WHY: Record<InviteProblem, { title: string; body: string }> = {
  revoked: {
    title: "This invitation was withdrawn",
    body: "A newer invitation was probably sent to you — sending a fresh link cancels the earlier ones. Open the most recent link you were given.",
  },
  accepted: {
    title: "This invitation has already been used",
    body: "The account is set up. Sign in with the password that was chosen when it was accepted.",
  },
  expired: {
    title: "This link has expired",
    body: "Invitation links last 72 hours. Ask whoever invited you to send another — it takes them a moment.",
  },
  not_found: {
    title: "This link is not recognised",
    body: "It may have been cut short when it was copied or pasted. Open the link exactly as it was sent, or ask for a new one.",
  },
}

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
    const { title, body } = WHY[invite.problem]
    return (
      <AuthShell line="Every material is free to read and free to download.">
        <h1 className="font-serif text-[clamp(30px,4vw,40px)] font-light tracking-[-0.02em]">
          {title}
        </h1>
        <p className="mt-3 text-[14.5px] leading-relaxed text-ink-2">{body}</p>
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
