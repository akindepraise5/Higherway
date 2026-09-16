import type { Metadata } from "next"
import { AuthShell } from "../../components/auth/auth-shell"
import { SignInForm } from "../../components/auth/sign-in-form"

/**
 * Staff sign-in.
 *
 * Deliberately not linked from anywhere on the public site — not the masthead,
 * not the footer, not the sitemap. Readers never need it, and an archive's
 * front page should not advertise its back door.
 *
 * `src/proxy.ts` bounces anyone already signed in straight to /admin.
 */
export const metadata: Metadata = {
  title: "Sign in",
  robots: { index: false, follow: false },
}

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ disabled?: string }>
}) {
  const { disabled } = await searchParams

  return (
    <AuthShell>
      <SignInForm disabled={disabled === "1"} />
    </AuthShell>
  )
}
