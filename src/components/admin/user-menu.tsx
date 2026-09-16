"use client"

import { ChevronDown, LogOut, User } from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useEffect, useRef, useState } from "react"
import { authClient } from "../../lib/auth-client"

/**
 * The account menu, where every dashboard keeps it.
 *
 * This replaces a bare email and a flat "Sign out" link sitting side by side in
 * the header. Those read as two unrelated pieces of furniture; people look for
 * their initials in the top-right corner and expect a menu under them.
 *
 * Closes on Escape and on a click elsewhere, and the trigger keeps focus so a
 * keyboard can reach both items.
 */

const initialsOf = (name: string) =>
  name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("") || "?"

export function UserMenu({ name, email, role }: { name: string; email: string; role: string }) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)
  const router = useRouter()

  useEffect(() => {
    if (!open) return

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false)
    }
    const onClick = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false)
    }

    document.addEventListener("keydown", onKey)
    // Deferred, so the click that opened it does not close it again.
    const id = setTimeout(() => document.addEventListener("mousedown", onClick), 0)
    return () => {
      document.removeEventListener("keydown", onKey)
      document.removeEventListener("mousedown", onClick)
      clearTimeout(id)
    }
  }, [open])

  const signOut = async () => {
    setBusy(true)
    await authClient.signOut()
    router.push("/sign-in")
    router.refresh()
  }

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
        className="flex items-center gap-2 rounded-full border border-line-soft py-1 pl-1 pr-2.5 transition-colors hover:border-line"
      >
        <span
          aria-hidden="true"
          className="grid h-7 w-7 flex-none place-items-center rounded-full bg-forest font-medium text-[11px] text-paper-2"
        >
          {initialsOf(name)}
        </span>
        <span className="sr-only">Your account</span>
        <ChevronDown
          size={14}
          className={`text-taupe transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open ? (
        <div
          role="menu"
          className="absolute right-0 top-full z-50 mt-2 w-60 overflow-hidden rounded-[6px] border border-line bg-paper shadow-[0_1px_2px_rgba(20,26,23,.08),0_24px_50px_-28px_rgba(20,26,23,.5)]"
        >
          <div className="border-b border-line-soft px-4 py-3">
            <p className="truncate text-[14px] text-ink">{name}</p>
            <p className="mt-0.5 truncate text-[12.5px] text-taupe">{email}</p>
            <span className="mt-2 inline-block rounded-full bg-paper-3 px-2 py-0.5 text-[10px] font-medium uppercase tracking-[.16em] text-taupe">
              {role}
            </span>
          </div>

          <Link
            href="/admin/profile"
            role="menuitem"
            onClick={() => setOpen(false)}
            className="flex items-center gap-2.5 px-4 py-2.5 text-[13.5px] text-ink-2 transition-colors hover:bg-paper-2"
          >
            <User size={15} />
            Your profile
          </Link>

          <button
            type="button"
            role="menuitem"
            disabled={busy}
            onClick={signOut}
            className="flex w-full items-center gap-2.5 border-t border-line-soft px-4 py-2.5 text-left text-[13.5px] text-ink-2 transition-colors hover:bg-paper-2 disabled:opacity-60"
          >
            <LogOut size={15} />
            {busy ? "Signing out…" : "Sign out"}
          </button>
        </div>
      ) : null}
    </div>
  )
}
