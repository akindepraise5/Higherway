"use client"

import { Eye, EyeOff, Lock } from "lucide-react"
import { useRouter } from "next/navigation"
import { useState } from "react"
import { authClient } from "../../lib/auth-client"
import { acceptInvitation } from "../../server/auth/invitations"

/**
 * Choosing a password from an invitation link.
 *
 * On success it signs the person straight in rather than sending them to the
 * sign-in page to type the password they just chose — they have proved who
 * they are by following a single-use link.
 */
export function AcceptInviteForm({ token, email }: { token: string; email: string }) {
  const [password, setPassword] = useState("")
  const [confirm, setConfirm] = useState("")
  const [show, setShow] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    setError(null)

    if (password !== confirm) {
      setError("Those two passwords are not the same.")
      return
    }

    setBusy(true)
    const result = await acceptInvitation(token, password)

    if (!result.ok) {
      setBusy(false)
      setError(result.error)
      return
    }

    const signedIn = await authClient.signIn.email({ email, password })
    setBusy(false)

    if (signedIn.error) {
      // The password was set even though signing in did not take — say so,
      // rather than leaving them thinking nothing happened.
      router.push("/sign-in")
      return
    }

    router.push("/admin")
    router.refresh()
  }

  return (
    <div>
      <h1 className="font-serif text-[clamp(30px,4vw,40px)] font-light tracking-[-0.02em]">
        Choose a password
      </h1>
      <p className="mt-2.5 text-[14.5px] text-ink-3">
        For <span className="text-ink">{email}</span>. This link works once.
      </p>

      <form onSubmit={handleSubmit} className="mt-8 space-y-3.5">
        <div className="flex items-center gap-3 rounded-xl border border-line bg-paper-2 px-4 py-3.5 transition-colors focus-within:border-gold focus-within:ring-2 focus-within:ring-gold/15">
          <span className="text-taupe">
            <Lock size={18} strokeWidth={1.75} />
          </span>
          <label htmlFor="password" className="sr-only">
            New password
          </label>
          <input
            id="password"
            required
            minLength={10}
            type={show ? "text" : "password"}
            autoComplete="new-password"
            placeholder="At least 10 characters"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full bg-transparent text-[15px] outline-none placeholder:text-taupe"
          />
          <button
            type="button"
            onClick={() => setShow((v) => !v)}
            className="shrink-0 text-taupe transition-colors hover:text-ink"
            aria-label={show ? "Hide password" : "Show password"}
          >
            {show ? <EyeOff size={18} strokeWidth={1.75} /> : <Eye size={18} strokeWidth={1.75} />}
          </button>
        </div>

        <div className="flex items-center gap-3 rounded-xl border border-line bg-paper-2 px-4 py-3.5 transition-colors focus-within:border-gold focus-within:ring-2 focus-within:ring-gold/15">
          <span className="text-taupe">
            <Lock size={18} strokeWidth={1.75} />
          </span>
          <label htmlFor="confirm" className="sr-only">
            Confirm password
          </label>
          <input
            id="confirm"
            required
            type={show ? "text" : "password"}
            autoComplete="new-password"
            placeholder="Type it again"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            className="w-full bg-transparent text-[15px] outline-none placeholder:text-taupe"
          />
        </div>

        {error ? (
          <p
            role="alert"
            className="rounded-lg border-l-2 border-[#8c2f22] bg-[#8c2f22]/5 px-4 py-3 text-sm text-[#8c2f22]"
          >
            {error}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={busy}
          className="w-full rounded-full bg-ink px-6 py-4 text-[15px] font-medium text-paper-2 transition-colors hover:bg-forest-2 disabled:opacity-60"
        >
          {busy ? "Setting it up…" : "Set password and sign in"}
        </button>
      </form>
    </div>
  )
}
