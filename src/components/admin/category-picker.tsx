"use client"

import { X } from "lucide-react"
import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"
import { timeAgo, who } from "../../lib/when"
import { assignCategory, unassignCategory } from "../../server/services/materials"
import { TopicSelect } from "./topic-select"

/**
 * Filing a material, without leaving the page.
 *
 * 367 of the 651 imported materials arrived with no topic, because the v1
 * spreadsheet said "Review manually" against them. Clearing that backlog is the
 * archive's main outstanding job, so this is built for repetition: open it, see
 * every shelf, pick one or create it, move on.
 *
 * Creating from here is deliberate — making someone go to Categories, add a
 * topic and come back is exactly how a material ends up left uncategorised —
 * but it is Owner-only, because a topic is a public URL and a shelf in the
 * library. Everyone else files into the topics that already exist.
 *
 * The control itself is `TopicSelect`. It used to be a bare input whose menu
 * only appeared once you had typed: 69 topics, none of them visible, and no way
 * to browse them. Filing a backlog is the one job this page exists for, and it
 * was asking people to remember the shelf names.
 */

type Topic = { id: string; name: string }

/**
 * A filed topic carries who filed it and when. Both already sit on the join
 * row, so naming the person costs a join rather than a new column.
 */
type Filed = Topic & {
  byName?: string | null
  byEmail?: string | null
  at?: Date | null
}

export function CategoryPicker({
  materialId,
  assigned,
  all,
  mayCreate,
}: {
  materialId: string
  assigned: Filed[]
  all: Topic[]
  /** Owner only. The service refuses either way; this decides what is offered. */
  mayCreate: boolean
}) {
  const [pending, start] = useTransition()
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null)
  const router = useRouter()

  const run = (action: () => Promise<{ ok: boolean; message?: string; error?: string }>) =>
    start(async () => {
      const result = await action()
      setNotice({
        ok: result.ok,
        text: result.ok ? (result.message ?? "Done.") : (result.error ?? "That did not work."),
      })
      if (result.ok) router.refresh()
    })

  return (
    <div>
      {assigned.length === 0 ? (
        <p className="rounded-[4px] bg-gold-wash px-3 py-2 text-[12.5px] text-gold">
          Uncategorised
        </p>
      ) : (
        /* A list rather than pills: each row names who filed it and when, which
           answers "why is this here?" without opening the history. */
        <ul className="flex flex-col gap-1.5">
          {assigned.map((topic) => (
            <li
              key={topic.id}
              className="flex items-start justify-between gap-2 rounded-[4px] border border-line px-3 py-2"
            >
              <span className="min-w-0">
                <span className="block truncate text-[13px] text-ink-2">{topic.name}</span>
                {topic.byName || topic.byEmail || topic.at ? (
                  <span className="mt-0.5 block text-[11px] text-taupe">
                    {who(topic.byName ?? null, topic.byEmail ?? null)}
                    {topic.at ? ` · ${timeAgo(new Date(topic.at))}` : ""}
                  </span>
                ) : null}
              </span>
              <button
                type="button"
                disabled={pending}
                onClick={() => run(() => unassignCategory(materialId, topic.id))}
                className="mt-0.5 flex-none text-taupe transition-colors hover:text-[#8c2f22] disabled:opacity-40"
                aria-label={`Remove from ${topic.name}`}
              >
                <X size={13} />
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-3">
        <TopicSelect
          id="topic-select"
          topics={all}
          selected={assigned.map((t) => t.id)}
          onSelect={(topic) => run(() => assignCategory(materialId, { categoryId: topic.id }))}
          onDeselect={(topic) => run(() => unassignCategory(materialId, topic.id))}
          onCreate={
            mayCreate
              ? (name) => run(() => assignCategory(materialId, { newName: name }))
              : undefined
          }
          disabled={pending}
          placeholder="File under a topic…"
        />
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
