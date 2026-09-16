"use client"

import { useRouter } from "next/navigation"
import { useState } from "react"
import { authClient } from "../../lib/auth-client"

/**
 * Your own account: the name people see next to your changes, and your password.
 *
 * Both live here rather than in People, because People is for acting on *other*
 * accounts and needs a higher role. Everyone can edit their own.
 *
 * The name matters more than it looks: it is what the audit trail and the
 * materials table print against every change you make.
 */

type Notice = { ok: boolean; text: string } | null

const MIN_PASSWORD = 8

export function ProfileForm({ name, email }: { name: string; email: string }) {
  const router = useRouter()

  const [fullName, setFullName] = useState(name)
  const [savingName, setSavingName] = useState(false)
  const [nameNotice, setNameNotice] = useState<Notice>(null)

  const [current, setCurrent] = useState("")
  const [next, setNext] = useState("")
  const [confirm, setConfirm] = useState("")
  const [savingPassword, setSavingPassword] = useState(false)
  const [passwordNotice, setPasswordNotice] = useState<Notice>(null)

  const saveName = async (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = fullName.trim()
    if (trimmed.length < 2) {
      setNameNotice({ ok: false, text: "A name needs at least two characters." })
      return
    }

    setSavingName(true)
    setNameNotice(null)
    const { error } = await authClient.updateUser({ name: trimmed })
    setSavingName(false)

    if (error) {
      setNameNotice({ ok: false, text: error.message ?? "That could not be saved." })
      return
    }
    setNameNotice({ ok: true, text: "Saved." })
    // The header and every greeting read the session, so re-fetch it.
    router.refresh()
  }

  const savePassword = async (e: React.FormEvent) => {
    e.preventDefault()

    if (next.length < MIN_PASSWORD) {
      setPasswordNotice({
        ok: false,
        text: `A new password needs at least ${MIN_PASSWORD} characters.`,
      })
      return
    }
    if (next !== confirm) {
      setPasswordNotice({ ok: false, text: "The two new passwords do not match." })
      return
    }
    if (next === current) {
      setPasswordNotice({ ok: false, text: "That is already your password." })
      return
    }

    setSavingPassword(true)
    setPasswordNotice(null)
    const { error } = await authClient.changePassword({
      currentPassword: current,
      newPassword: next,
      // A password change is often a response to a password being seen by
      // someone else, so ending the other sessions is the useful default.
      revokeOtherSessions: true,
    })
    setSavingPassword(false)

    if (error) {
      setPasswordNotice({
        ok: false,
        text: error.message ?? "That did not work. Check your current password.",
      })
      return
    }

    setCurrent("")
    setNext("")
    setConfirm("")
    setPasswordNotice({
      ok: true,
      text: "Password changed. Any other device you were signed in on has been signed out.",
    })
  }

  return (
    <div className="mt-10 grid gap-12 lg:max-w-2xl">
      <section>
        <h2 className="text-[11px] font-medium uppercase tracking-[.2em] text-taupe">
          Your details
        </h2>

        <form onSubmit={saveName} className="mt-4">
          <label htmlFor="name" className="block text-[13px] text-ink-2">
            Name
          </label>
          <input
            id="name"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            autoComplete="name"
            className="mt-1.5 w-full max-w-sm rounded-[4px] border border-line bg-paper-2 px-3.5 py-2.5 text-[14.5px] outline-none transition-colors focus:border-ink"
          />
          <p className="mt-1.5 text-[12px] text-taupe">
            This is the name shown against everything you change.
          </p>

          <label htmlFor="email" className="mt-5 block text-[13px] text-ink-2">
            Email
          </label>
          <input
            id="email"
            value={email}
            readOnly
            disabled
            className="mt-1.5 w-full max-w-sm cursor-not-allowed rounded-[4px] border border-line-soft bg-paper-3 px-3.5 py-2.5 text-[14.5px] text-taupe"
          />
          <p className="mt-1.5 text-[12px] text-taupe">
            Your email is how you sign in, so it cannot be changed here. Ask an owner.
          </p>

          <div className="mt-5 flex items-center gap-3">
            <button
              type="submit"
              disabled={savingName || fullName.trim() === name}
              className="rounded-full bg-ink px-5 py-2.5 text-[13.5px] font-medium text-paper-2 transition-colors hover:bg-forest-2 disabled:opacity-40"
            >
              {savingName ? "Saving…" : "Save"}
            </button>
            {nameNotice ? (
              <p
                role="status"
                className={`text-[13px] ${nameNotice.ok ? "text-ink-3" : "text-[#8c2f22]"}`}
              >
                {nameNotice.text}
              </p>
            ) : null}
          </div>
        </form>
      </section>

      <section className="border-t border-line-soft pt-10">
        <h2 className="text-[11px] font-medium uppercase tracking-[.2em] text-taupe">Password</h2>

        <form onSubmit={savePassword} className="mt-4 max-w-sm">
          <label htmlFor="current" className="block text-[13px] text-ink-2">
            Current password
          </label>
          <input
            id="current"
            type="password"
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
            autoComplete="current-password"
            required
            className="mt-1.5 w-full rounded-[4px] border border-line bg-paper-2 px-3.5 py-2.5 text-[14.5px] outline-none transition-colors focus:border-ink"
          />

          <label htmlFor="next" className="mt-5 block text-[13px] text-ink-2">
            New password
          </label>
          <input
            id="next"
            type="password"
            value={next}
            onChange={(e) => setNext(e.target.value)}
            autoComplete="new-password"
            minLength={MIN_PASSWORD}
            required
            className="mt-1.5 w-full rounded-[4px] border border-line bg-paper-2 px-3.5 py-2.5 text-[14.5px] outline-none transition-colors focus:border-ink"
          />
          <p className="mt-1.5 text-[12px] text-taupe">
            At least {MIN_PASSWORD} characters. A phrase you can remember beats something short and
            clever.
          </p>

          <label htmlFor="confirm" className="mt-5 block text-[13px] text-ink-2">
            New password again
          </label>
          <input
            id="confirm"
            type="password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            autoComplete="new-password"
            required
            className="mt-1.5 w-full rounded-[4px] border border-line bg-paper-2 px-3.5 py-2.5 text-[14.5px] outline-none transition-colors focus:border-ink"
          />

          <div className="mt-5 flex flex-wrap items-center gap-3">
            <button
              type="submit"
              disabled={savingPassword || !current || !next || !confirm}
              className="rounded-full bg-ink px-5 py-2.5 text-[13.5px] font-medium text-paper-2 transition-colors hover:bg-forest-2 disabled:opacity-40"
            >
              {savingPassword ? "Changing…" : "Change password"}
            </button>
            {passwordNotice ? (
              <p
                role="status"
                className={`text-[13px] ${passwordNotice.ok ? "text-ink-3" : "text-[#8c2f22]"}`}
              >
                {passwordNotice.text}
              </p>
            ) : null}
          </div>
        </form>
      </section>
    </div>
  )
}
