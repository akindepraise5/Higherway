"use client"

import { Copy, ShieldCheck, ShieldOff, UserPlus, X } from "lucide-react"
import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"
import type { Role } from "../../lib/session"
import {
  changeRole,
  inviteUser,
  revokeInvitation,
  setAccountEnabled,
} from "../../server/services/invitations"
import type { PendingInvite, StaffRow } from "../../server/users/queries"

/**
 * Inviting people and managing who has access.
 *
 * The invitation link is shown once, in a panel that stays until dismissed,
 * because only its hash is stored — if it is closed before being copied the
 * invitation has to be reissued. That is the correct trade for an archive: a
 * database leak must not hand anyone a way in.
 */

const ROLES: { value: Role; label: string; note: string }[] = [
  { value: "editor", label: "Editor", note: "Upload, edit and categorise" },
  { value: "admin", label: "Admin", note: "Also resolve duplicates and invite" },
  { value: "owner", label: "Owner", note: "Also manage people and settings" },
]

export function PeopleManager({
  people,
  invites,
  role,
  currentUserId,
}: {
  people: StaffRow[]
  invites: PendingInvite[]
  role: Role
  currentUserId: string
}) {
  const [pending, start] = useTransition()
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null)
  const [link, setLink] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [email, setEmail] = useState("")
  const [inviteRole, setInviteRole] = useState<Role>("editor")
  const router = useRouter()

  const isOwner = role === "owner"

  const run = (action: () => Promise<{ ok: boolean; message?: string; error?: string }>) =>
    start(async () => {
      const result = await action()
      setNotice({
        ok: result.ok,
        text: result.ok ? (result.message ?? "Done.") : (result.error ?? "That did not work."),
      })
      if (result.ok) router.refresh()
    })

  const invite = () =>
    start(async () => {
      const result = await inviteUser(email, inviteRole)
      if (!result.ok) {
        setNotice({ ok: false, text: result.error })
        return
      }
      setNotice({ ok: true, text: result.message })
      setLink(result.link)
      setCopied(false)
      setEmail("")
      router.refresh()
    })

  return (
    <div className="mt-8">
      {notice ? (
        <p
          role="status"
          className={`mb-5 rounded-[3px] border-l-2 px-4 py-3 text-[13.5px] ${
            notice.ok
              ? "border-forest bg-paper-2 text-ink-2"
              : "border-[#8c2f22] bg-[#8c2f22]/5 text-[#8c2f22]"
          }`}
        >
          {notice.text}
        </p>
      ) : null}

      {link ? (
        <div className="mb-6 rounded-[3px] border border-gold bg-gold-wash/40 p-4">
          <div className="flex items-start justify-between gap-4">
            <p className="text-[13px] font-medium uppercase tracking-[.14em] text-gold">
              Invitation link — shown once
            </p>
            <button
              type="button"
              onClick={() => setLink(null)}
              className="text-taupe transition-colors hover:text-ink"
              aria-label="Dismiss the link"
            >
              <X size={16} />
            </button>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <code className="flex-1 overflow-x-auto rounded border border-line bg-paper px-3 py-2 text-[12.5px]">
              {link}
            </code>
            <button
              type="button"
              onClick={() => {
                navigator.clipboard.writeText(link).then(
                  () => setCopied(true),
                  () => setCopied(false),
                )
              }}
              className="inline-flex items-center gap-2 rounded-full bg-ink px-4 py-2 text-[13px] font-medium text-paper-2 transition-colors hover:bg-forest-2"
            >
              <Copy size={14} />
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
          <p className="mt-2.5 text-[12.5px] text-ink-3">
            Only the hash is stored, so this cannot be shown again. If it is lost, revoke the
            invitation and send a new one.
          </p>
        </div>
      ) : null}

      <div className="rounded-[3px] border border-line-soft p-4">
        <h2 className="text-[11px] font-medium uppercase tracking-[.2em] text-taupe">
          Invite someone
        </h2>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <label htmlFor="invite-email" className="sr-only">
            Email address
          </label>
          <input
            id="invite-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="them@example.com"
            className="w-64 rounded-full border border-line bg-paper-2 px-4 py-2.5 text-[14px] outline-none transition-colors focus:border-ink"
          />
          <label htmlFor="invite-role" className="sr-only">
            Role
          </label>
          <select
            id="invite-role"
            value={inviteRole}
            onChange={(e) => setInviteRole(e.target.value as Role)}
            className="rounded-full border border-line bg-paper-2 px-4 py-2.5 text-[14px]"
          >
            {ROLES.filter((r) => isOwner || r.value === "editor").map((r) => (
              <option key={r.value} value={r.value}>
                {r.label} — {r.note}
              </option>
            ))}
          </select>
          <button
            type="button"
            disabled={pending || email.trim().length === 0}
            onClick={invite}
            className="inline-flex items-center gap-2 rounded-full bg-ink px-4 py-2.5 text-[13.5px] font-medium text-paper-2 transition-colors hover:bg-forest-2 disabled:opacity-50"
          >
            <UserPlus size={15} />
            Invite
          </button>
        </div>
        {!isOwner ? (
          <p className="mt-2.5 text-[12.5px] text-taupe">
            Admins can invite Editors. Only an Owner can invite an Admin or another Owner.
          </p>
        ) : null}
      </div>

      {invites.length > 0 ? (
        <>
          <h2 className="mt-8 text-[11px] font-medium uppercase tracking-[.2em] text-taupe">
            Waiting to be accepted
          </h2>
          <div className="mt-3 overflow-hidden rounded-[3px] border border-line-soft">
            <table className="w-full border-collapse text-left">
              <tbody>
                {invites.map((i) => (
                  <tr key={i.id} className="border-b border-line-soft last:border-0">
                    <td className="px-4 py-3 text-[14px]">{i.email}</td>
                    <td className="px-4 py-3 text-[13px] text-ink-3">{i.role}</td>
                    <td className="px-4 py-3 text-[12.5px] text-taupe">
                      expires {new Date(i.expiresAt).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() => run(() => revokeInvitation(i.id))}
                        className="text-[13px] text-taupe transition-colors hover:text-[#8c2f22] disabled:opacity-40"
                      >
                        Revoke
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : null}

      <h2 className="mt-8 text-[11px] font-medium uppercase tracking-[.2em] text-taupe">
        Accounts
      </h2>
      <div className="mt-3 overflow-hidden rounded-[3px] border border-line-soft">
        <table className="w-full border-collapse text-left">
          <thead>
            <tr className="border-b border-line-soft bg-paper-2 text-[11px] font-medium uppercase tracking-[.14em] text-taupe">
              <th className="px-4 py-3 font-medium">Person</th>
              <th className="px-4 py-3 font-medium">Role</th>
              <th className="hidden px-4 py-3 font-medium sm:table-cell">Last seen</th>
              <th className="px-4 py-3 text-right font-medium">Access</th>
            </tr>
          </thead>
          <tbody>
            {people.map((person) => (
              <tr key={person.id} className="border-b border-line-soft last:border-0">
                <td className="px-4 py-3">
                  <span className="text-[15px]">{person.name}</span>
                  <span className="mt-0.5 block text-[12.5px] text-taupe">{person.email}</span>
                </td>

                <td className="px-4 py-3">
                  {isOwner && person.id !== currentUserId ? (
                    <>
                      <label htmlFor={`role-${person.id}`} className="sr-only">
                        Role for {person.name}
                      </label>
                      <select
                        id={`role-${person.id}`}
                        value={person.role}
                        disabled={pending}
                        onChange={(e) => run(() => changeRole(person.id, e.target.value as Role))}
                        className="rounded border border-line bg-paper-2 px-2 py-1.5 text-[13px]"
                      >
                        {ROLES.map((r) => (
                          <option key={r.value} value={r.value}>
                            {r.label}
                          </option>
                        ))}
                      </select>
                    </>
                  ) : (
                    <span className="text-[13px] text-ink-3">{person.role}</span>
                  )}
                </td>

                <td className="hidden px-4 py-3 text-[12.5px] text-taupe sm:table-cell">
                  {person.lastSeen ? new Date(person.lastSeen).toLocaleDateString() : "never"}
                  {person.activeSessions > 0 ? (
                    <span className="ml-2 text-forest">signed in</span>
                  ) : null}
                </td>

                <td className="px-4 py-3 text-right">
                  {person.disabledAt ? (
                    <span className="text-[12.5px] text-[#8c2f22]">suspended</span>
                  ) : (
                    <span className="text-[12.5px] text-ink-3">active</span>
                  )}
                  {isOwner && person.id !== currentUserId ? (
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() =>
                        run(() => setAccountEnabled(person.id, Boolean(person.disabledAt)))
                      }
                      className="ml-3 align-middle text-taupe transition-colors hover:text-ink disabled:opacity-40"
                      aria-label={
                        person.disabledAt ? `Restore ${person.name}` : `Suspend ${person.name}`
                      }
                    >
                      {person.disabledAt ? <ShieldCheck size={16} /> : <ShieldOff size={16} />}
                    </button>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
