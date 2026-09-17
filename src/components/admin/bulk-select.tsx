"use client"

import { Loader2, X } from "lucide-react"
import { useRouter } from "next/navigation"
import { createContext, useCallback, useContext, useMemo, useState, useTransition } from "react"
import { archiveMany, fileManyUnder, publishMany } from "../../server/services/materials"
import { TopicSelect } from "./topic-select"

/**
 * Acting on several materials at once, from the list.
 *
 * **Why.** 314 published materials have no topic. Filing them one at a time is
 * one page load, one picker and one round trip each — the archive's main
 * outstanding job, turned into a thousand small errands by the interface.
 *
 * **How it fits a Server Component page.** Selection is client state and the
 * table is rendered on the server, so this is a provider wrapping the table and
 * a checkbox inside each row that reads the same context. The rows stay server
 * components; nothing about the materials list ships to the browser that was not
 * already there.
 *
 * **Nothing here is wide and silent.** The bar names the count in every button,
 * archiving asks for its reason before it will run, and the services write one
 * audit entry per material rather than one for the operation. That is a direct
 * lesson from this project: a category merge moved 42 materials with a single
 * UPDATE, recorded how many moved but not which, and was recoverable only
 * because the v1 spreadsheet still existed.
 */

type Selection = {
  chosen: Set<string>
  toggle: (id: string) => void
  busy: boolean
}

const Context = createContext<Selection | null>(null)

export type BulkTopic = { id: string; name: string; total: number }

