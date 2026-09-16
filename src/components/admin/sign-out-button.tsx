"use client"

import { useRouter } from "next/navigation"
import { useState } from "react"
import { authClient } from "../../lib/auth-client"

export function SignOutButton() {
  const [busy, setBusy] = useState(false)
  const router = useRouter()

  return (
    <button
      type="button"
      disabled={busy}
      onClick={async () => {
        setBusy(true)
        await authClient.signOut()
        router.push("/sign-in")
        router.refresh()
      }}
      className="text-[13px] text-taupe transition-colors hover:text-ink disabled:opacity-60"
    >
      {busy ? "Signing out…" : "Sign out"}
    </button>
  )
}
