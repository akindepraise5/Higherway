"use client"

import { Eye, EyeOff, Lock, Mail } from "lucide-react"
import { useRouter } from "next/navigation"
import { useState } from "react"
import { authClient } from "../../lib/auth-client"
import { safeRedirect } from "../../lib/redirect"

/**
 * The sign-in form. The only interactive client component on the site.
 *
 * There is no "create an account" link, because there is no sign-up: accounts
 * exist because somebody already here invited them (ARCHITECTURE.md §10).
 *
 * Where to go afterwards is read at call time rather than render time, so this
 * page can be statically rendered without a Suspense boundary for
 * useSearchParams.
 */
function nextPath() {
  return safeRedirect(new URLSearchParams(window.location.search).get("redirectTo")) ?? "/admin"
}

function Field({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-line bg-paper-2 px-4 py-3.5 transition-colors focus-within:border-gold focus-within:ring-2 focus-within:ring-gold/15">
      <span className="text-taupe">{icon}</span>
      {children}
    </div>
  )
}

export function SignInForm({ disabled }: { disabled?: boolean }) {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(
    disabled ? "That account has been suspended." : null,
  )
  const router = useRouter()

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    setSubmitting(true)
    setError(null)

    const result = await authClient.signIn.email({ email, password })
    setSubmitting(false)

    if (result.error) {
      // Deliberately vague: saying which half was wrong tells someone
      // whether an address has an account here.
      setError("That email and password do not match.")
      return
    }

    router.push(nextPath())
    router.refresh()
  }

  return (
    <div>
      <h1 className="font-serif text-[clamp(30px,4vw,40px)] font-light tracking-[-0.02em]">
        Welcome back
      </h1>
      <p className="mt-2.5 text-[14.5px] text-ink-3">Sign in to manage the archive.</p>

      <form onSubmit={handleSubmit} className="mt-8 space-y-3.5">
        <Field icon={<Mail size={18} strokeWidth={1.75} />}>
          <label htmlFor="email" className="sr-only">
            Email
          </label>
          <input
            id="email"
            required
            type="email"
            autoComplete="username"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full bg-transparent text-[15px] outline-none placeholder:text-taupe"
          />
        </Field>

        <Field icon={<Lock size={18} strokeWidth={1.75} />}>
          <label htmlFor="password" className="sr-only">
            Password
          </label>
          <input
            id="password"
            required
            type={showPassword ? "text" : "password"}
            autoComplete="current-password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full bg-transparent text-[15px] outline-none placeholder:text-taupe"
          />
          <button
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            className="shrink-0 text-taupe transition-colors hover:text-ink"
            aria-label={showPassword ? "Hide password" : "Show password"}
          >
            {showPassword ? (
              <EyeOff size={18} strokeWidth={1.75} />
            ) : (
              <Eye size={18} strokeWidth={1.75} />
            )}
          </button>
        </Field>

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
          disabled={submitting}
          className="w-full rounded-full bg-ink px-6 py-4 text-[15px] font-medium text-paper-2 transition-colors hover:bg-forest-2 disabled:opacity-60"
        >
          {submitting ? "Signing in…" : "Sign in"}
        </button>
      </form>

      <p className="mt-8 text-[13px] leading-relaxed text-taupe">
        Accounts here are by invitation only. If you need one, ask someone who already has access.
      </p>
    </div>
  )
}