export function BulkSelect({
  ids,
  topics,
  canModerate,
  children,
}: {
  /** Every material on this page, so "select all" means what is on screen. */
  ids: string[]
  topics: BulkTopic[]
  /** Publishing and archiving are Admin work; filing is not. */
  canModerate: boolean
  children: React.ReactNode
}) {
  const [chosen, setChosen] = useState<Set<string>>(new Set())
  const [pending, start] = useTransition()
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null)
  const [mode, setMode] = useState<"none" | "file" | "archive">("none")
  const [reason, setReason] = useState("")
  const router = useRouter()

  // Stable, so the context value only changes when the selection itself does —
  // every row reads this context, and a new function each render would rerender
  // all forty checkboxes on every keystroke in the archive reason field.
  const toggle = useCallback((id: string) => {
    setChosen((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const value = useMemo<Selection>(
    () => ({ chosen, toggle, busy: pending }),
    [chosen, toggle, pending],
  )

  const list = [...chosen]
  const allOnPage = ids.length > 0 && ids.every((id) => chosen.has(id))

  const run = (action: () => Promise<{ ok: boolean; message?: string; error?: string }>) =>
    start(async () => {
      const result = await action()
      setNotice({
        ok: result.ok,
        text: result.ok ? (result.message ?? "Done.") : (result.error ?? "That did not work."),
      })
      if (result.ok) {
        // Cleared only on success. After a failure the selection is still what
        // the person meant, and making them rebuild it is a second punishment.
        setChosen(new Set())
        setMode("none")
        setReason("")
        router.refresh()
      }
    })

  return (
    <Context.Provider value={value}>
      {notice ? (
        <p
          role="status"
          className={`mt-4 rounded-[3px] border-l-2 px-4 py-3 text-[13.5px] ${
            notice.ok
              ? "border-forest bg-paper-2 text-ink-2"
              : "border-[#8c2f22] bg-[#8c2f22]/5 text-[#8c2f22]"
          }`}
        >
          {notice.text}
        </p>
      ) : null}

      {chosen.size > 0 ? (
        <div className="sticky top-[72px] z-30 mt-4 rounded-[4px] border border-ink bg-paper-2 px-4 py-3 shadow-sm">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <p className="text-[13.5px] font-medium">
              {chosen.size} selected
              {allOnPage ? " — everything on this page" : ""}
            </p>

            {/* "Select all" lives here as well as in the table header, because
                the bar is sticky and the header is not: once the bar is up and
                the page is scrolled, the header checkbox is underneath it. */}
            {!allOnPage ? (
              <button
                type="button"
                disabled={pending}
                onClick={() => setChosen(new Set(ids))}
                className="text-[12.5px] text-taupe underline-offset-2 transition-colors hover:text-ink hover:underline disabled:opacity-40"
              >
                Select all {ids.length} on this page
              </button>
            ) : null}

            <button
              type="button"
              onClick={() => setChosen(new Set())}
              className="inline-flex items-center gap-1 text-[12.5px] text-taupe transition-colors hover:text-ink"
            >
              <X size={12} />
              Clear
            </button>

            <span className="ml-auto flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={pending}
                onClick={() => setMode(mode === "file" ? "none" : "file")}
                className="rounded-full border border-line px-3.5 py-1.5 text-[12.5px] text-ink-2 transition-colors hover:border-ink disabled:opacity-40"
              >
                File {chosen.size} under a topic
              </button>

              {canModerate ? (
                <>
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => run(() => publishMany(list))}
                    className="rounded-full bg-ink px-3.5 py-1.5 text-[12.5px] font-medium text-paper-2 transition-colors hover:bg-forest-2 disabled:opacity-40"
                  >
                    {pending ? (
                      <Loader2 size={13} className="animate-spin" />
                    ) : (
                      `Publish ${chosen.size}`
                    )}
                  </button>
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => setMode(mode === "archive" ? "none" : "archive")}
                    className="rounded-full border border-line px-3.5 py-1.5 text-[12.5px] text-[#8c2f22] transition-colors hover:border-[#8c2f22] disabled:opacity-40"
                  >
                    Take {chosen.size} out
                  </button>
                </>
              ) : null}
            </span>
          </div>

          {mode === "file" ? (
            <div className="mt-3 max-w-sm border-t border-line-soft pt-3">
              <TopicSelect
                topics={topics}
                selected={[]}
                disabled={pending}
                /* Selecting a topic *is* the action: there is no second button,
                   because a picker that needs confirming is two decisions for
                   one intent. The count is in the label above it. */
                onSelect={(topic) => run(() => fileManyUnder(list, topic.id))}
                onDeselect={() => {}}
                placeholder={`Choose a topic for ${chosen.size}…`}
              />
            </div>
          ) : null}

          {mode === "archive" ? (
            <form
              className="mt-3 max-w-lg border-t border-line-soft pt-3"
              onSubmit={(event) => {
                event.preventDefault()
                run(() => archiveMany(list, reason))
              }}
            >
              <label htmlFor="bulk-reason" className="block text-[12.5px] text-ink-2">
                Why are these {chosen.size} coming out of the library?
              </label>
              <p className="mt-1 text-[11.5px] leading-relaxed text-taupe">
                It is recorded against every one of them, and shown on each one's page. They can all
                be restored.
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                <input
                  id="bulk-reason"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Duplicated elsewhere, wrong scan, withdrawn…"
                  className="min-w-0 flex-1 rounded-[4px] border border-line bg-paper px-3 py-2 text-[13.5px] outline-none transition-colors focus:border-ink"
                />
                <button
                  type="submit"
                  disabled={pending || reason.trim().length < 3}
                  className="rounded-full bg-[#8c2f22] px-4 py-2 text-[12.5px] font-medium text-paper-2 transition-opacity disabled:opacity-40"
                >
                  Take {chosen.size} out
                </button>
              </div>
            </form>
          ) : null}
        </div>
      ) : null}

      {children}
    </Context.Provider>
  )
}

/** The header checkbox: everything on this page, or nothing. */
export function SelectAll({ ids }: { ids: string[] }) {
  const selection = useContext(Context)
  if (!selection) return null

  const all = ids.length > 0 && ids.every((id) => selection.chosen.has(id))

  return (
    <input
      type="checkbox"
      checked={all}
      disabled={selection.busy}
      aria-label={all ? "Clear the selection" : "Select everything on this page"}
      onChange={() => {
        for (const id of ids) {
          const has = selection.chosen.has(id)
          if (all ? has : !has) selection.toggle(id)
        }
      }}
      className="h-4 w-4 cursor-pointer accent-ink"
    />
  )
}

/** One row's checkbox. Server-rendered rows can carry it; it reads the context. */
export function RowSelect({ id, title }: { id: string; title: string }) {
  const selection = useContext(Context)
  if (!selection) return null

  return (
    <input
      type="checkbox"
      checked={selection.chosen.has(id)}
      disabled={selection.busy}
      aria-label={`Select ${title}`}
      onChange={() => selection.toggle(id)}
      className="h-4 w-4 cursor-pointer accent-ink"
    />
  )
}
