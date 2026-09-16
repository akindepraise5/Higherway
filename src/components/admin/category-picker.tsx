"use client"

import { Plus, X } from "lucide-react"
import { useRouter } from "next/navigation"
import { useMemo, useState, useTransition } from "react"
import { assignCategory, unassignCategory } from "../../server/services/materials"

/**
 * Filing a material, without leaving the page.
 *
 * 367 of the 651 imported materials arrived with no topic, because the v1
 * spreadsheet said "Review manually" against them. Clearing that backlog is the
 * archive's main outstanding job, so this is built for repetition: type, see
 * what matches, pick it or create it, move on.
 *
 * Creating from here is deliberate. Making an editor go to Categories, add a
 * topic and come back is exactly how a material ends up left uncategorised.
 */

type Topic = { id: string; name: string }

export function CategoryPicker({
  materialId,
  assigned,
  all,
}: {
  materialId: string
  assigned: Topic[]
  all: Topic[]
}) {
  const [pending, start] = useTransition()
  const [term, setTerm] = useState("")
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null)
  const router = useRouter()

  const assignedIds = useMemo(() => new Set(assigned.map((t) => t.id)), [assigned])
  const query = term.trim().toLowerCase()

  const matches = useMemo(
    () =>
      query
        ? all
            .filter((t) => !assignedIds.has(t.id) && t.name.toLowerCase().includes(query))
            .slice(0, 8)
        : [],
    [all, assignedIds, query],
  )

  // Offer to create only when nothing matches exactly — so a near-duplicate
  // topic is seen before another one is made.
  const canCreate = query.length >= 2 && !all.some((t) => t.name.toLowerCase() === query)

  const run = (action: () => Promise<{ ok: boolean; message?: string; error?: string }>) =>
    start(async () => {
      const result = await action()
      setNotice({
        ok: result.ok,
        text: result.ok ? (result.message ?? "Done.") : (result.error ?? "That did not work."),
      })
      if (result.ok) {
        setTerm("")
        router.refresh()
      }
    })

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        {assigned.length === 0 ? (
          <span className="rounded-full bg-gold-wash px-3 py-1.5 text-[12.5px] text-gold">
            Uncategorised
          </span>
        ) : (
          assigned.map((topic) => (
            <span
              key={topic.id}
              className="inline-flex items-center gap-1.5 rounded-full border border-line px-3 py-1.5 text-[12.5px] text-ink-2"
            >
              {topic.name}
              <button
                type="button"
                disabled={pending}
                onClick={() => run(() => unassignCategory(materialId, topic.id))}
                className="text-taupe transition-colors hover:text-[#8c2f22] disabled:opacity-40"
                aria-label={`Remove from ${topic.name}`}
              >
                <X size={13} />
              </button>
            </span>
          ))
        )}
      </div>

      <div className="relative mt-3 max-w-sm">
        <label htmlFor="topic-search" className="sr-only">
          Find or create a topic
        </label>
        <input
          id="topic-search"
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          placeholder="File under a topic…"
          autoComplete="off"
          className="w-full rounded-full border border-line bg-paper-2 px-4 py-2.5 text-[14px] outline-none transition-colors focus:border-ink"
        />

        {query.length > 0 ? (
          <div className="absolute left-0 right-0 top-full z-10 mt-1.5 overflow-hidden rounded-[4px] border border-line bg-paper shadow-lg">
            {matches.map((topic) => (
              <button
                key={topic.id}
                type="button"
                disabled={pending}
                onClick={() => run(() => assignCategory(materialId, { categoryId: topic.id }))}
                className="flex w-full items-center px-4 py-2.5 text-left text-[14px] transition-colors hover:bg-paper-2 disabled:opacity-50"
              >
                {topic.name}
              </button>
            ))}

            {canCreate ? (
              <button
                type="button"
                disabled={pending}
                onClick={() => run(() => assignCategory(materialId, { newName: term.trim() }))}
                className="flex w-full items-center gap-2 border-t border-line-soft px-4 py-2.5 text-left text-[14px] text-gold transition-colors hover:bg-paper-2 disabled:opacity-50"
              >
                <Plus size={14} />
                Create “{term.trim()}” and file it here
              </button>
            ) : null}

            {matches.length === 0 && !canCreate ? (
              <p className="px-4 py-2.5 text-[13px] text-taupe">Already filed there.</p>
            ) : null}
          </div>
        ) : null}
      </div>

      {notice ? (
        <p
          role="status"
          className={`mt-3 text-[13px] ${notice.ok ? "text-ink-3" : "text-[#8c2f22]"}`}
        >
          {notice.text}
        </p>
      ) : null}
    </div>
  )
}
